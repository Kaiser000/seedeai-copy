import { useState, useRef, useCallback, useEffect } from 'react'
import { Send, Bot, User, Loader2, Sparkles, Code2, ImageIcon, CheckCircle2, AlertCircle } from 'lucide-react'
import { useEditorStore } from '../stores/useEditorStore'
import type { ChatMessage, ChatMessageType } from '../stores/useEditorStore'
import { useCanvasCommands } from '../hooks/useCanvasCommands'
import type { Command } from '../hooks/useCanvasCommands'
import { connectSse } from '@/features/generation/services/sseClient'
import { serializeCanvas } from '@/features/generation/services/canvasSerializer'
import { compileJsx, renderToHiddenDom } from '@/features/generation/services/jsxCompiler'
import { convertDomToCanvas } from '@/engine/index'
import { getGlobalCanvas } from '../canvasRegistry'
import React from 'react'
import * as ReactDOMClient from 'react-dom/client'

/** 根据消息类型返回对应的图标 */
function MsgIcon({ msgType }: { msgType?: ChatMessageType }) {
  switch (msgType) {
    case 'thinking':
      return <Sparkles size={11} className="text-amber-500" />
    case 'code_complete':
      return <Code2 size={11} className="text-blue-500" />
    case 'image_progress':
      return <ImageIcon size={11} className="text-emerald-500" />
    case 'complete':
      return <CheckCircle2 size={11} className="text-green-600" />
    case 'error':
      return <AlertCircle size={11} className="text-red-500" />
    default:
      return <Bot size={11} className="text-violet-500" />
  }
}

/** 工作流步骤消息的样式 */
function workflowStyle(msgType?: ChatMessageType): string {
  switch (msgType) {
    case 'thinking':
      return 'bg-amber-50 text-amber-700 border border-amber-200'
    case 'code_complete':
      return 'bg-blue-50 text-blue-700 border border-blue-200'
    case 'image_progress':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    case 'complete':
      return 'bg-green-50 text-green-700 border border-green-200'
    case 'error':
      return 'bg-red-50 text-red-600 border border-red-200'
    default:
      return 'bg-gray-100 text-gray-700'
  }
}

function isWorkflowStep(msgType?: ChatMessageType): boolean {
  return msgType === 'thinking' || msgType === 'code_complete' ||
    msgType === 'image_progress' || msgType === 'complete' || msgType === 'error'
}

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
  const pushCommand = useCanvasCommands((s) => s.pushCommand)

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatHistory, isSending])

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

  const renderMessage = (msg: ChatMessage, i: number) => {
    // 工作流步骤：紧凑的横向卡片样式
    if (msg.role === 'assistant' && isWorkflowStep(msg.msgType)) {
      return (
        <div key={i} className="flex items-center gap-2 px-2">
          <div className={`
            flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] leading-relaxed w-full
            ${workflowStyle(msg.msgType)}
          `}>
            <MsgIcon msgType={msg.msgType} />
            <span>{msg.content}</span>
          </div>
        </div>
      )
    }

    // 普通对话消息：气泡样��
    return (
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
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
        <Bot size={14} className="text-violet-500" />
        <span className="text-xs font-semibold text-gray-700">AI 工作流</span>
      </div>

      {/* Chat history */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-0">
        {chatHistory.length === 0 && !isGenerating && (
          <div className="text-center py-6">
            <Bot size={28} className="text-gray-300 mx-auto mb-2" />
            <p className="text-[11px] text-gray-400">等待生成海报...</p>
            <p className="text-[11px] text-gray-300 mt-0.5">生成过程将在此显示工作流</p>
          </div>
        )}
        {chatHistory.map((msg, i) => renderMessage(msg, i))}
        {(isSending || (isGenerating && chatHistory.length === 0)) && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
              <Bot size={11} className="text-violet-500" />
            </div>
            <div className="bg-gray-100 px-3 py-2 rounded-xl rounded-tl-sm">
              <Loader2 size={13} className="text-gray-400 animate-spin" />
            </div>
          </div>
        )}
        {chatError && (
          <div className="text-[11px] text-red-500 bg-red-50 rounded-lg px-3 py-2">{chatError}</div>
        )}
      </div>

      {/* Input area */}
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
