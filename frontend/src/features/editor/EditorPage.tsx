import { useEffect, useState, useCallback, useRef } from 'react'
import {
  ArrowLeft, Download, Layers, Settings2, MessageSquare, Code2,
} from 'lucide-react'
import { useEditorStore } from './stores/useEditorStore'
import { useGenerate } from '@/features/generation/hooks/useGenerate'
import { useExport } from './hooks/useExport'
import { getGlobalCanvas } from './canvasRegistry'
import { CanvasPanel } from './components/CanvasPanel'
import { Toolbar } from './components/Toolbar'
import { LayersPanel } from './components/LayersPanel'
import { PropertiesPanel } from './components/PropertiesPanel'
import { ChatDialog } from './components/ChatDialog'
import { StreamPanel } from './components/StreamPanel'

type LeftTab = 'layers' | 'code'
type RightTab = 'props' | 'chat'

export function EditorPage() {
  const { generate } = useGenerate()
  const isGenerating = useEditorStore((s) => s.isGenerating)
  const error = useEditorStore((s) => s.error)
  const prompt = useEditorStore((s) => s.prompt)
  const posterSize = useEditorStore((s) => s.posterSize)
  const startGeneration = useEditorStore((s) => s.startGeneration)
  const setCurrentPage = useEditorStore((s) => s.setCurrentPage)

  const accumulatedCode = useEditorStore((s) => s.accumulatedCode)

  const [leftTab, setLeftTab] = useState<LeftTab>('layers')
  const [rightTab, setRightTab] = useState<RightTab>('chat')
  const [layersRefresh, setLayersRefresh] = useState(0)

  // 左侧面板宽度：图层 tab 默认 208px，代码 tab 默认 420px，可拖拽调整
  const LAYERS_WIDTH = 208
  const CODE_WIDTH = 420
  const MIN_LEFT_WIDTH = 160
  const MAX_LEFT_WIDTH = 700
  const [leftWidth, setLeftWidth] = useState(LAYERS_WIDTH)
  const isDraggingRef = useRef(false)
  const dragStartXRef = useRef(0)
  const dragStartWidthRef = useRef(0)

  const getCanvas = useCallback(() => getGlobalCanvas(), [])
  const { exportPng, isExporting } = useExport(getCanvas)

  // Auto-trigger generation on mount
  useEffect(() => {
    if (isGenerating) generate()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // 代码开始生成时自动切换到"代码"tab，保持流式输出可见
  useEffect(() => {
    if (accumulatedCode && isGenerating) {
      setLeftTab('code')
    }
  }, [accumulatedCode, isGenerating])

  // 切换 tab 时自动调整默认宽度（仅在未手动拖拽过时）
  useEffect(() => {
    setLeftWidth(leftTab === 'code' ? CODE_WIDTH : LAYERS_WIDTH)
  }, [leftTab])

  // 拖拽分割条调整左侧面板宽度
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isDraggingRef.current = true
    dragStartXRef.current = e.clientX
    dragStartWidthRef.current = leftWidth

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDraggingRef.current) return
      const delta = ev.clientX - dragStartXRef.current
      const newWidth = Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, dragStartWidthRef.current + delta))
      setLeftWidth(newWidth)
    }
    const handleMouseUp = () => {
      isDraggingRef.current = false
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [leftWidth])

  const handleRetry = () => {
    startGeneration(prompt, posterSize)
    generate()
  }

  const handleLayersChange = useCallback(() => {
    setLayersRefresh((n) => n + 1)
  }, [])

  return (
    <div className="flex flex-col h-screen bg-gray-50 overflow-hidden font-sans">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <header className="flex items-center h-12 px-4 bg-white border-b border-gray-200 flex-shrink-0 gap-3">
        <button
          onClick={() => setCurrentPage('input')}
          className="flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors flex-shrink-0"
        >
          <ArrowLeft size={14} />
          返回
        </button>

        <div className="w-px h-5 bg-gray-200 flex-shrink-0" />

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-sm font-bold text-gray-900">Seede AI</span>
          <span className="text-[11px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-medium">编辑器</span>
        </div>

        {/* Prompt preview */}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 truncate" title={prompt}>{prompt}</p>
        </div>

        {/* Status */}
        {isGenerating && (
          <div className="flex items-center gap-1.5 text-xs text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full flex-shrink-0">
            <span className="w-2 h-2 bg-violet-500 rounded-full animate-pulse flex-shrink-0" />
            AI 生成中
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <span
              className="text-xs text-red-500 max-w-[260px] truncate"
              title={error}
            >
              {error}
            </span>
            <button
              onClick={handleRetry}
              className="text-xs text-white bg-red-500 hover:bg-red-600 px-2.5 py-1 rounded-md transition-colors"
            >
              重试
            </button>
          </div>
        )}

        <button
          onClick={exportPng}
          disabled={isExporting}
          className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-semibold bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-50 transition-colors flex-shrink-0"
        >
          <Download size={13} />
          {isExporting ? '导出中...' : '导出 PNG'}
        </button>
      </header>

      {/* ── 3-panel body ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel: Layers / Code（可拖拽调宽） ────────────────── */}
        <aside
          className="flex-shrink-0 flex flex-col bg-white border-r border-gray-200 overflow-hidden"
          style={{ width: leftWidth }}
        >
          {/* Tab bar */}
          <div className="flex border-b border-gray-200 flex-shrink-0">
            <TabBtn active={leftTab === 'layers'} onClick={() => setLeftTab('layers')} icon={<Layers size={11} />} label="图层" />
            <TabBtn active={leftTab === 'code'} onClick={() => setLeftTab('code')} icon={<Code2 size={11} />} label="代码" />
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            {leftTab === 'layers' && <LayersPanel refreshToken={layersRefresh} />}
            {leftTab === 'code' && <StreamPanel />}
          </div>
        </aside>
        {/* ── 拖拽分割条 ─────────────────────────────────────────── */}
        <div
          onMouseDown={handleResizeStart}
          className="w-1 flex-shrink-0 cursor-col-resize hover:bg-blue-400 active:bg-blue-500 transition-colors bg-transparent group relative"
          title="拖拽调整宽度"
        >
          {/* 加大拖拽热区，实际可视宽度只有 1px */}
          <div className="absolute inset-y-0 -left-1 -right-1" />
        </div>

        {/* ── Center: Toolbar + Canvas ─────────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden min-w-0">
          <Toolbar />
          <CanvasPanel onLayersChange={handleLayersChange} />
        </main>

        {/* ── Right panel: Properties / Chat ───────────────────────────── */}
        <aside className="w-64 flex-shrink-0 flex flex-col bg-white border-l border-gray-200 overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-200 flex-shrink-0">
            <TabBtn active={rightTab === 'props'} onClick={() => setRightTab('props')} icon={<Settings2 size={11} />} label="属性" />
            <TabBtn active={rightTab === 'chat'} onClick={() => setRightTab('chat')} icon={<MessageSquare size={11} />} label="AI 对话" />
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            {rightTab === 'props' && <PropertiesPanel refreshToken={layersRefresh} />}
            {rightTab === 'chat' && <ChatDialog />}
          </div>
        </aside>

      </div>
    </div>
  )
}

function TabBtn({
  active, onClick, icon, label,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; label: string
}) {
  return (
    <button
      onClick={onClick}
      className={`
        flex-1 flex items-center justify-center gap-1.5 h-9 text-xs font-medium
        border-b-2 transition-colors
        ${active
          ? 'border-gray-900 text-gray-900 bg-gray-50'
          : 'border-transparent text-gray-400 hover:text-gray-600 hover:bg-gray-50'}
      `}
    >
      {icon}{label}
    </button>
  )
}
