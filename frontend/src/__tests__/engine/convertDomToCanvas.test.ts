import { describe, it, expect, vi } from 'vitest'

vi.mock('fabric', () => {
  class MockTextbox {
    type = 'textbox'
    text: string
    opts: Record<string, unknown>
    constructor(text: string, opts: Record<string, unknown> = {}) {
      this.text = text
      this.opts = opts
    }
  }
  class MockRect {
    type = 'rect'
    opts: Record<string, unknown>
    constructor(opts: Record<string, unknown> = {}) {
      this.opts = opts
    }
  }
  class MockFabricImage {
    type = 'image'
    opts: Record<string, unknown>
    constructor(opts: Record<string, unknown> = {}) {
      this.opts = opts
    }
    static fromURL = vi.fn().mockRejectedValue(new Error('load failed'))
  }
  class MockCanvas {
    objects: unknown[] = []
    width = 0
    height = 0
    backgroundColor = '#ffffff'
    add(obj: unknown) { this.objects.push(obj) }
    clear() { this.objects = [] }
    setDimensions(dims: { width: number; height: number }) {
      this.width = dims.width
      this.height = dims.height
    }
    renderAll() {}
  }
  return {
    Canvas: MockCanvas,
    Textbox: MockTextbox,
    Rect: MockRect,
    FabricImage: MockFabricImage,
  }
})

import { convertDomToCanvas } from '@/engine/index'

function makeRect(overrides: Partial<DOMRect> = {}): DOMRect {
  return { left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100, x: 0, y: 0, toJSON: () => ({}), ...overrides } as DOMRect
}

describe('convertDomToCanvas', () => {
  it('returns ConversionResult with canvas, elements, and warnings', async () => {
    const div = document.createElement('div')
    div.getBoundingClientRect = vi.fn().mockReturnValue(makeRect({ width: 1080, height: 1920 }))
    document.body.appendChild(div)

    const result = await convertDomToCanvas(div, { width: 1080, height: 1920 })

    expect(result).toHaveProperty('canvas')
    expect(result).toHaveProperty('elements')
    expect(result).toHaveProperty('warnings')
    expect(Array.isArray(result.elements)).toBe(true)
    expect(Array.isArray(result.warnings)).toBe(true)

    document.body.removeChild(div)
  })

  it('converts a text-only element to a text CanvasElement', async () => {
    const container = document.createElement('div')
    const span = document.createElement('span')
    span.textContent = 'Hello World'
    container.appendChild(span)
    document.body.appendChild(container)

    const containerRect = makeRect({ left: 0, top: 0, width: 1080, height: 1920 })
    const spanRect = makeRect({ left: 10, top: 10, width: 300, height: 40 })
    container.getBoundingClientRect = vi.fn().mockReturnValue(containerRect)
    span.getBoundingClientRect = vi.fn().mockReturnValue(spanRect)

    const result = await convertDomToCanvas(container, { width: 1080, height: 1920 })

    expect(result.elements.some((e) => e.type === 'text')).toBe(true)

    document.body.removeChild(container)
  })

  it('skips elements with zero dimensions', async () => {
    const container = document.createElement('div')
    const hidden = document.createElement('span')
    hidden.textContent = 'invisible'
    container.appendChild(hidden)
    document.body.appendChild(container)

    // Container has size, but child returns zero rect
    container.getBoundingClientRect = vi.fn().mockReturnValue(makeRect({ width: 200, height: 100 }))
    hidden.getBoundingClientRect = vi.fn().mockReturnValue(makeRect({ width: 0, height: 0 }))

    const result = await convertDomToCanvas(container, { width: 1080, height: 1920 })
    expect(result.elements).toHaveLength(0)

    document.body.removeChild(container)
  })

  it('records a warning when image load fails instead of throwing', async () => {
    const container = document.createElement('div')
    const img = document.createElement('img')
    img.src = 'http://invalid.test/img.png'
    container.appendChild(img)
    document.body.appendChild(container)

    container.getBoundingClientRect = vi.fn().mockReturnValue(makeRect({ width: 200, height: 200 }))
    img.getBoundingClientRect = vi.fn().mockReturnValue(makeRect({ width: 50, height: 50 }))

    const result = await convertDomToCanvas(container, { width: 1080, height: 1920 })

    expect(result.warnings.length).toBeGreaterThan(0)

    document.body.removeChild(container)
  })

  it('uses provided targetCanvas and does not create a new one', async () => {
    const { Canvas } = await import('fabric')
    const targetCanvas = new (Canvas as unknown as new () => {
      add: (o: unknown) => void
      clear: () => void
      setDimensions: (d: { width: number; height: number }) => void
      backgroundColor: string
      renderAll: () => void
    })()

    const div = document.createElement('div')
    div.getBoundingClientRect = vi.fn().mockReturnValue(makeRect({ width: 200, height: 200 }))
    document.body.appendChild(div)

    const result = await convertDomToCanvas(
      div,
      { width: 1080, height: 1920 },
      targetCanvas as unknown as import('fabric').Canvas,
    )

    expect(result.canvas).toBe(targetCanvas)

    document.body.removeChild(div)
  })
})
