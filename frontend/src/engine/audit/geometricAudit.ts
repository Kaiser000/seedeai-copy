/**
 * geometricAudit.ts — DOM 几何审计主模块。
 *
 * 作用：在 JSX 渲染到 hidden DOM 后、拷贝到 fabric canvas 前，跑一遍纯 JS 规则集，
 * 把"能看见的问题"（溢出、超框、字号过小、对比度差）用结构化方式捞出来。
 * 输出的 AuditReport 会被写入 store，驱动 UI 展示和 repair loop。
 *
 * 设计原则：
 *   1. 只做高置信度的规则 —— 宁可漏，不可误报（误报会把 LLM 带跑偏）。
 *   2. 所有数值阈值都走 AuditOptions，不写死。
 *   3. 把"如何测量"和"规则判定"解耦：测量在本文件，规则判定全部调用 auditHelpers。
 *   4. 不抛异常 —— 审计失败只是"发现问题"，不应该让渲染流水线崩掉。
 */
import type {
  AuditIssue,
  AuditOptions,
  AuditReport,
  AuditRuleId,
  AuditSeverity,
} from './auditTypes'
import {
  compositeOver,
  computeBoundsOverflow,
  computeVerticalOverlap,
  contrastRatio,
  describeBoundsOverflow,
  parseCssColor,
  truncateText,
  type RectBox,
  type RGB,
} from './auditHelpers'

/** 默认配置值 —— 根据海报场景（1080×1920 为主）调校 */
const DEFAULT_OPTIONS: Required<AuditOptions> = {
  minBodyFontSize: 14,
  contrastThreshold: 4.5,
  bboxTolerance: 2,
  enableContrastCheck: true,
}

/** 审计时的上下文信息，避免到处传参 */
interface AuditContext {
  root: HTMLElement
  rootRect: DOMRect
  canvasBounds: { width: number; height: number }
  options: Required<AuditOptions>
  issues: AuditIssue[]
}

/**
 * 对外主入口 —— 运行一次完整的几何审计。
 *
 * @param root DOM 根节点，通常是 CanvasPanel 里渲染 Poster 组件的 hiddenDiv
 * @param canvasBounds 目标画布的逻辑尺寸（与 hiddenDiv 实际宽高一致）
 * @param options 可选配置，所有字段都有默认值
 */
export function runGeometricAudit(
  root: HTMLElement,
  canvasBounds: { width: number; height: number },
  options: AuditOptions = {},
): AuditReport {
  const startTs = performance.now()
  const merged: Required<AuditOptions> = { ...DEFAULT_OPTIONS, ...options }

  const ctx: AuditContext = {
    root,
    rootRect: root.getBoundingClientRect(),
    canvasBounds,
    options: merged,
    issues: [],
  }

  try {
    // 深度优先遍历所有后代元素。不用 TreeWalker 是因为要保留父子链用于 elementPath。
    visit(root, ctx, [])
  } catch (err) {
    // 审计自身崩溃不应该影响主渲染流程。记录日志，返回空 report。
    console.error('[Audit] 审计遍历异常，跳过本次审计:', {
      error: (err as Error).message,
      stack: (err as Error).stack,
    })
  }

  const errorCount = ctx.issues.filter((i) => i.severity === 'error').length
  const warningCount = ctx.issues.filter((i) => i.severity === 'warning').length

  const report: AuditReport = {
    issues: ctx.issues,
    errorCount,
    warningCount,
    passed: errorCount === 0,
    durationMs: performance.now() - startTs,
    timestamp: Date.now(),
    canvasBounds,
  }

  console.log('[Audit] 几何审计完成:', {
    passed: report.passed,
    errorCount,
    warningCount,
    durationMs: Math.round(report.durationMs * 100) / 100,
    rules: ctx.issues.reduce<Record<string, number>>((acc, i) => {
      acc[i.rule] = (acc[i.rule] || 0) + 1
      return acc
    }, {}),
  })

  return report
}

/* ══════════════════════════════════════════════════════════════════
 *  DOM 遍历与规则执行
 * ══════════════════════════════════════════════════════════════════ */

/**
 * 深度优先遍历。pathStack 记录从 root 到当前节点的祖先链，用于生成 elementPath。
 */
