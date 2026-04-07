import { useCallback, useEffect, useRef } from 'react'
import { Textbox, FabricImage } from 'fabric'
import {
  Undo2, Redo2, Type, Trash2, Bold, Italic,
  AlignLeft, AlignCenter, AlignRight, Image, RefreshCw, Sparkles,
} from 'lucide-react'
import { useEditorStore } from '../stores/useEditorStore'
import { useCanvasCommands } from '../hooks/useCanvasCommands'
import type { Command } from '../hooks/useCanvasCommands'
import { getGlobalCanvas } from '../canvasRegistry'
import { useRoll } from '@/features/generation/hooks/useRoll'

function ToolbarSep() {
  return <div className="w-px h-5 bg-gray-200 mx-1 flex-shrink-0" />
}

interface IconBtnProps {
  onClick: () => void
  title: string
  disabled?: boolean
  active?: boolean
  children: React.ReactNode
}
function IconBtn({ onClick, title, disabled, active, children }: IconBtnProps) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={`
        w-8 h-8 flex items-center justify-center rounded-md text-sm transition-colors flex-shrink-0
        ${active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'}
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
      `}
    >
      {children}
    </button>
  )
}

export function Toolbar() {
  const selectedElementId = useEditorStore((s) => s.selectedElementId)
  const { canUndo, canRedo, undo, redo, pushCommand } = useCanvasCommands()
  const clearSelection = useEditorStore((s) => s.clearSelection)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Expose getCanvas for useRoll hook which needs it as a function
  const getCanvas = useCallback(() => getGlobalCanvas(), [])
  const { roll, isRolling } = useRoll(getCanvas)

  const handleDelete = useCallback(() => {
    const canvas = getGlobalCanvas()
    if (!canvas) return
    const active = canvas.getActiveObject()
    if (!active) return
    const removed = active
    const cmd: Command = {
      execute: () => { canvas.remove(removed); canvas.renderAll() },
      undo: () => { canvas.add(removed); canvas.renderAll() },
      description: 'Delete element',
      timestamp: Date.now(),
    }
    cmd.execute()
    pushCommand(cmd)
    canvas.discardActiveObject()
    canvas.renderAll()
    clearSelection()
  }, [pushCommand, clearSelection])

  const handleAddText = useCallback(() => {
    const canvas = getGlobalCanvas()
    if (!canvas) return
    const textbox = new Textbox('双击编辑文字', {
      left: (canvas.width || 500) / 2 - 100,
      top: (canvas.height || 500) / 2 - 20,
      width: 200,
      fontSize: 24,
      fontFamily: 'AlibabaPuHuiTi, NotoSansSC, sans-serif',
      fill: '#000000',
      editable: true,
    })
    const cmd: Command = {
      execute: () => { canvas.add(textbox); canvas.renderAll() },
      undo: () => { canvas.remove(textbox); canvas.renderAll() },
      description: 'Add text',
      timestamp: Date.now(),
    }
    cmd.execute()
    pushCommand(cmd)
    canvas.setActiveObject(textbox)
    canvas.renderAll()
  }, [pushCommand])

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const canvas = getGlobalCanvas()
    if (!canvas) return
    const reader = new FileReader()
    reader.onload = async (evt) => {
      const dataUrl = evt.target?.result as string
      const img = await FabricImage.fromURL(dataUrl)
      const maxW = (canvas.width || 800) * 0.6
      const maxH = (canvas.height || 800) * 0.6
      const scale = Math.min(maxW / (img.width || 1), maxH / (img.height || 1), 1)
      img.set({
        left: ((canvas.width || 800) - (img.width || 0) * scale) / 2,
        top: ((canvas.height || 800) - (img.height || 0) * scale) / 2,
        scaleX: scale,
        scaleY: scale,
      })
      const cmd: Command = {
        execute: () => { canvas.add(img); canvas.renderAll() },
        undo: () => { canvas.remove(img); canvas.renderAll() },
        description: 'Add image',
        timestamp: Date.now(),
      }
      cmd.execute()
      pushCommand(cmd)
      canvas.setActiveObject(img)
      canvas.renderAll()
    }
    reader.readAsDataURL(file)
    // Reset so same file can be re-selected
    e.target.value = ''
  }, [pushCommand])

  // ─── Text formatting helpers ──────────────────────────────────────────────
  const getActiveText = () => {
    const canvas = getGlobalCanvas()
    if (!canvas) return null
    const obj = canvas.getActiveObject()
    return obj instanceof Textbox ? obj : null
  }

  const handleColor = useCallback((color: string) => {
    const canvas = getGlobalCanvas()
    const txt = getActiveText()
    if (!canvas || !txt) return
    const old = txt.fill as string
    const cmd: Command = {
      execute: () => { txt.set('fill', color); canvas.renderAll() },
      undo: () => { txt.set('fill', old); canvas.renderAll() },
      description: 'Color',
      timestamp: Date.now(),
    }
    cmd.execute(); pushCommand(cmd)
  }, [pushCommand]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFontSize = useCallback((size: number) => {
    const canvas = getGlobalCanvas()
    const txt = getActiveText()
    if (!canvas || !txt || isNaN(size)) return
    const old = txt.fontSize || 16
    const cmd: Command = {
      execute: () => { txt.set('fontSize', size); canvas.renderAll() },
      undo: () => { txt.set('fontSize', old); canvas.renderAll() },
      description: 'FontSize',
      timestamp: Date.now(),
    }
    cmd.execute(); pushCommand(cmd)
  }, [pushCommand]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBold = useCallback(() => {
    const canvas = getGlobalCanvas()
    const txt = getActiveText()
    if (!canvas || !txt) return
    const isBold = txt.fontWeight === 'bold'
    const cmd: Command = {
      execute: () => { txt.set('fontWeight', isBold ? 'normal' : 'bold'); canvas.renderAll() },
      undo: () => { txt.set('fontWeight', isBold ? 'bold' : 'normal'); canvas.renderAll() },
      description: 'Bold',
      timestamp: Date.now(),
    }
    cmd.execute(); pushCommand(cmd)
  }, [pushCommand]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleItalic = useCallback(() => {
    const canvas = getGlobalCanvas()
    const txt = getActiveText()
    if (!canvas || !txt) return
    const isItalic = txt.fontStyle === 'italic'
    const cmd: Command = {
      execute: () => { txt.set('fontStyle', isItalic ? 'normal' : 'italic'); canvas.renderAll() },
      undo: () => { txt.set('fontStyle', isItalic ? 'italic' : 'normal'); canvas.renderAll() },
      description: 'Italic',
      timestamp: Date.now(),
    }
    cmd.execute(); pushCommand(cmd)
  }, [pushCommand]) // eslint-disable-line react-hooks/exhaustive-deps

  const setAlign = useCallback((align: string) => {
    const canvas = getGlobalCanvas()
    const txt = getActiveText()
    if (!canvas || !txt) return
    const old = txt.textAlign || 'left'
    const cmd: Command = {
      execute: () => { txt.set('textAlign', align); canvas.renderAll() },
      undo: () => { txt.set('textAlign', old); canvas.renderAll() },
      description: 'Align',
      timestamp: Date.now(),
    }
    cmd.execute(); pushCommand(cmd)
  }, [pushCommand]) // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
        if ((e.key === 'Z' && e.shiftKey) || e.key === 'y') { e.preventDefault(); redo() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // Active text object for conditional rendering
  const canvas = getGlobalCanvas()
  const activeObj = canvas?.getActiveObject()
  const activeTxt = activeObj instanceof Textbox ? activeObj : null
  const isBold = activeTxt?.fontWeight === 'bold'
  const isItalic = activeTxt?.fontStyle === 'italic'
  const currentAlign = activeTxt?.textAlign || 'left'
  const currentColor = (activeTxt?.fill as string) || '#000000'
  const currentSize = activeTxt?.fontSize || 16

  return (
    <div className="flex items-center gap-0.5 px-3 h-11 border-b border-gray-200 bg-white flex-shrink-0">
      {/* History */}
      <IconBtn onClick={undo} title="撤销 (Ctrl+Z)" disabled={!canUndo}>
        <Undo2 size={15} />
      </IconBtn>
      <IconBtn onClick={redo} title="重做 (Ctrl+Shift+Z)" disabled={!canRedo}>
        <Redo2 size={15} />
      </IconBtn>

      <ToolbarSep />

      {/* Add elements */}
      <IconBtn onClick={handleAddText} title="添加文字 (T)">
        <Type size={15} />
      </IconBtn>
      <IconBtn onClick={() => fileInputRef.current?.click()} title="上传图片">
        <Image size={15} />
      </IconBtn>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

      {/* Delete */}
      <IconBtn onClick={handleDelete} title="删除选中 (Delete)" disabled={!selectedElementId}>
        <Trash2 size={15} />
      </IconBtn>

      {/* AI Roll */}
      {selectedElementId && (
        <>
          <ToolbarSep />
          <button
            onClick={roll}
            disabled={isRolling}
            title="AI 重新生成选中元素"
            className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:from-violet-600 hover:to-indigo-600 disabled:opacity-50 transition-all flex-shrink-0"
          >
            {isRolling ? (
              <RefreshCw size={13} className="animate-spin" />
            ) : (
              <Sparkles size={13} />
            )}
            {isRolling ? '生成中...' : 'AI 重写'}
          </button>
        </>
      )}

      {/* Text formatting — only when a text object is selected */}
      {activeTxt && (
        <>
          <ToolbarSep />

          {/* Font size */}
          <input
            type="number"
            value={currentSize}
            onChange={(e) => handleFontSize(Number(e.target.value))}
            className="w-14 h-8 px-2 border border-gray-200 rounded-md text-xs text-center focus:outline-none focus:ring-1 focus:ring-gray-400"
            min={6}
            max={300}
            title="字体大小"
          />

          {/* Color picker */}
          <div className="relative flex items-center" title="文字颜色">
            <input
              type="color"
              value={currentColor}
              onChange={(e) => handleColor(e.target.value)}
              className="w-8 h-8 p-0.5 border border-gray-200 rounded-md cursor-pointer bg-transparent"
            />
          </div>

          <ToolbarSep />

          {/* Bold / Italic */}
          <IconBtn onClick={toggleBold} title="加粗 (Ctrl+B)" active={isBold}>
            <Bold size={14} />
          </IconBtn>
          <IconBtn onClick={toggleItalic} title="斜体 (Ctrl+I)" active={isItalic}>
            <Italic size={14} />
          </IconBtn>

          <ToolbarSep />

          {/* Alignment */}
          <IconBtn onClick={() => setAlign('left')} title="左对齐" active={currentAlign === 'left'}>
            <AlignLeft size={14} />
          </IconBtn>
          <IconBtn onClick={() => setAlign('center')} title="居中" active={currentAlign === 'center'}>
            <AlignCenter size={14} />
          </IconBtn>
          <IconBtn onClick={() => setAlign('right')} title="右对齐" active={currentAlign === 'right'}>
            <AlignRight size={14} />
          </IconBtn>
        </>
      )}
    </div>
  )
}
