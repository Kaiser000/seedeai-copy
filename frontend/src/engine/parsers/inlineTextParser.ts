/**
 * inlineTextParser.ts — 识别并解构"内联文本容器"。
 *
 * 解决的核心问题：
 *   LLM 常生成这样的 JSX：
 *     <p>全场<span style={{color:'red'}}>5折</span>起</p>
 *     <div className="flex items-baseline"><span>¥</span><span>50</span></div>
 *
 *   旧 engine 的 isTextNode 要求 element.children.length === 0，
 *   所以上面两种结构都走"容器"分支：
 *     - 父节点的 TEXT_NODE（"全场"、"起"）被 getTextContent 忽略
 *     - 内层 span 被当作独立叶子文本，各自生成 Textbox
 *   结果是：
 *     1. 父节点的直接文本内容被丢失（例 1 只剩 "5折"）
 *     2. flex items-baseline 的基线对齐丢失，不同字号 span 上下错位
 *        （例 2 ¥ 飘在数字顶部像一个"点"）
 *
 * 本模块的修复思路：
 *   把这类"所有子节点都是 TEXT_NODE 或纯文本 inline 元素"的容器视作一个整体，
 *   按 DOM 顺序收集所有分段文本和各自的样式，
 *   交由 textHandler 的 createStyledTextObject 合并为一个带
 *   per-character styles 的 fabric.Textbox。这样：
 *     - 所有文本段都被保留
 *     - 不同字号的段在同一行上基线对齐（fabric Textbox 按最大字号驱动行高）
 *     - 颜色/字重/字体等逐段样式通过 styles 映射精确保持
 */

import type { ParsedStyle } from './styleParser'
import { parseStyle } from './styleParser'

/**
 * 允许被合并的 inline 文本元素白名单。
 * 只有这些标签的纯文本子节点才会被视为 inline 文本段。
 * 任何非白名单标签（例如 <div>、<img>、<button>）的出现都会使容器失去"内联文本容器"资格。
 */
const INLINE_TEXT_TAGS = new Set([
  'SPAN', 'B', 'I', 'EM', 'STRONG', 'SMALL', 'SUB', 'SUP', 'MARK', 'U',
])

/** 一个内联文本段：文本内容 + 该段对应的已解析样式 */
export interface InlineSegment {
  /** 该段文本字符串（原始 textContent，不做 trim，保留内部空格）*/
  text: string
  /** 该段的已解析样式，用于生成 fabric per-character styles */
  style: ParsedStyle
}

/**
 * 判断一个元素节点是否是"纯文本 inline 元素"：
 * 必须满足：
 *   1. 标签在 INLINE_TEXT_TAGS 白名单内
 *   2. 其所有子节点都是 TEXT_NODE（不能再嵌套任何元素）
 */
function isPureInlineTextElement(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false
  const el = node as HTMLElement
  if (!INLINE_TEXT_TAGS.has(el.tagName)) return false
  for (const child of el.childNodes) {
    if (child.nodeType !== Node.TEXT_NODE) return false
  }
  return true
}

/**
 * 判断一个容器元素是否应被当作"内联文本容器"整体合并。
 *
 * 判定条件（全部满足）：
 *   1. 元素至少有 2 个有效文本段（TEXT_NODE 或 纯文本 inline 元素），
 *      少于 2 段时没必要合并，走原有路径即可
 *   2. 所有元素类型的子节点都必须是 isPureInlineTextElement，
 *      出现任何其他类型元素立即否决
 *   3. TEXT_NODE 的空白折叠后非空
 *
 * 典型命中场景：
 *   - <p>全场<span>5折</span>起</p>         → 3 段（TEXT + span + TEXT）
 *   - <div><span>¥</span><span>50</span></div> → 2 段（span + span）
 *   - <h1><b>Hot</b> <em>Sale</em></h1>    → 3 段（b + 空格 + em）
 *
 * 典型不命中：
 *   - <p>纯文本</p>                         → 0 段元素 + 1 段文本 = 1，不合并（走 isTextNode）
 *   - <div><img/><span>text</span></div>    → 出现 img，直接否决
 *   - <div><span>只有一段</span></div>       → 仅 1 段，不合并
 */
export function isInlineTextContainer(element: HTMLElement): boolean {
  if (element.childNodes.length === 0) return false

  let segmentCount = 0

  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      // TEXT_NODE：原始文本非空（按 trim 后判断，避免 JSX 空白干扰）才计入
      const text = node.textContent || ''
      if (text.trim().length > 0) {
        segmentCount++
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      // 元素节点：必须是白名单里的纯文本 inline 元素
      if (!isPureInlineTextElement(node)) {
        return false
      }
      const text = (node as HTMLElement).textContent || ''
      if (text.trim().length > 0) {
        segmentCount++
      }
    }
    // 其他类型（注释、processing instruction）忽略
  }

  return segmentCount >= 2
}

/**
 * 按 DOM 顺序收集容器的所有内联文本段及其样式。
 *
 * 关键点：
 *   - TEXT_NODE 没有自己的 computed style，继承自父元素，因此这些段使用 parseStyle(父元素)
 *   - 元素段（span 等）使用其自己的 parseStyle，computed style 已经正确继承上级
 *   - 不 trim 各段内的空白，保持 DOM 里的实际文本顺序和间距
 *   - 跳过完全空（长度 0）的段，但保留只含空白的段（例如 <b>A</b> <i>B</i> 之间的空格）
 */
export function collectInlineSegments(element: HTMLElement): InlineSegment[] {
  const segments: InlineSegment[] = []
  // 父元素的 parsed style 作为所有 TEXT_NODE 段的样式来源
  const parentStyle = parseStyle(element)

  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || ''
      // 完全空串跳过；纯空白段保留（用于段间空格）
      if (text.length === 0) continue
      segments.push({ text, style: parentStyle })
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement
      const text = el.textContent || ''
      if (text.length === 0) continue
      segments.push({ text, style: parseStyle(el) })
    }
  }

  return segments
}