function visit(el: HTMLElement, ctx: AuditContext, pathStack: HTMLElement[]): void {
  // root 自身不参与审计（它就是画布本身），直接下钻到子节点
  if (el !== ctx.root) {
    checkElement(el, ctx, [...pathStack, el])
  }

  // 跳过显式隐藏的子树，避免在不可见内容上误报
  const cs = getComputedStyleSafe(el)
  if (cs && (cs.display === 'none' || cs.visibility === 'hidden')) return

  for (const child of Array.from(el.children)) {
    if (child instanceof HTMLElement) {
      visit(child, ctx, el === ctx.root ? pathStack : [...pathStack, el])
    }
  }

  // ── 规则 5：SIBLING_OVERLAP —— 同一容器内 flow 子元素垂直方向重叠 ──
  // 只在"当前容器是 flex-col / block 流式布局"时检查，因为 absolute / grid
  // 子元素的重叠可能是有意的。这条规则精确瞄准海报中"section 覆盖 section"的经典失效模式。
  if (el.children.length >= 2) {
    checkSiblingOverlap(el, ctx, el === ctx.root ? pathStack : [...pathStack, el])
  }
}

/** 对单个元素跑全部规则 */
function checkElement(
  el: HTMLElement,
  ctx: AuditContext,
  pathStack: HTMLElement[],
): void {
  const cs = getComputedStyleSafe(el)
  if (!cs) return
  if (cs.display === 'none' || cs.visibility === 'hidden') return

  const rect = el.getBoundingClientRect()
  // 跳过零尺寸元素（display:contents / 未布局）
  if (rect.width < 1 || rect.height < 1) return

  // ── 规则 1：OUT_OF_BOUNDS —— 元素 bbox 超出画布 ──
  checkOutOfBounds(el, rect, cs, ctx, pathStack)

  // ── 规则 2/3/4 仅对"文本叶节点"生效 ──
  if (isTextLeaf(el)) {
    checkTextOverflow(el, ctx, pathStack)
    checkMinFontSize(el, cs, ctx, pathStack)
    if (ctx.options.enableContrastCheck) {
      checkContrast(el, cs, ctx, pathStack)
    }
  }
}

/* ── 规则 1：OUT_OF_BOUNDS ─────────────────────────────────────── */

function checkOutOfBounds(
  el: HTMLElement,
  rect: DOMRect,
  cs: CSSStyleDeclaration,
  ctx: AuditContext,
  pathStack: HTMLElement[],
): void {
  // 相对于画布根部的偏移
  const offsets = {
    left: rect.left - ctx.rootRect.left,
    top: rect.top - ctx.rootRect.top,
    right: rect.left - ctx.rootRect.left + rect.width,
    bottom: rect.top - ctx.rootRect.top + rect.height,
  }

  const overflow = computeBoundsOverflow(
    offsets,
    ctx.canvasBounds,
    ctx.options.bboxTolerance,
  )
  if (!overflow) return

  // 若任一祖先 overflow:hidden / clip，则视为已被裁切，不算问题
  if (hasClippingAncestor(el, ctx.root)) return

  // 透明 + 无边框 + 无内容的纯布局容器也不算 —— 不会真的"被看见"
  if (!isVisuallySignificant(cs)) return

  const desc = describeBoundsOverflow(overflow)
  ctx.issues.push({
    rule: 'OUT_OF_BOUNDS',
    severity: 'error',
    message: `元素 <${el.tagName.toLowerCase()}> ${desc}，超出画布 ${ctx.canvasBounds.width}×${ctx.canvasBounds.height}。请调整位置或尺寸使其落在画布内。`,
    elementPath: buildElementPath(pathStack),
    metrics: {
      left: Math.round(offsets.left),
      top: Math.round(offsets.top),
      right: Math.round(offsets.right),
      bottom: Math.round(offsets.bottom),
      leftOver: overflow.leftOver,
      topOver: overflow.topOver,
      rightOver: overflow.rightOver,
      bottomOver: overflow.bottomOver,
    },
  })
}

/* ── 规则 2：TEXT_OVERFLOW ─────────────────────────────────────── */

function checkTextOverflow(
  el: HTMLElement,
  ctx: AuditContext,
  pathStack: HTMLElement[],
): void {
  const overflowX = el.scrollWidth - el.clientWidth
  const overflowY = el.scrollHeight - el.clientHeight
  const tol = ctx.options.bboxTolerance

  if (overflowX <= tol && overflowY <= tol) return

  const sample = truncateText(el.textContent || '')
  const parts: string[] = []
  if (overflowX > tol) parts.push(`宽度 ${Math.round(overflowX)}px`)
  if (overflowY > tol) parts.push(`高度 ${Math.round(overflowY)}px`)

  ctx.issues.push({
    rule: 'TEXT_OVERFLOW',
    severity: 'error',
    message: `文本 "${sample}" 超出容器${parts.join('、')}。请缩短文本、增大容器宽度、降低字号，或使用 break-words 允许换行。`,
    elementPath: buildElementPath(pathStack),
    metrics: {
      overflowX,
      overflowY,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      scrollHeight: el.scrollHeight,
      clientHeight: el.clientHeight,
    },
  })
}

/* ── 规则 3：MIN_FONT_SIZE ─────────────────────────────────────── */

