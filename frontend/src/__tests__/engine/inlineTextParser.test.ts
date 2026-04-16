/**
 * inlineTextParser.test.ts — 覆盖"内联文本容器"检测和文本段收集的核心行为。
 *
 * 被测场景来自真实翻车案例：
 *   1. <p>全场<span>5折</span>起</p>                          — TEXT_NODE + span + TEXT_NODE
 *   2. <div class="flex"><span>¥</span><span>50</span></div>  — 多 span 无 TEXT_NODE
 *   3. <p>纯文本</p>                                          — 单叶子，不应合并
 *   4. <div><span>仅一段</span></div>                          — 单段，不应合并
 *   5. <div><img/><span>text</span></div>                     — 含非 inline 元素，直接否决
 *   6. <p>前<b><i>嵌套</i></b>后</p>                           — 嵌套 inline 元素，直接否决
 *
 * 测试通过 jsdom 真实构建 DOM 树，不 mock computedStyle（parseStyle 会使用默认值）。
 */
import { describe, it, expect } from 'vitest'
import {
  isInlineTextContainer,
  collectInlineSegments,
} from '@/engine/parsers/inlineTextParser'

/** 辅助：把 HTML 字符串解析成根元素，自动挂到 document.body 以便 computedStyle 工作 */
function makeElement(html: string): HTMLElement {
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html.trim()
  const root = wrapper.firstElementChild as HTMLElement
  document.body.appendChild(root)
  return root
}

describe('isInlineTextContainer', () => {
  it('识别 TEXT_NODE + span + TEXT_NODE 混排（3 段）', () => {
    // <p>全场<span>5折</span>起</p> — 最常见翻车 case
    const el = makeElement('<p>全场<span style="color:red">5折</span>起</p>')
    expect(isInlineTextContainer(el)).toBe(true)
  })

  it('识别多 span 无 TEXT_NODE（2 段）', () => {
    // 优惠券金额：<div><span>¥</span><span>50</span></div>
    const el = makeElement(
      '<div style="display:flex"><span style="font-size:28px">¥</span><span style="font-size:88px">50</span></div>',
    )
    expect(isInlineTextContainer(el)).toBe(true)
  })

  it('叶子纯文本元素不应被当作内联容器（交给 isTextNode 处理）', () => {
    const el = makeElement('<p>纯文本</p>')
    expect(isInlineTextContainer(el)).toBe(false)
  })

  it('只有一个 span 子元素、没有 TEXT_NODE 时不合并', () => {
    const el = makeElement('<div><span>仅一段</span></div>')
    expect(isInlineTextContainer(el)).toBe(false)
  })

  it('出现非 inline 元素（img）时整体否决', () => {
    const el = makeElement('<div><img src="x.png"/><span>text</span></div>')
    expect(isInlineTextContainer(el)).toBe(false)
  })

  it('出现嵌套 inline 元素（inline 元素下再有元素子节点）时整体否决', () => {
    // <b> 里再嵌一个 <i>，<b> 就不是"纯文本 inline 元素"了
    const el = makeElement('<p>前<b><i>嵌套</i></b>后</p>')
    expect(isInlineTextContainer(el)).toBe(false)
  })

  it('空元素不合并', () => {
    const el = makeElement('<p></p>')
    expect(isInlineTextContainer(el)).toBe(false)
  })

  it('接受 b/i/em/strong 等白名单 inline 标签', () => {
    const el = makeElement('<h1><b>Hot</b><em>Sale</em></h1>')
    expect(isInlineTextContainer(el)).toBe(true)
  })
})

describe('collectInlineSegments', () => {
  it('按 DOM 顺序收集 TEXT_NODE 和 span 段', () => {
    const el = makeElement('<p>全场<span style="color:red">5折</span>起</p>')
    const segments = collectInlineSegments(el)
    expect(segments.map(s => s.text)).toEqual(['全场', '5折', '起'])
  })

  it('不同字号段各自保持独立 fontSize', () => {
    const el = makeElement(
      '<div><span style="font-size:28px">¥</span><span style="font-size:88px">50</span></div>',
    )
    const segments = collectInlineSegments(el)
    expect(segments).toHaveLength(2)
    expect(segments[0].text).toBe('¥')
    expect(segments[0].style.fontSize).toBe(28)
    expect(segments[1].text).toBe('50')
    expect(segments[1].style.fontSize).toBe(88)
  })

  it('TEXT_NODE 段继承父元素样式', () => {
    // 父设 color:blue，中间 span 覆盖为 red，最后 TEXT_NODE 应该继承父的 blue
    const el = makeElement(
      '<p style="color:blue">A<span style="color:red">B</span>C</p>',
    )
    const segments = collectInlineSegments(el)
    expect(segments).toHaveLength(3)
    expect(segments[0].text).toBe('A')
    expect(segments[1].text).toBe('B')
    expect(segments[2].text).toBe('C')
    // 颜色回来的是 computed rgb 值，jsdom 会把 blue → "rgb(0, 0, 255)"
    expect(segments[0].style.color).toMatch(/rgb\(0,\s*0,\s*255\)/)
    expect(segments[1].style.color).toMatch(/rgb\(255,\s*0,\s*0\)/)
    expect(segments[2].style.color).toMatch(/rgb\(0,\s*0,\s*255\)/)
  })

  it('跳过完全空的 TEXT_NODE', () => {
    // 手动构造一个空 TEXT_NODE 混在 span 之间
    const el = document.createElement('p')
    el.appendChild(document.createTextNode(''))
    const span = document.createElement('span')
    span.textContent = 'X'
    el.appendChild(span)
    document.body.appendChild(el)
    const segments = collectInlineSegments(el)
    expect(segments).toHaveLength(1)
    expect(segments[0].text).toBe('X')
  })
})
