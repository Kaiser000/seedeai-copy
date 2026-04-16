/**
 * geometricAudit.test.ts — 主审计函数的集成测试。
 *
 * jsdom 不实现布局引擎（所有 getBoundingClientRect 都返回 0），所以这里
 * 用 Object.defineProperty 给具体节点打补丁，模拟不同场景的测量结果。
 *
 * 覆盖：
 *   1. 全通过时 passed=true、issues=[]
 *   2. OUT_OF_BOUNDS：元素右侧超出画布
 *   3. 被 overflow:hidden 祖先裁切时不报 OUT_OF_BOUNDS
 *   4. TEXT_OVERFLOW：scrollWidth > clientWidth
 *   5. MIN_FONT_SIZE：字号低于阈值
 *   6. 审计失败不抛异常
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { runGeometricAudit } from '@/engine/audit/geometricAudit'
import { formatIssuesForRepair, formatIssuesForUi } from '@/engine/audit/auditFormatter'

const CANVAS = { width: 1080, height: 1920 }

/** 给一个元素打补丁：固定它的 bbox / scrollWidth / clientWidth / scrollHeight / clientHeight */
function mockLayout(
  el: HTMLElement,
  layout: {
    left?: number
    top?: number
    width?: number
    height?: number
    scrollWidth?: number
    clientWidth?: number
    scrollHeight?: number
    clientHeight?: number
  },
): void {
  const { left = 0, top = 0, width = 0, height = 0 } = layout

  el.getBoundingClientRect = () => ({
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }) as DOMRect

  if (layout.scrollWidth !== undefined) {
    Object.defineProperty(el, 'scrollWidth', {
      configurable: true,
      value: layout.scrollWidth,
    })
  }
  if (layout.clientWidth !== undefined) {
    Object.defineProperty(el, 'clientWidth', {
      configurable: true,
      value: layout.clientWidth,
    })
  }
  if (layout.scrollHeight !== undefined) {
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      value: layout.scrollHeight,
    })
  }
  if (layout.clientHeight !== undefined) {
    Object.defineProperty(el, 'clientHeight', {
      configurable: true,
      value: layout.clientHeight,
    })
  }
}