function checkMinFontSize(
  el: HTMLElement,
  cs: CSSStyleDeclaration,
  ctx: AuditContext,
  pathStack: HTMLElement[],
): void {
  const fontSize = parseFloat(cs.fontSize)
  if (!Number.isFinite(fontSize)) return
  if (fontSize >= ctx.options.minBodyFontSize) return

  ctx.issues.push({
    rule: 'MIN_FONT_SIZE',
    severity: 'warning',
    message: `文本 "${truncateText(el.textContent || '')}" 字号 ${fontSize.toFixed(1)}px 低于海报正文下限 ${ctx.options.minBodyFontSize}px，在成片尺寸下不可读。请提升字号，或确认该元素是否必要。`,
    elementPath: buildElementPath(pathStack),
    metrics: {
      fontSize,
      minBodyFontSize: ctx.options.minBodyFontSize,
    },
  })
}

/* ── 规则 4：LOW_CONTRAST ──────────────────────────────────────── */

function checkContrast(
  el: HTMLElement,
  cs: CSSStyleDeclaration,
  ctx: AuditContext,
  pathStack: HTMLElement[],
): void {
  const fgParsed = parseCssColor(cs.color)
  if (!fgParsed) return
  const fg = fgParsed.rgb

  const bg = resolveEffectiveBackground(el, ctx.root)
  if (!bg) return

  const ratio = contrastRatio(fg, bg)
  const severity: AuditSeverity =
    ratio < ctx.options.contrastThreshold ? 'error' : 'warning'

  if (ratio >= ctx.options.contrastThreshold) return

  ctx.issues.push({
    rule: 'LOW_CONTRAST',
    severity,
    message: `文本 "${truncateText(el.textContent || '')}" 前景/背景对比度 ${ratio.toFixed(2)}:1 低于 WCAG AA 要求 ${ctx.options.contrastThreshold}:1，可读性差。请调整字色或背景色。`,
    elementPath: buildElementPath(pathStack),
    metrics: {
      ratio: Math.round(ratio * 100) / 100,
      fgR: fg.r,
      fgG: fg.g,
      fgB: fg.b,
      bgR: bg.r,
      bgG: bg.g,
      bgB: bg.b,
    },
  })
}

/* ── 规则 5：SIBLING_OVERLAP ──────────────────────────────────── */

/**
 * 检测同一容器内 flow 子元素的垂直方向重叠。
 *
 * 精确瞄准海报中"section 覆盖 section"的失效模式：
 *   - LLM 给每个 section 写了固定高度（如 h-[400px]），但内容（字号已被预算推高）
 *     实际超出了声明高度，导致后续 section 视觉上被覆盖。
 *
 * 为了减少误报，只检查"显著尺寸"的 in-flow 子元素（跳过 absolute / 小装饰元素），
 * 且重叠量必须超过阈值（默认 10px）才报。
 */
function checkSiblingOverlap(
  container: HTMLElement,
  ctx: AuditContext,
  pathStack: HTMLElement[],
): void {
  // 收集所有"显著的 in-flow 子元素"的 bbox
  const siblings: Array<{ el: HTMLElement; box: RectBox; label: string }> = []

  for (const child of Array.from(container.children)) {
    if (!(child instanceof HTMLElement)) continue
    const cs = getComputedStyleSafe(child)
    if (!cs) continue
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    // 跳过 absolute / fixed 定位的元素（装饰层允许重叠）
    if (cs.position === 'absolute' || cs.position === 'fixed') continue

    const rect = child.getBoundingClientRect()
    if (rect.width < 10 || rect.height < 10) continue

    const tag = child.tagName.toLowerCase()
    const cls = (child.className || '').toString().trim().split(/\s+/)[0]
    siblings.push({
      el: child,
      box: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      },
      label: cls ? `<${tag}.${cls.slice(0, 20)}>` : `<${tag}>`,
    })
  }

  if (siblings.length < 2) return

  // 按 top 坐标排序后，相邻两个比较（O(n) 而非 O(n²)，因为 flow 子元素自然按 DOM 顺序从上到下）
  siblings.sort((a, b) => a.box.top - b.box.top)

  // 重叠阈值：低于这个值认为是 subpixel 抖动或 gap 不够，不算真正的"覆盖"
  const overlapThreshold = 10

  for (let i = 0; i < siblings.length - 1; i++) {
    const upper = siblings[i]
    const lower = siblings[i + 1]
    const overlap = computeVerticalOverlap(upper.box, lower.box)

    if (overlap <= overlapThreshold) continue

    ctx.issues.push({
      rule: 'SIBLING_OVERLAP',
      severity: 'error',
      message: `同级元素 ${upper.label} 与 ${lower.label} 在垂直方向重叠 ${Math.round(overlap)}px，下方内容被遮盖。请增大上方 section 高度、缩小内容量，或改用 h-fit 让高度自适应内容。`,
      elementPath: buildElementPath([...pathStack, upper.el]),
      metrics: {
        overlapPx: Math.round(overlap),
        upperBottom: Math.round(upper.box.bottom),
        lowerTop: Math.round(lower.box.top),
        upperTag: upper.label,
        lowerTag: lower.label,
      },
    })
  }
}

