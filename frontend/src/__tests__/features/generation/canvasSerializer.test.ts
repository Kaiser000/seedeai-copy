import { describe, it, expect, vi } from 'vitest'

// Mock fabric.js classes with the properties canvasSerializer reads:
//   Textbox  — left/top/width/height/text/fill/fontSize/fontFamily/fontWeight
//   Rect     — left/top/width/height/fill/stroke/strokeWidth
//   FabricImage — left/top/width/height/scaleX/scaleY
//                 (actualSize = base * scale, e.g. width:200 scaleX:2 → serialized width:400)
vi.mock('fabric', () => {
  class MockTextbox {
    type = 'textbox'
    left: number
    top: number
    width: number
    height: number
    text: string
    fill: string
    fontSize: number
    fontFamily: string
    fontWeight: string
    constructor(text: string, opts: Record<string, unknown> = {}) {
      this.text = text
      this.left = (opts.left as number) || 0
      this.top = (opts.top as number) || 0
      this.width = (opts.width as number) || 100
      this.height = (opts.height as number) || 20
      this.fill = (opts.fill as string) || '#000'
      this.fontSize = (opts.fontSize as number) || 16
      this.fontFamily = (opts.fontFamily as string) || 'sans-serif'
      this.fontWeight = (opts.fontWeight as string) || 'normal'
    }
  }
  class MockRect {
    type = 'rect'
    left: number
    top: number
    width: number
    height: number
    fill: string
    stroke: string | undefined
    strokeWidth: number
    constructor(opts: Record<string, unknown> = {}) {
      this.left = (opts.left as number) || 0
      this.top = (opts.top as number) || 0
      this.width = (opts.width as number) || 100
      this.height = (opts.height as number) || 100
      this.fill = (opts.fill as string) || '#fff'
      this.stroke = opts.stroke as string | undefined
      this.strokeWidth = (opts.strokeWidth as number) || 0
    }
  }
  class MockFabricImage {
    type = 'image'
    left: number
    top: number
    width: number
    height: number
    scaleX: number
    scaleY: number
    constructor(opts: Record<string, unknown> = {}) {
      this.left = (opts.left as number) || 0
      this.top = (opts.top as number) || 0
      this.width = (opts.width as number) || 100
      this.height = (opts.height as number) || 100
      this.scaleX = (opts.scaleX as number) || 1
      this.scaleY = (opts.scaleY as number) || 1
    }
  }
  return {
    Textbox: MockTextbox,
    Rect: MockRect,
    FabricImage: MockFabricImage,
  }
})

import { serializeCanvas, serializeElement } from '@/features/generation/services/canvasSerializer'
import { Textbox, Rect, FabricImage } from 'fabric'

function createMockCanvas(objects: unknown[]) {
  return {
    width: 1080,
    height: 1920,
    getObjects: () => objects,
  } as unknown as import('fabric').Canvas
}

describe('canvasSerializer', () => {
  it('serializes empty canvas', () => {
    const canvas = createMockCanvas([])
    const result = JSON.parse(serializeCanvas(canvas))
    expect(result.canvasSize).toEqual({ width: 1080, height: 1920 })
    expect(result.elements).toHaveLength(0)
  })

  it('serializes text element', () => {
    const textbox = new Textbox('Hello', {
      left: 100, top: 200, width: 400, height: 60,
      fill: '#FF0000', fontSize: 48, fontFamily: 'AlibabaPuHuiTi', fontWeight: 'bold',
    })
    const canvas = createMockCanvas([textbox])
    const result = JSON.parse(serializeCanvas(canvas))

    expect(result.elements).toHaveLength(1)
    expect(result.elements[0].type).toBe('text')
    expect(result.elements[0].content).toBe('Hello')
    expect(result.elements[0].style.color).toBe('#FF0000')
    expect(result.elements[0].style.fontSize).toBe(48)
  })

  it('serializes shape element', () => {
    const rect = new Rect({
      left: 0, top: 0, width: 1080, height: 1920, fill: '#F0F0FF',
    })
    const canvas = createMockCanvas([rect])
    const result = JSON.parse(serializeCanvas(canvas))

    expect(result.elements).toHaveLength(1)
    expect(result.elements[0].type).toBe('shape')
    expect(result.elements[0].style.fill).toBe('#F0F0FF')
  })

  it('serializes image element', () => {
    const img = new (FabricImage as unknown as new (opts: Record<string, unknown>) => InstanceType<typeof FabricImage>)({
      left: 50, top: 50, width: 200, height: 150, scaleX: 2, scaleY: 2,
    })
    const canvas = createMockCanvas([img])
    const result = JSON.parse(serializeCanvas(canvas))

    expect(result.elements).toHaveLength(1)
    expect(result.elements[0].type).toBe('image')
    expect(result.elements[0].size.width).toBe(400) // 200 * 2
    expect(result.elements[0].size.height).toBe(300) // 150 * 2
  })

  it('serializes mixed elements', () => {
    const rect = new Rect({ left: 0, top: 0, width: 1080, height: 1920, fill: '#fff' })
    const text = new Textbox('Title', { left: 100, top: 100, width: 300, fontSize: 32, fill: '#000' })
    const canvas = createMockCanvas([rect, text])
    const result = JSON.parse(serializeCanvas(canvas))

    expect(result.elements).toHaveLength(2)
    expect(result.elements[0].type).toBe('shape')
    expect(result.elements[1].type).toBe('text')
  })
})

// ---------------------------------------------------------------------------
// serializeElement
// ---------------------------------------------------------------------------
describe('serializeElement', () => {
  it('returns the selected element and full canvas context', () => {
    const text = new Textbox('Hello', { left: 10, top: 20, width: 200, fontSize: 16, fill: '#000' })
    const rect = new Rect({ left: 0, top: 0, width: 1080, height: 1920, fill: '#fff' })
    const canvas = createMockCanvas([rect, text])

    const result = JSON.parse(serializeElement(canvas, 1))
    expect(result.selectedElement.type).toBe('text')
    expect(result.selectedElement.content).toBe('Hello')
    expect(result.canvasContext.elements).toHaveLength(2)
  })

  it('returns "{}" for a negative index', () => {
    const canvas = createMockCanvas([new Textbox('x')])
    expect(serializeElement(canvas, -1)).toBe('{}')
  })

  it('returns "{}" for an out-of-bounds index', () => {
    const canvas = createMockCanvas([])
    expect(serializeElement(canvas, 0)).toBe('{}')
  })

  it('returns "{}" when index equals object count', () => {
    const canvas = createMockCanvas([new Textbox('only')])
    expect(serializeElement(canvas, 1)).toBe('{}')
  })
})
