import { useEffect, useRef, useCallback } from 'react'
import { Canvas as FabricCanvas, Textbox } from 'fabric'
import { useEditorStore } from '../stores/useEditorStore'
import { setGlobalCanvas } from '../canvasRegistry'

export function useFabricCanvas(canvasElRef: React.RefObject<HTMLCanvasElement | null>) {
  const canvasRef = useRef<FabricCanvas | null>(null)
  const selectElement = useEditorStore((s) => s.selectElement)
  const clearSelection = useEditorStore((s) => s.clearSelection)

  useEffect(() => {
    if (!canvasElRef.current || canvasRef.current) return

    const canvas = new FabricCanvas(canvasElRef.current, {
      selection: true,
      preserveObjectStacking: true,
      enableRetinaScaling: false,
    })

    canvasRef.current = canvas
    setGlobalCanvas(canvas)

    // Both selection:created and selection:updated fire when the active object changes;
    // objects carry an 'id' property assigned during canvas element creation.
    canvas.on('selection:created', (e) => {
      const obj = e.selected?.[0]
      if (obj) selectElement((obj as unknown as Record<string, string>).id || 'unknown')
    })

    canvas.on('selection:updated', (e) => {
      const obj = e.selected?.[0]
      if (obj) selectElement((obj as unknown as Record<string, string>).id || 'unknown')
    })

    canvas.on('selection:cleared', () => {
      clearSelection()
    })

    // Global Delete/Backspace handler registered on document (not canvas) so it fires
    // even when the canvas element is not focused. Guards:
    //  - Skip if the user is typing in an <input>, <textarea>, or contentEditable element.
    //  - Skip if a Fabric.js Textbox is in inline editing mode (active.isEditing).
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) return
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const active = canvas.getActiveObject()
        if (!active) return
        if (active instanceof Textbox && active.isEditing) return
        canvas.remove(active)
        canvas.discardActiveObject()
        canvas.renderAll()
        clearSelection()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      setGlobalCanvas(null)
      // canvas.dispose() tears down all internal Fabric.js event listeners and DOM references
      canvas.dispose()
      canvasRef.current = null
    }
  }, [canvasElRef, selectElement, clearSelection])

  const getCanvas = useCallback(() => canvasRef.current, [])

  return { getCanvas }
}