/* ══════════════════════════════════════════════════════════════════
 *  DOM 工具函数（只在本文件内部使用）
 * ══════════════════════════════════════════════════════════════════ */

/**
 * 安全读取 computed style。jsdom 在极端情况下可能返回 null 或抛异常，做一层保护。
 */
function getComputedStyleSafe(el: HTMLElement): CSSStyleDeclaration | null {
  try {
    return window.getComputedStyle(el)
  } catch {
    return null
  }
}

/**
 * 判断元素是否是"文本叶节点"：至少有一个非空 TEXT_NODE 直接子节点，且没有元素子节点。
 * 放宽到允许空格的子 TEXT_NODE（但 textContent 必须有实质字符）。
 */
function isTextLeaf(el: HTMLElement): boolean {
  if (el.children.length > 0) return false
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim()) {
      return true
    }
  }
  return false
}

/**
 * 判断元素的任一祖先（到 root 为止）是否有 overflow:hidden / clip-path。
 * 这类祖先会裁切超出部分，所以本元素即便 bbox 越界也不会被看到。
 */
function hasClippingAncestor(el: HTMLElement, root: HTMLElement): boolean {
  let cur: HTMLElement | null = el.parentElement
  while (cur && cur !== root.parentElement) {
    const cs = getComputedStyleSafe(cur)
    if (cs) {
      if (
        cs.overflow === 'hidden' ||
        cs.overflowX === 'hidden' ||
        cs.overflowY === 'hidden' ||
        cs.overflow === 'clip'
      ) {
        return true
      }
      if (cs.clipPath && cs.clipPath !== 'none') return true
    }
    if (cur === root) break
    cur = cur.parentElement
  }
  return false
}

/**
 * 判断元素是否"视觉上显著" —— 有背景色、边框、文字、或图片/svg 标签。
 * 纯布局容器（flex wrapper）即便越界也不会被看到，不报 OUT_OF_BOUNDS。
 */
function isVisuallySignificant(cs: CSSStyleDeclaration): boolean {
  const bg = cs.backgroundColor
  const bgParsed = parseCssColor(bg)
  if (bgParsed && bgParsed.alpha > 0.05) return true

  const borderWidth = parseFloat(cs.borderTopWidth || '0')
  if (Number.isFinite(borderWidth) && borderWidth > 0) return true

  if (cs.backgroundImage && cs.backgroundImage !== 'none') return true
  if (cs.boxShadow && cs.boxShadow !== 'none') return true

  return false
}

/**
 * 递归向上查找"有效背景色"：第一个 alpha 足够高的背景层。
 * 遇到半透明背景时会与更上层做 alpha 合成，得到近似真实视觉背景。
 * 最终兜底为白色（海报默认背景）。
 */
function resolveEffectiveBackground(el: HTMLElement, root: HTMLElement): RGB | null {
  const stack: Array<{ rgb: RGB; alpha: number }> = []
  let cur: HTMLElement | null = el

  while (cur) {
    const cs = getComputedStyleSafe(cur)
    if (cs) {
      const parsed = parseCssColor(cs.backgroundColor)
      if (parsed && parsed.alpha > 0) {
        stack.push(parsed)
        if (parsed.alpha >= 0.95) break
      }
    }
    if (cur === root) break
    cur = cur.parentElement
  }

  // 从最底层开始合成：先拿白色底，向上依次叠加
  let base: RGB = { r: 255, g: 255, b: 255 }
  for (let i = stack.length - 1; i >= 0; i--) {
    const { rgb, alpha } = stack[i]
    base = compositeOver(rgb, alpha, base)
  }
  return base
}

/**
 * 把祖先链格式化为 "section.hero > h1.title" 风格的路径字符串。
 * 最多保留末尾 4 段，避免冗长。
 */
function buildElementPath(stack: HTMLElement[]): string {
  const tail = stack.slice(-4)
  return tail
    .map((el) => {
      const tag = el.tagName.toLowerCase()
      const cls = (el.className || '').toString().trim().split(/\s+/)[0]
      return cls ? `${tag}.${cls.slice(0, 20)}` : tag
    })
    .join(' > ')
}

// 为测试暴露内部规则 ID 常量（便于断言）
export const AUDIT_RULES: AuditRuleId[] = [
  'OUT_OF_BOUNDS',
  'TEXT_OVERFLOW',
  'MIN_FONT_SIZE',
  'LOW_CONTRAST',
  'SIBLING_OVERLAP',
]
