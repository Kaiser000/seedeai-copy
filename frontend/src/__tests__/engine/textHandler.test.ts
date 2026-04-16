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

import {
  createTextObject,
  createStyledTextObject,
  computeSingleLineWidthSlack,
} from '@/engine/handlers/textHandler'
import type { ElementLayout } from '@/engine/parsers/layoutParser'
import type { ParsedStyle } from '@/engine/parsers/styleParser'
import type { InlineSegment } from '@/engine/parsers/inlineTextParser'

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

describe('createStyledTextObject', () => {
  function makeSegment(text: string, overrides: Partial<ParsedStyle> = {}): InlineSegment {
    return { text, style: makeStyle(overrides) }
  }

  it('merges all segments into a single text string in order', () => {
    // 场景：<p>全场<span>5折</span>起</p> — 旧实现丢失 "全场" 和 "起"
    const obj = createStyledTextObject(
      [
        makeSegment('全场'),
        makeSegment('5折', { color: '#FACC15' }),
        makeSegment('起'),
      ],
      makeLayout({ width: 400 }),
      makeStyle(),
    )
    expect((obj as unknown as { text: string }).text).toBe('全场5折起')
  })

  it('builds per-character styles keyed by char index on line 0', () => {
    const obj = createStyledTextObject(
      [
        makeSegment('¥', { fontSize: 28, color: '#DC2626' }),
        makeSegment('50', { fontSize: 88, color: '#DC2626' }),
      ],
      makeLayout(),
      makeStyle(),
    ) as unknown as { styles: Record<number, Record<number, { fontSize: number; fill: string }>> }

    // ¥50 总共 3 个字符：index 0 = ¥(28px), 1 = 5(88px), 2 = 0(88px)
    expect(obj.styles[0][0].fontSize).toBe(28)
    expect(obj.styles[0][1].fontSize).toBe(88)
    expect(obj.styles[0][2].fontSize).toBe(88)
    expect(obj.styles[0][0].fill).toBe('#DC2626')
    expect(obj.styles[0][2].fill).toBe('#DC2626')
  })

  it('uses the largest segment fontSize as the Textbox base fontSize', () => {
    // 保证行高被最大字号驱动，小字号段不会把行高拉低
    const obj = createStyledTextObject(
      [
        makeSegment('小', { fontSize: 20 }),
        makeSegment('大', { fontSize: 100 }),
      ],
      makeLayout(),
      makeStyle({ fontSize: 16 }),
    )
    expect((obj as unknown as { fontSize: number }).fontSize).toBe(100)
  })

  it('inherits textAlign and letterSpacing from base style', () => {
    // 段字号都留默认（16），base fontSize 40 成为 reduce 的初始最大值
    const obj = createStyledTextObject(
      [makeSegment('A'), makeSegment('B')],
      makeLayout(),
      makeStyle({ textAlign: 'center', letterSpacing: 2, fontSize: 40 }),
    ) as unknown as { textAlign: string; charSpacing: number }
    expect(obj.textAlign).toBe('center')
    // maxFontSize = max(40, 16, 16) = 40 → charSpacing = 2 / 40 * 1000 = 50
    expect(obj.charSpacing).toBeCloseTo(50, 1)
  })

  it('enables splitByGrapheme for CJK character-level wrapping', () => {
    const obj = createStyledTextObject(
      [makeSegment('中'), makeSegment('文')],
      makeLayout(),
      makeStyle(),
    )
    expect((obj as unknown as { splitByGrapheme: boolean }).splitByGrapheme).toBe(true)
  })
})

