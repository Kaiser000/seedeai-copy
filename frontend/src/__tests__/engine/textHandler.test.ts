import { describe, it, expect, vi } from 'vitest'

vi.mock('fabric', () => {
  function MockTextbox(this: Record<string, unknown>, text: string, opts: Record<string, unknown> = {}) {
    this.type = 'textbox'
    this.text = text
    Object.assign(this, opts)
  }
  function MockShadow(this: Record<string, unknown>, opts: Record<string, unknown> = {}) {
    Object.assign(this, opts)
  }
  return { Textbox: MockTextbox, Shadow: MockShadow }
})

import { createTextObject } from '@/engine/handlers/textHandler'
import type { ElementLayout } from '@/engine/parsers/layoutParser'
import type { ParsedStyle } from '@/engine/parsers/styleParser'

function makeLayout(overrides: Partial<ElementLayout> = {}): ElementLayout {
  return { left: 0, top: 0, width: 200, height: 50, ...overrides }
}

function makeStyle(overrides: Partial<ParsedStyle> = {}): ParsedStyle {
  return {
    backgroundColor: '#ffffff',
    color: '#000000',
    fontSize: 16,
    fontFamily: 'sans-serif',
    fontWeight: 'normal',
    fontStyle: 'normal',
    lineHeight: 1.2,
    letterSpacing: 0,
    textAlign: 'left',
    textDecoration: { underline: false, linethrough: false, overline: false },
    borderColor: '#000000',
    borderWidth: 0,
    borderRadius: 0,
    opacity: 1,
    boxShadow: null,
    textShadow: null,
    gradient: null,
    rotation: 0,
    objectFit: 'fill',
    objectPosition: '50% 50%',
    overflow: 'visible',
    ...overrides,
  }
}

describe('textHandler', () => {
  it('creates a Textbox with the given text', () => {
    const obj = createTextObject('Hello', makeLayout(), makeStyle())
    expect((obj as unknown as { text: string }).text).toBe('Hello')
  })

  it('applies position and size from layout', () => {
    const layout = makeLayout({ left: 100, top: 200, width: 400 })
    const obj = createTextObject('Pos', layout, makeStyle()) as unknown as Record<string, unknown>
    expect(obj.left).toBe(100)
    expect(obj.top).toBe(200)
    expect(obj.width).toBe(400)
  })

  it('applies color from style', () => {
    const obj = createTextObject('Colored', makeLayout(), makeStyle({ color: '#FF0000' }))
    expect((obj as unknown as { fill: string }).fill).toBe('#FF0000')
  })

  it('applies fontSize from style', () => {
    const obj = createTextObject('Big', makeLayout(), makeStyle({ fontSize: 48 }))
    expect((obj as unknown as { fontSize: number }).fontSize).toBe(48)
  })

  it('strips quotes and takes first font from CSS font-family list', () => {
    const obj = createTextObject('Font', makeLayout(), makeStyle({ fontFamily: '"AlibabaPuHuiTi", sans-serif' }))
    // Implementation splits on comma and strips surrounding quotes from the first entry
    expect((obj as unknown as { fontFamily: string }).fontFamily).toBe('AlibabaPuHuiTi')
  })

  it('handles fontFamily with no quotes', () => {
    const obj = createTextObject('Font', makeLayout(), makeStyle({ fontFamily: 'Arial, sans-serif' }))
    expect((obj as unknown as { fontFamily: string }).fontFamily).toBe('Arial')
  })

  it('applies fontWeight from style', () => {
    const obj = createTextObject('Bold', makeLayout(), makeStyle({ fontWeight: 'bold' }))
    expect((obj as unknown as { fontWeight: string }).fontWeight).toBe('bold')
  })
})
