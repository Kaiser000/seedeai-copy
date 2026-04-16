/**
 * auditHelpers.ts — 几何审计的纯函数工具集。
 *
 * 这里放的所有函数都不碰 DOM，便于在 vitest（jsdom 无 layout 引擎）下做精确断言。
 * 主审计函数 geometricAudit.ts 负责把 DOM 测量出来喂给这里的纯函数。
 */

/** RGB 颜色三元组（不含透明度），所有分量 0~255 */
export interface RGB {
  r: number
  g: number
  b: number
}

/**
 * 解析 CSS 颜色字符串为 RGB。
 *
 * 支持 `rgb(r, g, b)` / `rgba(r, g, b, a)` / `#rrggbb` / `#rgb` 四种常见格式。
 * 解析失败（包括 transparent 或未识别格式）返回 null，调用方自行决定是否用默认值。
 *
 * 注意：这里故意不处理 `hsl()`、`color()` 等现代语法 —— 浏览器
 * `getComputedStyle` 会把大部分颜色归一化成 `rgb/rgba`，jsdom 的行为一致。
 */
export function parseCssColor(css: string): { rgb: RGB; alpha: number } | null {
  if (!css) return null
  const trimmed = css.trim()
  if (trimmed === 'transparent') return null

  // rgba / rgb
  const rgbMatch = trimmed.match(
    /^rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/i,
  )
  if (rgbMatch) {
    const r = Number(rgbMatch[1])
    const g = Number(rgbMatch[2])
    const b = Number(rgbMatch[3])
    const alpha = rgbMatch[4] !== undefined ? Number(rgbMatch[4]) : 1
    if ([r, g, b].some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return null
    if (!Number.isFinite(alpha)) return null
    return { rgb: { r, g, b }, alpha }
  }

  // #rgb / #rrggbb
  const hexMatch = trimmed.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hexMatch) {
    const hex = hexMatch[1]
    if (hex.length === 3) {
      return {
        rgb: {
          r: parseInt(hex[0] + hex[0], 16),
          g: parseInt(hex[1] + hex[1], 16),
          b: parseInt(hex[2] + hex[2], 16),
        },
        alpha: 1,
      }
    }
    return {
      rgb: {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
      },
      alpha: 1,
    }
  }

  return null
}

/**
 * 按 WCAG 2.1 定义计算相对亮度。
 * 公式来自 https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
 */
export function relativeLuminance({ r, g, b }: RGB): number {
  const toLinear = (channel: number): number => {
    const s = channel / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
}

/**
 * 按 WCAG 2.1 定义计算两个颜色的对比度。
 * 返回值范围 [1, 21]。AA 级正文要求 ≥ 4.5，AAA 级 ≥ 7。
 */
export function contrastRatio(a: RGB, b: RGB): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const light = Math.max(la, lb)
  const dark = Math.min(la, lb)
  return (light + 0.05) / (dark + 0.05)
}

/**
 * 在半透明前景叠加到背景时，计算视觉上的合成色（线性空间 alpha compositing）。
 * 用于 `rgba(...)` 背景：`getEffectiveBackground` 递归向上找背景时会调用。
 */
export function compositeOver(fg: RGB, fgAlpha: number, bg: RGB): RGB {
  const a = Math.max(0, Math.min(1, fgAlpha))
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
  }
}

/** 画布边界（宽高），用于 out-of-bounds 检测 */
export interface CanvasBounds {
  width: number
  height: number
}

/** 相对于画布左上角的元素偏移信息 */
export interface BboxOffsets {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * 判断元素 bbox 是否超出画布边界。tolerance 用于吸收 subpixel 抖动。
 * 返回一个描述对象：有哪些方向溢出、溢出多少像素。没有溢出时返回 null。
 */
export function computeBoundsOverflow(
  offsets: BboxOffsets,
  bounds: CanvasBounds,
  tolerance: number,
): { leftOver: number; topOver: number; rightOver: number; bottomOver: number } | null {
  const leftOver = offsets.left < -tolerance ? -offsets.left : 0
  const topOver = offsets.top < -tolerance ? -offsets.top : 0
  const rightOver =
    offsets.right > bounds.width + tolerance ? offsets.right - bounds.width : 0
  const bottomOver =
    offsets.bottom > bounds.height + tolerance ? offsets.bottom - bounds.height : 0

  if (leftOver === 0 && topOver === 0 && rightOver === 0 && bottomOver === 0) {
    return null
  }
  return { leftOver, topOver, rightOver, bottomOver }
}

/**
 * 把 computeBoundsOverflow 的输出格式化成一句可直接塞进 LLM prompt 的中文描述。
 * 只描述实际溢出的方向，避免噪音。
 */
export function describeBoundsOverflow(overflow: {
  leftOver: number
  topOver: number
  rightOver: number
  bottomOver: number
}): string {
  const parts: string[] = []
  if (overflow.leftOver > 0) parts.push(`左侧溢出 ${Math.round(overflow.leftOver)}px`)
  if (overflow.topOver > 0) parts.push(`顶部溢出 ${Math.round(overflow.topOver)}px`)
  if (overflow.rightOver > 0) parts.push(`右侧溢出 ${Math.round(overflow.rightOver)}px`)
  if (overflow.bottomOver > 0)
    parts.push(`底部溢出 ${Math.round(overflow.bottomOver)}px`)
  return parts.join('，')
}

/**
 * 对一段文本做安全截断，供 issue.message 里展示。超长会加省略号。
 */
export function truncateText(text: string, maxLen = 30): string {
  const trimmed = (text || '').replace(/\s+/g, ' ').trim()
  if (trimmed.length <= maxLen) return trimmed
  return trimmed.slice(0, maxLen) + '…'
}

/** 两个矩形的描述（用于 overlap 计算） */
export interface RectBox {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * 计算两个 in-flow 兄弟元素在垂直方向上的重叠像素数。
 *
 * 只计算"视觉高度方向上的交集"（即 A 的 bottom > B 的 top 或反过来），
 * 水平方向不考虑（同级 flow 元素可以并排而不冲突）。
 *
 * 返回重叠像素数，0 表示无重叠。负值也返回 0（不重叠）。
 */
export function computeVerticalOverlap(a: RectBox, b: RectBox): number {
  // 确保 a 在 b 上面（top 更小）
  const upper = a.top <= b.top ? a : b
  const lower = a.top <= b.top ? b : a
  const overlap = upper.bottom - lower.top
  return overlap > 0 ? overlap : 0
}
