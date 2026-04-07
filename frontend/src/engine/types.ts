import type { Canvas as FabricCanvas, FabricObject } from 'fabric'

export interface CanvasConfig {
  width: number
  height: number
  backgroundColor?: string
}

export interface CanvasElement {
  id: string
  type: 'text' | 'shape' | 'image'
  fabricObject: FabricObject
}

export interface ConversionResult {
  canvas: FabricCanvas
  elements: CanvasElement[]
  warnings: string[]
}

export const MIN_EXPORT_WIDTH = 1080
