/**
 * auditHelpers.test.ts — 纯函数工具集单测。
 *
 * 这些测试不依赖 DOM / 布局引擎，在 jsdom 下可以精确断言所有分支。
 * 覆盖：parseCssColor / contrastRatio / relativeLuminance / compositeOver /
 *       computeBoundsOverflow / describeBoundsOverflow / truncateText
 */
import { describe, it, expect } from 'vitest'
import {
  parseCssColor,
  relativeLuminance,
  contrastRatio,
  compositeOver,
  computeBoundsOverflow,
  computeVerticalOverlap,
  describeBoundsOverflow,
  truncateText,
} from '@/engine/audit/auditHelpers'

describe('parseCssColor', () => {
  it('parses rgb()', () => {
    expect(parseCssColor('rgb(255, 0, 0)')).toEqual({
      rgb: { r: 255, g: 0, b: 0 },
      alpha: 1,
    })
  })

  it('parses rgba() with alpha', () => {
    expect(parseCssColor('rgba(0, 0, 0, 0.5)')).toEqual({
      rgb: { r: 0, g: 0, b: 0 },
      alpha: 0.5,
    })
  })

  it('parses 6-digit hex', () => {
    expect(parseCssColor('#ff0000')).toEqual({
      rgb: { r: 255, g: 0, b: 0 },
      alpha: 1,
    })
  })

  it('parses 3-digit hex', () => {
    expect(parseCssColor('#fff')).toEqual({
      rgb: { r: 255, g: 255, b: 255 },
      alpha: 1,
    })
  })

  it('returns null for transparent', () => {
    expect(parseCssColor('transparent')).toBeNull()
  })

  it('returns null for unknown formats', () => {
    expect(parseCssColor('hsl(0, 100%, 50%)')).toBeNull()
    expect(parseCssColor('chartreuse')).toBeNull()
    expect(parseCssColor('')).toBeNull()
  })

  it('rejects out-of-range channel values', () => {
    expect(parseCssColor('rgb(256, 0, 0)')).toBeNull()
    expect(parseCssColor('rgb(-1, 0, 0)')).toBeNull()
  })
})

describe('relativeLuminance', () => {
  it('returns 1 for pure white', () => {
    expect(relativeLuminance({ r: 255, g: 255, b: 255 })).toBeCloseTo(1, 4)
  })

  it('returns 0 for pure black', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0 })).toBeCloseTo(0, 4)
  })

  it('green is brighter than red is brighter than blue (per WCAG weights)', () => {
    const red = relativeLuminance({ r: 255, g: 0, b: 0 })
    const green = relativeLuminance({ r: 0, g: 255, b: 0 })
    const blue = relativeLuminance({ r: 0, g: 0, b: 255 })
    expect(green).toBeGreaterThan(red)
    expect(red).toBeGreaterThan(blue)
  })
})

describe('contrastRatio', () => {
  const white = { r: 255, g: 255, b: 255 }
  const black = { r: 0, g: 0, b: 0 }

  it('black on white = 21:1', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 1)
  })

  it('is symmetric', () => {
    expect(contrastRatio(black, white)).toBeCloseTo(contrastRatio(white, black), 4)
  })

  it('same color = 1:1', () => {
    expect(contrastRatio(white, white)).toBeCloseTo(1, 4)
    expect(contrastRatio(black, black)).toBeCloseTo(1, 4)
  })

  it('light gray on white fails WCAG AA', () => {
    // #cccccc on white → ~1.61
    const ratio = contrastRatio({ r: 204, g: 204, b: 204 }, white)
    expect(ratio).toBeLessThan(4.5)
  })

  it('#595959 on white meets WCAG AA (>=4.5)', () => {
    // Known-good value from WCAG reference calculators
    const ratio = contrastRatio({ r: 89, g: 89, b: 89 }, white)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
  })
})

describe('compositeOver', () => {
  it('alpha=1 returns fg unchanged', () => {
    expect(
      compositeOver({ r: 255, g: 0, b: 0 }, 1, { r: 0, g: 0, b: 255 }),
    ).toEqual({ r: 255, g: 0, b: 0 })
  })

  it('alpha=0 returns bg unchanged', () => {
    expect(
      compositeOver({ r: 255, g: 0, b: 0 }, 0, { r: 0, g: 0, b: 255 }),
    ).toEqual({ r: 0, g: 0, b: 255 })
  })

  it('alpha=0.5 of red over blue ~ purple', () => {
    const result = compositeOver(
      { r: 255, g: 0, b: 0 },
      0.5,
      { r: 0, g: 0, b: 255 },
    )
    // 255*0.5 + 0*0.5 = 127.5 → rounds to 128
    // 0*0.5 + 255*0.5 = 127.5 → rounds to 128
    expect(result.r).toBe(128)
    expect(result.g).toBe(0)
    expect(result.b).toBe(128)
  })

  it('clamps alpha out of [0,1]', () => {
    expect(
      compositeOver({ r: 255, g: 0, b: 0 }, 2, { r: 0, g: 0, b: 0 }),
    ).toEqual({ r: 255, g: 0, b: 0 })
    expect(
      compositeOver({ r: 255, g: 0, b: 0 }, -1, { r: 0, g: 0, b: 0 }),
    ).toEqual({ r: 0, g: 0, b: 0 })
  })
})

