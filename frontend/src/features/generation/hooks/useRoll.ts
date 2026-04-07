import { useRef, useCallback, useState } from 'react'
import type { Canvas as FabricCanvas } from 'fabric'
import { connectSse } from '../services/sseClient'
import { serializeCanvas } from '../services/canvasSerializer'
import { compileJsx, renderToHiddenDom } from '../services/jsxCompiler'
import { convertDomToCanvas } from '@/engine/index'
import { useEditorStore } from '@/features/editor/stores/useEditorStore'
import { useCanvasCommands } from '@/features/editor/hooks/useCanvasCommands'
import type { Command } from '@/features/editor/hooks/useCanvasCommands'
import React from 'react'
import * as ReactDOMClient from 'react-dom/client'

export function useRoll(getCanvas: () => FabricCanvas | null) {
  const abortRef = useRef<AbortController | null>(null)
  const [isRolling, setIsRolling] = useState(false)
  const [rollError, setRollError] = useState<string | null>(null)
  const posterSize = useEditorStore((s) => s.posterSize)
  const pushCommand = useCanvasCommands((s) => s.pushCommand)

  const roll = useCallback(async () => {
    const canvas = getCanvas()
    if (!canvas) {
      console.warn('[Roll] Canvas not available')
      return
    }

    const activeObj = canvas.getActiveObject()
    if (!activeObj) {
      console.warn('[Roll] No active object selected')
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsRolling(true)
    setRollError(null)

    try {
      const canvasState = serializeCanvas(canvas)
      const activeIndex = canvas.getObjects().indexOf(activeObj)
      const elementDescription = `Element at index ${activeIndex}`

      const fullCode = await connectSse(
        '/api/posters/roll',
        {
          elementDescription,
          canvasContext: canvasState,
          width: posterSize.width,
          height: posterSize.height,
        },
        {
          onError: (msg) => setRollError(msg),
        },
        controller.signal,
      )

      if (!fullCode) return

      // Compile and render the new element
      const compiledJs = await compileJsx(fullCode)
      const hiddenDiv = document.createElement('div')
      hiddenDiv.style.cssText = `position:absolute;visibility:hidden;left:-9999px;width:${posterSize.width}px;height:${posterSize.height}px;`
      document.body.appendChild(hiddenDiv)

      let result!: Awaited<ReturnType<typeof convertDomToCanvas>>
      try {
        renderToHiddenDom(compiledJs, hiddenDiv, React, ReactDOMClient)
        // Allow React to flush the render before DOM→canvas conversion
        await new Promise((r) => setTimeout(r, 200))

        result = await convertDomToCanvas(hiddenDiv, {
          width: posterSize.width,
          height: posterSize.height,
        })
      } finally {
        document.body.removeChild(hiddenDiv)
      }

      if (result.elements.length > 0) {
        const newObj = result.elements[0].fabricObject
        const oldObj = activeObj

        // Position new object at old position
        newObj.set({ left: oldObj.left, top: oldObj.top })

        const cmd: Command = {
          execute: () => {
            canvas.remove(oldObj)
            canvas.add(newObj)
            canvas.renderAll()
          },
          undo: () => {
            canvas.remove(newObj)
            canvas.add(oldObj)
            canvas.renderAll()
          },
          description: 'Roll element',
          timestamp: Date.now(),
        }
        cmd.execute()
        pushCommand(cmd)
        canvas.setActiveObject(newObj)
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        console.error('[Roll] Operation failed:', {
          error: (err as Error).message,
          stack: (err as Error).stack,
        })
        setRollError((err as Error).message || 'Roll 失败')
      }
    } finally {
      setIsRolling(false)
    }
  }, [getCanvas, posterSize, pushCommand])

  return { roll, isRolling, rollError }
}
