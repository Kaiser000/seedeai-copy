import type { Canvas as FabricCanvas } from 'fabric'
import { Textbox, Rect, FabricImage } from 'fabric'

interface SerializedElement {
  type: 'text' | 'shape' | 'image'
  position: { x: number; y: number }
  size: { width: number; height: number }
  content?: string
  style: Record<string, unknown>
}

export function serializeCanvas(canvas: FabricCanvas): string {
  const elements: SerializedElement[] = []

  for (const obj of canvas.getObjects()) {
    if (obj instanceof Textbox) {
      elements.push({
        type: 'text',
        position: { x: Math.round(obj.left || 0), y: Math.round(obj.top || 0) },
        size: { width: Math.round(obj.width || 0), height: Math.round(obj.height || 0) },
        content: obj.text,
        style: {
          color: obj.fill,
          fontSize: obj.fontSize,
          fontFamily: obj.fontFamily,
          fontWeight: obj.fontWeight,
        },
      })
    } else if (obj instanceof Rect) {
      elements.push({
        type: 'shape',
        position: { x: Math.round(obj.left || 0), y: Math.round(obj.top || 0) },
        size: { width: Math.round(obj.width || 0), height: Math.round(obj.height || 0) },
        style: {
          fill: obj.fill,
          stroke: obj.stroke,
          strokeWidth: obj.strokeWidth,
        },
      })
    } else if (obj instanceof FabricImage) {
      elements.push({
        type: 'image',
        position: { x: Math.round(obj.left || 0), y: Math.round(obj.top || 0) },
        size: {
          width: Math.round((obj.width || 0) * (obj.scaleX || 1)),
          height: Math.round((obj.height || 0) * (obj.scaleY || 1)),
        },
        style: {},
      })
    }
  }

  return JSON.stringify({
    canvasSize: { width: canvas.width, height: canvas.height },
    elements,
  }, null, 2)
}

export function serializeElement(canvas: FabricCanvas, elementIndex: number): string {
  const objects = canvas.getObjects()
  if (elementIndex < 0 || elementIndex >= objects.length) return '{}'

  const _obj = objects[elementIndex]
  void _obj // validate index access
  const fullSerialization = serializeCanvas(canvas)
  const parsed = JSON.parse(fullSerialization)

  return JSON.stringify({
    selectedElement: parsed.elements[elementIndex],
    canvasContext: parsed,
  }, null, 2)
}