describe('runGeometricAudit', () => {
  let root: HTMLDivElement

  beforeEach(() => {
    root = document.createElement('div')
    document.body.appendChild(root)
    // 根节点 = 画布大小
    mockLayout(root, { left: 0, top: 0, width: CANVAS.width, height: CANVAS.height })
  })

  afterEach(() => {
    if (root.parentNode) root.parentNode.removeChild(root)
  })

  it('returns passed=true for an empty root', () => {
    const report = runGeometricAudit(root, CANVAS)
    expect(report.passed).toBe(true)
    expect(report.issues).toEqual([])
    expect(report.canvasBounds).toEqual(CANVAS)
  })

  it('passes when a single in-bounds text element has adequate font size', () => {
    const p = document.createElement('p')
    p.textContent = 'Hello World'
    p.style.fontSize = '24px'
    p.style.color = 'rgb(0, 0, 0)'
    p.style.backgroundColor = 'rgb(255, 255, 255)'
    root.appendChild(p)
    mockLayout(p, {
      left: 100,
      top: 100,
      width: 400,
      height: 40,
      scrollWidth: 400,
      clientWidth: 400,
      scrollHeight: 40,
      clientHeight: 40,
    })

    const report = runGeometricAudit(root, CANVAS)
    expect(report.passed).toBe(true)
  })

  it('flags OUT_OF_BOUNDS when an element sticks out on the right', () => {
    const box = document.createElement('div')
    box.style.backgroundColor = 'rgb(200, 0, 0)' // 视觉显著
    root.appendChild(box)
    mockLayout(box, { left: 900, top: 100, width: 400, height: 200 })

    const report = runGeometricAudit(root, CANVAS)
    const outOfBounds = report.issues.filter((i) => i.rule === 'OUT_OF_BOUNDS')
    expect(outOfBounds.length).toBe(1)
    expect(outOfBounds[0].severity).toBe('error')
    expect(outOfBounds[0].message).toContain('右侧溢出')
    expect(report.passed).toBe(false)
    expect(report.errorCount).toBeGreaterThan(0)
  })

  it('does NOT flag OUT_OF_BOUNDS when an ancestor has overflow:hidden', () => {
    const wrapper = document.createElement('div')
    wrapper.style.overflow = 'hidden'
    wrapper.style.backgroundColor = 'rgb(255, 255, 255)'
    root.appendChild(wrapper)
    mockLayout(wrapper, {
      left: 0,
      top: 0,
      width: CANVAS.width,
      height: CANVAS.height,
    })

    const box = document.createElement('div')
    box.style.backgroundColor = 'rgb(200, 0, 0)'
    wrapper.appendChild(box)
    mockLayout(box, { left: 900, top: 100, width: 400, height: 200 })

    const report = runGeometricAudit(root, CANVAS)
    const outOfBounds = report.issues.filter((i) => i.rule === 'OUT_OF_BOUNDS')
    expect(outOfBounds.length).toBe(0)
  })

  it('does NOT flag OUT_OF_BOUNDS for a visually insignificant (transparent) container', () => {
    const box = document.createElement('div')
    // 无背景、无边框、无阴影 —— 纯布局容器，即便越界也没人看见
    root.appendChild(box)
    mockLayout(box, { left: 900, top: 100, width: 400, height: 200 })

    const report = runGeometricAudit(root, CANVAS)
    const outOfBounds = report.issues.filter((i) => i.rule === 'OUT_OF_BOUNDS')
    expect(outOfBounds.length).toBe(0)
  })

  it('flags TEXT_OVERFLOW when scrollWidth exceeds clientWidth', () => {
    const p = document.createElement('p')
    p.textContent = 'A very long string that overflows the fixed container width'
    p.style.fontSize = '24px'
    p.style.color = 'rgb(0, 0, 0)'
    p.style.backgroundColor = 'rgb(255, 255, 255)'
    root.appendChild(p)
    mockLayout(p, {
      left: 100,
      top: 100,
      width: 300,
      height: 40,
      scrollWidth: 450, // 溢出 150px
      clientWidth: 300,
      scrollHeight: 40,
      clientHeight: 40,
    })

    const report = runGeometricAudit(root, CANVAS)
    const overflows = report.issues.filter((i) => i.rule === 'TEXT_OVERFLOW')
    expect(overflows.length).toBe(1)
    expect(overflows[0].severity).toBe('error')
    expect(overflows[0].message).toContain('宽度 150px')
    expect(overflows[0].elementPath).toContain('p')
  })

  it('flags MIN_FONT_SIZE as warning when font-size below threshold', () => {
    const p = document.createElement('p')
    p.textContent = 'tiny'
    p.style.fontSize = '10px'
    p.style.color = 'rgb(0, 0, 0)'
    p.style.backgroundColor = 'rgb(255, 255, 255)'
    root.appendChild(p)
    mockLayout(p, {
      left: 100,
      top: 100,
      width: 100,
      height: 14,
      scrollWidth: 100,
      clientWidth: 100,
      scrollHeight: 14,
      clientHeight: 14,
    })

    const report = runGeometricAudit(root, CANVAS)
    const small = report.issues.filter((i) => i.rule === 'MIN_FONT_SIZE')
    expect(small.length).toBe(1)
    expect(small[0].severity).toBe('warning')
    expect(report.warningCount).toBeGreaterThan(0)
  })

  it('accepts a custom minBodyFontSize threshold', () => {
    const p = document.createElement('p')
    p.textContent = 'ok at 16 but not at 24'
    p.style.fontSize = '16px'
    p.style.color = 'rgb(0, 0, 0)'
    p.style.backgroundColor = 'rgb(255, 255, 255)'
    root.appendChild(p)
    mockLayout(p, {
      left: 100,
      top: 100,
      width: 300,
      height: 20,
      scrollWidth: 300,
      clientWidth: 300,
      scrollHeight: 20,
      clientHeight: 20,
    })

    const lax = runGeometricAudit(root, CANVAS, { minBodyFontSize: 14 })
    expect(lax.issues.filter((i) => i.rule === 'MIN_FONT_SIZE').length).toBe(0)

    const strict = runGeometricAudit(root, CANVAS, { minBodyFontSize: 24 })
    expect(strict.issues.filter((i) => i.rule === 'MIN_FONT_SIZE').length).toBe(1)
  })

  it('flags SIBLING_OVERLAP when flow siblings overlap vertically', () => {
    // 模拟两个 section，上方 section 的 bottom 超过下方 section 的 top
    const sectionA = document.createElement('section')
    sectionA.style.backgroundColor = 'rgb(255, 0, 0)'
    root.appendChild(sectionA)
    mockLayout(sectionA, { left: 0, top: 0, width: 1080, height: 500 })

    const sectionB = document.createElement('section')
    sectionB.style.backgroundColor = 'rgb(0, 0, 255)'
    root.appendChild(sectionB)
    // sectionB 的 top=400 < sectionA 的 bottom=500 → 重叠 100px
    mockLayout(sectionB, { left: 0, top: 400, width: 1080, height: 400 })

    const report = runGeometricAudit(root, CANVAS)
    const overlaps = report.issues.filter((i) => i.rule === 'SIBLING_OVERLAP')
    expect(overlaps.length).toBe(1)
    expect(overlaps[0].severity).toBe('error')
    expect(overlaps[0].message).toContain('100px')
    expect(overlaps[0].message).toContain('section')
  })

  it('does NOT flag SIBLING_OVERLAP for absolute-positioned siblings', () => {
    const sectionA = document.createElement('section')
    sectionA.style.backgroundColor = 'rgb(255, 0, 0)'
    root.appendChild(sectionA)
    mockLayout(sectionA, { left: 0, top: 0, width: 1080, height: 500 })

    const decoration = document.createElement('div')
    decoration.style.position = 'absolute'
    decoration.style.backgroundColor = 'rgb(0, 255, 0)'
    root.appendChild(decoration)
    mockLayout(decoration, { left: 0, top: 400, width: 200, height: 100 })

    const report = runGeometricAudit(root, CANVAS)
    const overlaps = report.issues.filter((i) => i.rule === 'SIBLING_OVERLAP')
    expect(overlaps.length).toBe(0)
  })

  it('does NOT flag SIBLING_OVERLAP for small overlap under threshold (10px)', () => {
    const sectionA = document.createElement('section')
    sectionA.style.backgroundColor = 'rgb(255, 0, 0)'
    root.appendChild(sectionA)
    mockLayout(sectionA, { left: 0, top: 0, width: 1080, height: 400 })

    const sectionB = document.createElement('section')
    sectionB.style.backgroundColor = 'rgb(0, 0, 255)'
    root.appendChild(sectionB)
    // 只重叠 5px → 低于阈值 10px
    mockLayout(sectionB, { left: 0, top: 395, width: 1080, height: 400 })

    const report = runGeometricAudit(root, CANVAS)
    const overlaps = report.issues.filter((i) => i.rule === 'SIBLING_OVERLAP')
    expect(overlaps.length).toBe(0)
  })

  it('never throws even on malformed inputs', () => {
    const weird = document.createElement('div')
    root.appendChild(weird)
    // bbox 完全不设置 → 各种 0
    expect(() => runGeometricAudit(root, CANVAS)).not.toThrow()
  })

  it('records durationMs and timestamp', () => {
    const report = runGeometricAudit(root, CANVAS)
    expect(typeof report.durationMs).toBe('number')
    expect(report.durationMs).toBeGreaterThanOrEqual(0)
    expect(typeof report.timestamp).toBe('number')
    expect(report.timestamp).toBeGreaterThan(0)
  })
})

