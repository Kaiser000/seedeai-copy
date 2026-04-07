import { useCallback, useState } from 'react'
import type { Canvas as FabricCanvas } from 'fabric'
import { MIN_EXPORT_WIDTH } from '@/engine/types'

export function useExport(getCanvas: () => FabricCanvas | null) {
  const [isExporting, setIsExporting] = useState(false)

  const exportPng = useCallback(() => {
    const canvas = getCanvas()
    if (!canvas) return

    setIsExporting(true)
    // Defer to next macrotask so React can flush the loading state before
    // toDataURL() blocks the main thread (can take hundreds of ms on large canvases)
    setTimeout(() => {
      try {
        const multiplier = Math.max(1, MIN_EXPORT_WIDTH / (canvas.width || MIN_EXPORT_WIDTH))
        const dataUrl = canvas.toDataURL({ format: 'png', multiplier })

        const now = new Date()
        const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '')
        const filename = `seede-poster-${dateStr}.png`

        const link = document.createElement('a')
        link.download = filename
        link.href = dataUrl
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      } catch (err) {
        console.error('[useExport] PNG export failed:', {
          error: (err as Error).message,
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
        })
      } finally {
        setIsExporting(false)
      }
    }, 0)
  }, [getCanvas])

  return { exportPng, isExporting }
}
