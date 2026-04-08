import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Send, Bot, User, Loader2, CheckCircle2, AlertCircle,
  ChevronDown, ImageIcon, Layers, Type, Square, ExternalLink,
} from 'lucide-react'
import { useEditorStore } from '../stores/useEditorStore'
import type {
  ChatMessage, WorkflowStage, WorkflowStageStatus, LayoutElement,
} from '../stores/useEditorStore'
import { useCanvasCommands } from '../hooks/useCanvasCommands'
import type { Command } from '../hooks/useCanvasCommands'
import { connectSse } from '@/features/generation/services/sseClient'
import { serializeCanvas } from '@/features/generation/services/canvasSerializer'
import { compileJsx, renderToHiddenDom } from '@/features/generation/services/jsxCompiler'
import { convertDomToCanvas } from '@/engine/index'
import { getGlobalCanvas } from '../canvasRegistry'
import React from 'react'
import * as ReactDOMClient from 'react-dom/client'

/* ══════════════════════════════════════════════════════════════════
 *  工作流阶段状态图标
 * ══════════════════════════════════════════════════════════════════ */

/** 根据阶段状态渲染对应图标（spinner / 勾选 / 错误 / 空圈） */
function StageStatusIcon({ status, isActive }: { status: WorkflowStageStatus; isActive: boolean }) {
  // 生成中且阶段为 active → 转圈动画
  if (isActive) {
    return <Loader2 size={14} className="text-blue-500 animate-spin flex-shrink-0" />
  }
  switch (status) {
    case 'complete':
      return <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
    case 'error':
      return <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
    case 'active':
      return <Loader2 size={14} className="text-blue-500 animate-spin flex-shrink-0" />
    default:
      // pending：灰色空圈
      return <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-200 flex-shrink-0" />
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  布局元素小圆点颜色
 * ══════════════════════════════════════════════════════════════════ */

function elementDotColor(type: LayoutElement['type']): string {
  switch (type) {
    case 'text': return 'bg-blue-400'
    case 'image': return 'bg-emerald-400'
    case 'shape': return 'bg-amber-400'
    default: return 'bg-gray-400'
  }
}

/** 布局元素类型的中文显示名 */
function elementTypeLabel(el: LayoutElement): string {
  switch (el.type) {
    case 'text': return `文本 ${el.label}`
    case 'image': return '图片'
    case 'shape': return '形状'
    default: return el.label
  }
}

/** 布局元素类型图标 */
function ElementIcon({ type }: { type: LayoutElement['type'] }) {
  switch (type) {
    case 'text': return <Type size={10} className="text-blue-400" />
    case 'image': return <ImageIcon size={10} className="text-emerald-400" />
    case 'shape': return <Square size={10} className="text-amber-400" />
    default: return null
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  阶段卡片的边框颜色
 * ══════════════════════════════════════════════════════════════════ */

function stageBorderColor(status: WorkflowStageStatus): string {
  switch (status) {
    case 'complete': return 'border-green-100'
    case 'active': return 'border-blue-200'
    case 'error': return 'border-red-200'
    default: return 'border-gray-100'
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  单个工作流阶段卡片（可展开/折叠）
 * ══════════════════════════════════════════════════════════════════ */

function StageCard({ stage, analysisContent, isGenerating }: {
  stage: WorkflowStage
  /** 需求分析阶段用：实时累积的分析文本 */
  analysisContent?: string
  isGenerating: boolean
}) {
  const [expanded, setExpanded] = useState(false)

  // 判断该阶段是否有可展开的内容
  const hasContent =
    (stage.id === 'search' && !!stage.details && stage.details.length > 0) ||
    (stage.id === 'analysis' && !!analysisContent) ||
    (stage.id === 'layout' && !!stage.elements && stage.elements.length > 0) ||
    (stage.id === 'image_gen' && !!stage.details && stage.details.length > 0)

  const canExpand = hasContent && stage.status !== 'pending'

  return (
    <div className={`rounded-lg border ${stageBorderColor(stage.status)} overflow-hidden bg-white`}>
      {/* ── 阶段标题行 ─────────────────────────────────────────── */}
      <button
        onClick={() => canExpand && setExpanded(!expanded)}
        className={`
          flex items-center gap-2 w-full px-3 py-2 text-left text-xs
          ${canExpand ? 'cursor-pointer hover:bg-gray-50' : 'cursor-default'}
          transition-colors
        `}
      >
        <StageStatusIcon
          status={stage.status}
          isActive={isGenerating && stage.status === 'active'}
        />
        <span className="font-medium text-gray-700">{stage.label}</span>
        {stage.summary && (
          <span className="text-[10px] text-gray-400 ml-1 truncate">{stage.summary}</span>
        )}
        <div className="flex-1" />
        {canExpand && (
          <ChevronDown
            size={12}
            className={`text-gray-300 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        )}
      </button>

      {/* ── 可展开内容区 ───────────────────────────────────────── */}
      {expanded && (
        <div className="px-3 pb-2.5 border-t border-gray-50">
          {/* 联网搜索：搜索结果标题列表 */}
          {stage.id === 'search' && stage.details && (
            <div className="space-y-1 mt-2">
              {stage.details.map((title, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] text-gray-500">
                  <ExternalLink size={9} className="text-blue-400 flex-shrink-0" />
                  <span className="truncate">{title}</span>
                </div>
              ))}
            </div>
          )}

          {/* 需求分析：设计方案文本 */}
          {stage.id === 'analysis' && analysisContent && (
            <div className="text-[10px] leading-relaxed text-gray-600 max-h-48 overflow-auto mt-2 whitespace-pre-wrap bg-gray-50 rounded p-2">
              {analysisContent.slice(0, 3000)}
              {analysisContent.length > 3000 && '\n...（内容已截断）'}
            </div>
          )}

          {/* 页面布局：元素列表 */}
          {stage.id === 'layout' && stage.elements && (
            <div className="space-y-1 mt-2">
              {stage.elements.map((el, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] text-gray-600">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${elementDotColor(el.type)}`} />
                  <ElementIcon type={el.type} />
                  <span>{elementTypeLabel(el)}</span>
                </div>
              ))}
            </div>
          )}

          {/* 图片生成：进度详情 */}
          {stage.id === 'image_gen' && stage.details && (
            <div className="space-y-0.5 mt-2">
              {stage.details.map((detail, i) => (
                <div key={i} className="text-[10px] text-gray-500 flex items-center gap-1.5">
                  <ImageIcon size={9} className="text-emerald-400 flex-shrink-0" />
                  <span>{detail}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
 *  工作流阶段组
 * ══════════════════════════════════════════════════════════════════ */

function WorkflowSection({ stages, analysisContent, isGenerating }: {
  stages: WorkflowStage[]
  analysisContent: string
  isGenerating: boolean
}) {
  // 过滤：图片生成阶段仅在被激活后显示（status 非 pending）
  // 搜索阶段始终显示，未启用时会被标记为"跳过"
  const visibleStages = stages.filter(
    (s) => s.id !== 'image_gen' || s.status !== 'pending'
  )

  if (visibleStages.length === 0) return null

  return (
    <div className="space-y-1.5 px-2 py-1.5">
      {visibleStages.map((stage) => (
        <StageCard
          key={stage.id}
          stage={stage}
          analysisContent={stage.id === 'analysis' ? analysisContent : undefined}
          isGenerating={isGenerating}
        />
      ))}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════
 *  ChatDialog 主组件
 * ══════════════════════════════════════════════════════════════════ */

export function ChatDialog() {
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const posterSize = useEditorStore((s) => s.posterSize)
  const chatHistory = useEditorStore((s) => s.chatHistory)
  const addChatMessage = useEditorStore((s) => s.addChatMessage)
  const isGenerating = useEditorStore((s) => s.isGenerating)
  const workflowStages = useEditorStore((s) => s.workflowStages)
  const analysisContent = useEditorStore((s) => s.analysisContent)
  const pushCommand = useCanvasCommands((s) => s.pushCommand)

  // 新消息时自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatHistory, workflowStages, isSending])

  /* ── 发送对话修改请求 ──────────────────────────────────────────── */
  const handleSend = useCallback(async () => {
    const canvas = getGlobalCanvas()
    if (!canvas || !input.trim()) return

    const userMessage = input.trim()
    setInput('')
    setIsSending(true)
    setChatError(null)
    addChatMessage({ role: 'user', content: userMessage, timestamp: Date.now() })

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    try {
      const canvasState = serializeCanvas(canvas)
      const historyForApi = chatHistory.map((m) => ({ role: m.role, content: m.content }))

      const fullCode = await connectSse(
        '/api/posters/chat',
        { canvasState, userMessage, chatHistory: historyForApi, width: posterSize.width, height: posterSize.height },
        { onError: (msg) => setChatError(msg) },
        controller.signal,
      )

      if (!fullCode) return

      const oldObjects = canvas.getObjects().map((o) => o)
      const compiledJs = await compileJsx(fullCode)
      const hiddenDiv = document.createElement('div')
      hiddenDiv.style.cssText =
        `position:absolute;visibility:hidden;left:-9999px;width:${posterSize.width}px;height:${posterSize.height}px;`
      document.body.appendChild(hiddenDiv)

      try {
        renderToHiddenDom(compiledJs, hiddenDiv, React, ReactDOMClient)
        await new Promise((r) => setTimeout(r, 200))
        await convertDomToCanvas(
          hiddenDiv,
          { width: posterSize.width, height: posterSize.height, backgroundColor: '#ffffff' },
          canvas,
        )
      } finally {
        document.body.removeChild(hiddenDiv)
      }

      const newObjects = canvas.getObjects().map((o) => o)
      const cmd: Command = {
        execute: () => { canvas.clear(); newObjects.forEach((o) => canvas.add(o)); canvas.renderAll() },
        undo: () => { canvas.clear(); oldObjects.forEach((o) => canvas.add(o)); canvas.renderAll() },
        description: 'Chat update',
        timestamp: Date.now(),
      }
      pushCommand(cmd)
      addChatMessage({ role: 'assistant', content: '已根据您的要求更新海报设计 ✓', timestamp: Date.now() })
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('[ChatDialog] Operation failed:', {
          error: (err as Error).message,
          stack: (err as Error).stack,
        })
        setChatError((err as Error).message || '优化失败，请重试')
      }
    } finally {
      setIsSending(false)
    }
  }, [input, posterSize, chatHistory, addChatMessage, pushCommand])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  /* ── 渲染单条对话消息（用户/助手气泡） ────────────────────────── */
  const renderMessage = (msg: ChatMessage, i: number) => (
    <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`
        w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center
        ${msg.role === 'user' ? 'bg-gray-800' : 'bg-violet-100'}
      `}>
        {msg.role === 'user'
          ? <User size={11} className="text-white" />
          : <Bot size={11} className="text-violet-500" />}
      </div>
      <div className={`
        max-w-[80%] px-3 py-2 rounded-xl text-xs leading-relaxed
        ${msg.role === 'user'
          ? 'bg-gray-800 text-white rounded-tr-sm'
          : 'bg-gray-100 text-gray-700 rounded-tl-sm'}
      `}>
        {msg.content}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
        <Layers size={14} className="text-violet-500" />
        <span className="text-xs font-semibold text-gray-700">AI 工作流</span>
      </div>

      {/* ── 内容区域 ───────────────────────────────────────────── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
        {/* 空状态 */}
        {chatHistory.length === 0 && !isGenerating && (
          <div className="text-center py-6">
            <Bot size={28} className="text-gray-300 mx-auto mb-2" />
            <p className="text-[11px] text-gray-400">等待生成海报...</p>
            <p className="text-[11px] text-gray-300 mt-0.5">生成过程将在此显示工作流</p>
          </div>
        )}

        {/* 第一条消息（初始用户 prompt） */}
        {chatHistory.length > 0 && renderMessage(chatHistory[0], 0)}

        {/* 工作流阶段展示 */}
        {workflowStages.length > 0 && (
          <WorkflowSection
            stages={workflowStages}
            analysisContent={analysisContent}
            isGenerating={isGenerating}
          />
        )}

        {/* 后续对话消息（对话修改产生的用户/助手消息） */}
        {chatHistory.slice(1).map((msg, i) => renderMessage(msg, i + 1))}

        {/* 对话修改中的加载指示器 */}
        {isSending && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Bot size={11} className="text-violet-500" />
            </div>
            <div className="bg-gray-100 px-3 py-2 rounded-xl rounded-tl-sm">
              <Loader2 size={13} className="text-gray-400 animate-spin" />
            </div>
          </div>
        )}

        {/* 对话错误 */}
        {chatError && (
          <div className="text-[11px] text-red-500 bg-red-50 rounded-lg px-3 py-2">{chatError}</div>
        )}
      </div>

      {/* ── 输入区域 ───────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2 border-t border-gray-100">
        <div className="flex gap-2 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述修改内容... (Enter 发送)"
            disabled={isSending || isGenerating}
            rows={2}
            className="flex-1 resize-none text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-400 placeholder:text-gray-300 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isSending || isGenerating || !input.trim()}
            className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-lg bg-gray-800 text-white disabled:opacity-30 hover:bg-gray-700 transition-colors mb-0.5"
          >
            {isSending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          </button>
        </div>
      </div>
    </div>
  )
}