describe('auditFormatter', () => {
  it('formatIssuesForRepair returns empty string for passing report', () => {
    const empty = runGeometricAudit(document.createElement('div'), CANVAS)
    expect(formatIssuesForRepair(empty)).toBe('')
  })

  it('formatIssuesForRepair includes canvas size + both severities', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    mockLayout(root, { left: 0, top: 0, width: CANVAS.width, height: CANVAS.height })

    // Issue 1: out of bounds (error)
    const box = document.createElement('div')
    box.style.backgroundColor = 'rgb(200, 0, 0)'
    root.appendChild(box)
    mockLayout(box, { left: 900, top: 100, width: 400, height: 200 })

    // Issue 2: tiny font (warning)
    const p = document.createElement('p')
    p.textContent = 'micro'
    p.style.fontSize = '8px'
    p.style.color = 'rgb(0, 0, 0)'
    p.style.backgroundColor = 'rgb(255, 255, 255)'
    root.appendChild(p)
    mockLayout(p, {
      left: 100,
      top: 400,
      width: 50,
      height: 10,
      scrollWidth: 50,
      clientWidth: 50,
      scrollHeight: 10,
      clientHeight: 10,
    })

    const report = runGeometricAudit(root, CANVAS)
    const prompt = formatIssuesForRepair(report)

    expect(prompt).toContain('1080×1920')
    expect(prompt).toContain('必须修复')
    expect(prompt).toContain('建议修复')
    expect(prompt).toContain('元素超出画布')
    expect(prompt).toContain('字号过小')
    expect(prompt).toContain('Poster 组件')

    document.body.removeChild(root)
  })

  it('formatIssuesForUi produces a headline and item list', () => {
    const root = document.createElement('div')
    document.body.appendChild(root)
    mockLayout(root, { left: 0, top: 0, width: CANVAS.width, height: CANVAS.height })
    const box = document.createElement('div')
    box.style.backgroundColor = 'rgb(0, 128, 255)'
    root.appendChild(box)
    mockLayout(box, { left: 900, top: 100, width: 400, height: 200 })

    const report = runGeometricAudit(root, CANVAS)
    const ui = formatIssuesForUi(report)
    expect(ui.passed).toBe(false)
    expect(ui.headline).toMatch(/\d+ 个错误/)
    expect(ui.items.length).toBeGreaterThan(0)
    expect(ui.items[0].ruleLabel).toBeTruthy()

    document.body.removeChild(root)
  })
})
