import { useCallback, useEffect, useState } from 'react'
import { Textbox, FabricImage, Rect } from 'fabric'
import type { FabricObject } from 'fabric'
import { Eye, EyeOff, Trash2, ChevronUp, ChevronDown, Type, ImageIcon, Square } from 'lucide-react'
import { getGlobalCanvas } from '../canvasRegistry'
import { useEditorStore } from '../stores/useEditorStore'
import { useCanvasCommands } from '../hooks/useCanvasCommands'
import type { Command } from '../hooks/useCanvasCommands'

function getObjectLabel(obj: FabricObject, index: number): string {
  if (obj instanceof Textbox) {
    const text = obj.text || ''
    return text.length > 20 ? text.slice(0, 20) + '…' : (text || `文字 ${index + 1}`)
  }
  if (obj instanceof FabricImage) return `图片 ${index + 1}`
  if (obj instanceof Rect) return `形状 ${index + 1}`
  return `图层 ${index + 1}`
}

function getObjectIcon(obj: FabricObject) {
  if (obj instanceof Textbox) return <Type size={12} className="flex-shrink-0" />
  if (obj instanceof FabricImage) return <ImageIcon size={12} className="flex-shrink-0" />
  return <Square size={12} className="flex-shrink-0" />
}

interface LayersPanelProps {
  refreshToken?: number
}

export function LayersPanel({ refreshToken }: LayersPanelProps) {
  const [objects, setObjects] = useState<FabricObject[]>([])
  const selectedId = useEditorStore((s) => s.selectedElementId)
  const selectElement = useEditorStore((s) => s.selectElement)
  const clearSelection = useEditorStore((s) => s.clearSelection)
  const { pushCommand } = useCanvasCommands()

  const refresh = useCallback(() => {
    const canvas = getGlobalCanvas()
    if (!canvas) { setObjects([]); return }
    // Show in reverse order (top layers first)
    setObjects([...canvas.getObjects()].reverse())
  }, [])

  useEffect(() => { refresh() }, [refresh, refreshToken])

  // Subscribe to canvas changes
  useEffect(() => {
    const canvas = getGlobalCanvas()
    if (!canvas) return
    const events = ['object:added', 'object:removed', 'object:modified', 'canvas:cleared']
    events.forEach((ev) => canvas.on(ev as never, refresh))
    return () => events.forEach((ev) => canvas.off(ev as never, refresh))
  }, [refresh])

  const handleSelect = useCallback((obj: FabricObject) => {
    const canvas = getGlobalCanvas()
    if (!canvas) return
    canvas.setActiveObject(obj)
    canvas.requestRenderAll()
    selectElement((obj as unknown as Record<string, string>).id || 'unknown')
  }, [selectElement])

  const handleDelete = useCallback((obj: FabricObject) => {
    const canvas = getGlobalCanvas()
    if (!canvas) return
    const cmd: Command = {
      execute: () => { canvas.remove(obj); canvas.renderAll() },
      undo: () => { canvas.add(obj); canvas.renderAll() },
      description: 'Delete layer',
      timestamp: Date.now(),
    }
    cmd.execute()
    pushCommand(cmd)
    if (canvas.getActiveObject() === obj) {
      canvas.discardActiveObject()
      clearSelection()
    }
  }, [pushCommand, clearSelection])

  const toggleVisibility = useCallback((obj: FabricObject) => {
    const canvas = getGlobalCanvas()
    if (!canvas) return
    obj.set('visible', !obj.visible)
    canvas.requestRenderAll()
    refresh()
  }, [refresh])

  const moveUp = useCallback((obj: FabricObject) => {
    const canvas = getGlobalCanvas()
    if (!canvas) return
    canvas.bringObjectForward(obj)
    canvas.requestRenderAll()
    refresh()
  }, [refresh])

  const moveDown = useCallback((obj: FabricObject) => {
    const canvas = getGlobalCanvas()
    if (!canvas) return
    canvas.sendObjectBackwards(obj)
    canvas.requestRenderAll()
    refresh()
  }, [refresh])

  if (objects.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center px-4 py-8">
        <div className="w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
          <Square size={18} className="text-gray-400" />
        </div>
        <p className="text-xs text-gray-400">暂无图层</p>
        <p className="text-[11px] text-gray-300">生成海报后图层将显示在这里</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {objects.map((obj, i) => {
        // Objects are reversed, so visual index is objects.length-1-i
        const isSelected = selectedId && getGlobalCanvas()?.getActiveObject() === obj
        const isVisible = obj.visible !== false

        return (
          <div
            key={i}
            onClick={() => handleSelect(obj)}
            className={`
              flex items-center gap-1.5 px-3 py-2 cursor-pointer border-b border-gray-100 group
              ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'}
            `}
          >
            {/* Type icon */}
            <span className={`text-gray-400 ${isSelected ? 'text-blue-500' : ''}`}>
              {getObjectIcon(obj)}
            </span>

            {/* Label */}
            <span className={`flex-1 text-xs truncate ${isVisible ? 'text-gray-700' : 'text-gray-300 line-through'} ${isSelected ? 'text-blue-700 font-medium' : ''}`}>
              {getObjectLabel(obj, objects.length - 1 - i)}
            </span>

            {/* Actions (visible on hover/select) */}
            <div className={`flex items-center gap-0.5 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
              <button
                onClick={(e) => { e.stopPropagation(); moveUp(obj) }}
                title="上移"
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500"
              >
                <ChevronUp size={11} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); moveDown(obj) }}
                title="下移"
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500"
              >
                <ChevronDown size={11} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); toggleVisibility(obj) }}
                title={isVisible ? '隐藏' : '显示'}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-200 text-gray-500"
              >
                {isVisible ? <Eye size={11} /> : <EyeOff size={11} />}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(obj) }}
                title="删除"
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-100 text-gray-400 hover:text-red-500"
              >
                <Trash2 size={11} />
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