describe('computeSingleLineWidthSlack', () => {
  // 真实复现："狂欢五一" 220px 4 字在 DOM 里单行 ~880 宽；
  // fabric 用 fallback 字体测量偏宽造成 3+1 换行。
  // 期望：layout.height ≈ 220 × 1.1 → 判为单行 → 扩宽且保持位置。
  const singleLineLayout: ElementLayout = { left: 100, top: 50, width: 880, height: 242 }

  it('does not apply slack when DOM element renders multi-line', () => {
    const multilineLayout: ElementLayout = { left: 0, top: 0, width: 400, height: 500 }
    const result = computeSingleLineWidthSlack(multilineLayout, 24, 1.2, 'left')
    expect(result.slackApplied).toBe(false)
    expect(result.left).toBe(0)
    expect(result.width).toBe(400)
  })

  it('applies slack when DOM element renders single line (height ≈ fontSize × lineHeight)', () => {
    const result = computeSingleLineWidthSlack(singleLineLayout, 220, 1.1, 'left')
    expect(result.slackApplied).toBe(true)
    expect(result.width).toBeGreaterThan(880)
  })

  it('slack = max(width × 0.5, fontSize × 2)', () => {
    // width × 0.5 = 440, fontSize × 2 = 440 → 取 440
    const r = computeSingleLineWidthSlack(singleLineLayout, 220, 1.1, 'left')
    expect(r.width).toBe(880 + 440)
  })

  it('left-aligned: extends rightward only, left unchanged', () => {
    const r = computeSingleLineWidthSlack(singleLineLayout, 220, 1.1, 'left')
    expect(r.left).toBe(100) // 未位移
  })

  it('center-aligned: symmetric expansion keeps visual center fixed', () => {
    const r = computeSingleLineWidthSlack(singleLineLayout, 220, 1.1, 'center')
    // slack = 440, 左移 220
    expect(r.left).toBe(100 - 220)
    // 扩展后中心 = (left + width/2) = (-120) + 1320/2 = -120 + 660 = 540
    // 原中心 = 100 + 880/2 = 540 ✓
    const newCenter = r.left + r.width / 2
    const origCenter = singleLineLayout.left + singleLineLayout.width / 2
    expect(newCenter).toBeCloseTo(origCenter, 5)
  })

  it('right-aligned: extends leftward only, right edge fixed', () => {
    const r = computeSingleLineWidthSlack(singleLineLayout, 220, 1.1, 'right')
    expect(r.left).toBe(100 - 440) // slack 全部加到左边
    // 右边 = left + width = -340 + 1320 = 980
    // 原右边 = 100 + 880 = 980 ✓
    const newRight = r.left + r.width
    const origRight = singleLineLayout.left + singleLineLayout.width
    expect(newRight).toBe(origRight)
  })

  it('small font uses fontSize × 2 floor when width × 0.5 is smaller', () => {
    // width=100 (很窄), fontSize=80 → 0.5*100=50, 2*80=160 → slack=160
    const layout: ElementLayout = { left: 0, top: 0, width: 100, height: 88 }
    const r = computeSingleLineWidthSlack(layout, 80, 1.1, 'left')
    expect(r.slackApplied).toBe(true)
    expect(r.width).toBe(100 + 160)
  })
})

describe('createTextObject single-line wrap protection', () => {
  it('expands Textbox width for DOM single-line text to prevent font metric wrap', () => {
    // 模拟 "狂欢五一" 场景：DOM 单行 880 宽，fabric 字体度量偏差可能导致换行
    const layout: ElementLayout = { left: 100, top: 50, width: 880, height: 242 }
    const style = makeStyle({ fontSize: 220, lineHeight: 1.1, textAlign: 'left' })
    const obj = createTextObject('狂欢五一', layout, style) as unknown as { width: number; left: number }
    expect(obj.width).toBeGreaterThan(880)
    expect(obj.left).toBe(100) // left-align 不位移
  })

  it('preserves width/left for multi-line DOM text (no slack)', () => {
    const layout: ElementLayout = { left: 0, top: 0, width: 400, height: 600 }
    const style = makeStyle({ fontSize: 20, lineHeight: 1.5 })
    const obj = createTextObject('很长的段落文本需要多行', layout, style) as unknown as { width: number; left: number }
    expect(obj.width).toBe(400)
    expect(obj.left).toBe(0)
  })
})