describe('computeBoundsOverflow', () => {
  const bounds = { width: 1080, height: 1920 }

  it('returns null when element fits exactly', () => {
    const result = computeBoundsOverflow(
      { left: 0, top: 0, right: 1080, bottom: 1920 },
      bounds,
      2,
    )
    expect(result).toBeNull()
  })

  it('returns null within tolerance', () => {
    const result = computeBoundsOverflow(
      { left: -1.5, top: -0.5, right: 1081, bottom: 1921.5 },
      bounds,
      2,
    )
    expect(result).toBeNull()
  })

  it('detects right and bottom overflow', () => {
    const result = computeBoundsOverflow(
      { left: 100, top: 100, right: 1200, bottom: 2000 },
      bounds,
      2,
    )
    expect(result).not.toBeNull()
    expect(result!.rightOver).toBe(120)
    expect(result!.bottomOver).toBe(80)
    expect(result!.leftOver).toBe(0)
    expect(result!.topOver).toBe(0)
  })

  it('detects left and top overflow', () => {
    const result = computeBoundsOverflow(
      { left: -50, top: -30, right: 200, bottom: 200 },
      bounds,
      2,
    )
    expect(result).not.toBeNull()
    expect(result!.leftOver).toBe(50)
    expect(result!.topOver).toBe(30)
  })
})

describe('describeBoundsOverflow', () => {
  it('only describes directions with actual overflow', () => {
    const text = describeBoundsOverflow({
      leftOver: 0,
      topOver: 0,
      rightOver: 45,
      bottomOver: 0,
    })
    expect(text).toBe('右侧溢出 45px')
  })

  it('joins multiple directions with Chinese comma', () => {
    const text = describeBoundsOverflow({
      leftOver: 10,
      topOver: 0,
      rightOver: 20,
      bottomOver: 30,
    })
    expect(text).toContain('左侧溢出 10px')
    expect(text).toContain('右侧溢出 20px')
    expect(text).toContain('底部溢出 30px')
    expect(text.split('，').length).toBe(3)
  })

  it('rounds fractional pixels', () => {
    const text = describeBoundsOverflow({
      leftOver: 0,
      topOver: 0,
      rightOver: 12.7,
      bottomOver: 0,
    })
    expect(text).toBe('右侧溢出 13px')
  })
})

describe('truncateText', () => {
  it('returns short text as-is', () => {
    expect(truncateText('Hello')).toBe('Hello')
  })

  it('collapses whitespace', () => {
    expect(truncateText('  hello   world  ')).toBe('hello world')
  })

  it('truncates with ellipsis at default 30', () => {
    const long = 'a'.repeat(50)
    const result = truncateText(long)
    expect(result.length).toBe(31) // 30 + '…'
    expect(result.endsWith('…')).toBe(true)
  })

  it('respects custom maxLen', () => {
    expect(truncateText('abcdefghij', 5)).toBe('abcde…')
  })

  it('handles empty / null-like input', () => {
    expect(truncateText('')).toBe('')
    expect(truncateText('   ')).toBe('')
  })
})

describe('computeVerticalOverlap', () => {
  it('returns 0 when boxes do not overlap', () => {
    const a = { left: 0, top: 0, right: 100, bottom: 100 }
    const b = { left: 0, top: 200, right: 100, bottom: 300 }
    expect(computeVerticalOverlap(a, b)).toBe(0)
  })

  it('returns 0 when boxes just touch', () => {
    const a = { left: 0, top: 0, right: 100, bottom: 100 }
    const b = { left: 0, top: 100, right: 100, bottom: 200 }
    expect(computeVerticalOverlap(a, b)).toBe(0)
  })

  it('detects overlap when upper.bottom > lower.top', () => {
    const a = { left: 0, top: 0, right: 100, bottom: 150 }
    const b = { left: 0, top: 100, right: 100, bottom: 200 }
    expect(computeVerticalOverlap(a, b)).toBe(50)
  })

  it('is symmetric (order-independent)', () => {
    const a = { left: 0, top: 0, right: 100, bottom: 150 }
    const b = { left: 0, top: 100, right: 100, bottom: 200 }
    expect(computeVerticalOverlap(a, b)).toBe(computeVerticalOverlap(b, a))
  })

  it('handles complete containment (one box inside the other)', () => {
    const outer = { left: 0, top: 0, right: 500, bottom: 500 }
    const inner = { left: 50, top: 100, right: 200, bottom: 200 }
    // overlap = upper.bottom(500) - lower.top(100) = 400
    expect(computeVerticalOverlap(outer, inner)).toBe(400)
  })
})
