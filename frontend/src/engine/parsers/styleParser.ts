/**
 * styleParser.ts — 从 DOM 元素的 computedStyle 中提取所有对 fabric.js 渲染有用的 CSS 属性。
 *
 * 解析范围：
 *   - 基础：backgroundColor, color, fontSize, fontFamily, fontWeight, fontStyle
 *   - 排版：lineHeight, letterSpacing, textAlign, textDecoration (underline/linethrough/overline)
 *   - 边框：borderColor, borderWidth, borderRadius
 *   - 视觉效果：opacity, boxShadow, textShadow, backgroundImage (linear-gradient)
 *   - 变换：transform (rotation)
 *   - 图片：objectFit, objectPosition, overflow
 */

// ============================================================
// Shadow 解析
// ============================================================

/** fabric.js Shadow 所需的结构化阴影数据 */
export interface ParsedShadow {
  color: string
  offsetX: number
  offsetY: number
  blur: number
}

/**
 * 解析 CSS box-shadow / text-shadow 值为结构化数据。
 * 格式示例：
 *   - "rgba(0, 0, 0, 0.5) 10px 10px 20px"
 *   - "10px 10px 20px rgba(0, 0, 0, 0.5)"
 *   - "none"
 *
 * 多层阴影只取第一个（fabric.js 单阴影限制）。
 */
export function parseShadow(raw: string): ParsedShadow | null {
  if (!raw || raw === 'none') return null

  // 多层阴影取第一个（按逗号分割，但要跳过 rgba() 内的逗号）
  const firstShadow = splitShadowLayers(raw)[0]
  if (!firstShadow) return null

  // 提取颜色部分（rgb/rgba/hsl/hsla 或命名颜色）
  let color = 'rgba(0,0,0,0.5)'
  let remaining = firstShadow.trim()

  // 匹配 rgb()/rgba()/hsl()/hsla() 颜色函数
  const colorFuncMatch = remaining.match(/(?:rgba?|hsla?)\([^)]+\)/)
  if (colorFuncMatch) {
    color = colorFuncMatch[0]
    remaining = remaining.replace(color, '').trim()
  } else {
    // 匹配 hex 颜色或命名颜色
    const hexMatch = remaining.match(/#[0-9a-fA-F]{3,8}/)
    if (hexMatch) {
      color = hexMatch[0]
      remaining = remaining.replace(color, '').trim()
    }
  }

  // 剩余部分应该是 px 值序列：offsetX offsetY blur [spread]
  const pxValues = remaining.match(/-?[\d.]+px/g)
  if (!pxValues || pxValues.length < 2) return null

  const offsetX = parseFloat(pxValues[0])
  const offsetY = parseFloat(pxValues[1])
  const blur = pxValues.length >= 3 ? parseFloat(pxValues[2]) : 0

  return { color, offsetX, offsetY, blur }
}

/**
 * 按顶层逗号分割多层阴影，跳过括号内的逗号。
 */
function splitShadowLayers(raw: string): string[] {
  const layers: string[] = []
  let depth = 0
  let current = ''
  for (const ch of raw) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) {
      layers.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  if (current.trim()) layers.push(current.trim())
  return layers
}

// ============================================================
// Gradient 解析
// ============================================================

/** fabric.js Gradient 所需的结构化渐变数据 */
export interface ParsedGradient {
  type: 'linear' | 'radial'
  angle: number // 线性渐变角度（degree），0 = 从上到下；径向渐变不使用此字段
  stops: Array<{ offset: number; color: string }>
  // 径向渐变专用字段
  centerX?: number // 圆心 X（0-1 相对比例，默认 0.5）
  centerY?: number // 圆心 Y（0-1 相对比例，默认 0.5）
  shape?: 'circle' | 'ellipse' // 径向形状，默认 ellipse
}

/**
 * 解析 CSS linear-gradient() 为结构化数据。
 *
 * 支持格式：
 *   - linear-gradient(to right, red, blue)
 *   - linear-gradient(135deg, #f00 0%, #00f 100%)
 *   - linear-gradient(to bottom right, red, blue)
 */
function parseLinearGradient(backgroundImage: string): ParsedGradient | null {
  const match = backgroundImage.match(/linear-gradient\((.+)\)/)
  if (!match) return null

  const inner = match[1]

  // 按顶层逗号分割参数
  const parts = splitShadowLayers(inner)
  if (parts.length < 2) return null

  let angle = 180 // 默认 to bottom（从上到下）
  let colorParts = parts

  // 第一个参数可能是方向或角度
  const firstPart = parts[0].trim()
  if (firstPart.endsWith('deg')) {
    angle = parseFloat(firstPart)
    colorParts = parts.slice(1)
  } else if (firstPart.startsWith('to ')) {
    angle = directionToAngle(firstPart)
    colorParts = parts.slice(1)
  }

  // 解析颜色停靠点
  const stops = parseColorStops(colorParts)
  if (stops.length < 2) return null

  return { type: 'linear', angle, stops }
}

/**
 * 解析 CSS radial-gradient() 为结构化数据。
 *
 * 支持格式：
 *   - radial-gradient(circle, red, blue)
 *   - radial-gradient(ellipse at center, red 0%, blue 100%)
 *   - radial-gradient(circle at 50% 50%, red 0%, blue 100%)
 *   - radial-gradient(closest-side, red, blue)
 *
 * 提取形状（circle/ellipse）和圆心位置，颜色停靠点与 linear-gradient 复用逻辑。
 */
function parseRadialGradient(backgroundImage: string): ParsedGradient | null {
  const match = backgroundImage.match(/radial-gradient\((.+)\)/)
  if (!match) return null

  const inner = match[1]
  const parts = splitShadowLayers(inner)
  if (parts.length < 2) return null

  let shape: 'circle' | 'ellipse' = 'ellipse' // CSS 默认 ellipse
  let centerX = 0.5
  let centerY = 0.5
  let colorParts = parts

  // 第一个参数可能包含形状和位置信息
  const firstPart = parts[0].trim()
  const hasShapeOrPosition =
    firstPart.includes('circle') ||
    firstPart.includes('ellipse') ||
    firstPart.includes('at ') ||
    firstPart.includes('closest') ||
    firstPart.includes('farthest')

  if (hasShapeOrPosition) {
    // 提取形状
    if (firstPart.includes('circle')) shape = 'circle'

    // 提取 "at X% Y%" 位置
    const atMatch = firstPart.match(/at\s+([\d.]+)%?\s+([\d.]+)%?/)
    if (atMatch) {
      centerX = parseFloat(atMatch[1]) / 100
      centerY = parseFloat(atMatch[2]) / 100
    }

    colorParts = parts.slice(1)
  }

  // 解析颜色停靠点
  const stops = parseColorStops(colorParts)
  if (stops.length < 2) return null

  console.log('[StyleParser] 解析径向渐变:', { shape, centerX, centerY, stops: stops.length })

  return { type: 'radial', angle: 0, stops, centerX, centerY, shape }
}

/**
 * 从颜色部分列表中解析颜色停靠点。
 * 线性渐变和径向渐变共用此逻辑。
 */
function parseColorStops(colorParts: string[]): Array<{ offset: number; color: string }> {
  const stops: Array<{ offset: number; color: string }> = []
  colorParts.forEach((part, idx) => {
    const trimmed = part.trim()
    // 尝试提取百分比位置
    const percentMatch = trimmed.match(/(.*?)\s+([\d.]+)%\s*$/)
    if (percentMatch) {
      stops.push({ offset: parseFloat(percentMatch[2]) / 100, color: percentMatch[1].trim() })
    } else {
      // 无百分比，均匀分布
      const offset = colorParts.length === 1 ? 0.5 : idx / (colorParts.length - 1)
      stops.push({ offset, color: trimmed })
    }
  })
  return stops
}

/**
 * 解析 CSS gradient 为结构化数据。
 * 依次尝试：linear-gradient → radial-gradient。
 */
export function parseGradient(backgroundImage: string): ParsedGradient | null {
  if (!backgroundImage || backgroundImage === 'none') return null

  // 优先尝试线性渐变
  const linear = parseLinearGradient(backgroundImage)
  if (linear) return linear

  // 其次尝试径向渐变
  const radial = parseRadialGradient(backgroundImage)
  if (radial) return radial

  return null
}

/**
 * CSS 方向关键字转角度。
 */
function directionToAngle(direction: string): number {
  const map: Record<string, number> = {
    'to top': 0,
    'to right': 90,
    'to bottom': 180,
    'to left': 270,
    'to top right': 45,
    'to top left': 315,
    'to bottom right': 135,
    'to bottom left': 225,
  }
  return map[direction] ?? 180
}

// ============================================================
// Transform 解析
// ============================================================

/**
 * 从 CSS transform matrix 中提取旋转角度（度）。
 *
 * getComputedStyle 返回的 transform 总是 matrix(a,b,c,d,tx,ty) 形式。
 * rotation = atan2(b, a)
 */
export function parseRotation(transform: string): number {
  if (!transform || transform === 'none') return 0

  const matrixMatch = transform.match(/matrix\(([^)]+)\)/)
  if (!matrixMatch) return 0

  const values = matrixMatch[1].split(',').map(v => parseFloat(v.trim()))
  if (values.length < 2) return 0

  // matrix(a, b, c, d, tx, ty)  → rotation = atan2(b, a)
  const a = values[0]
  const b = values[1]
  const angleDeg = Math.atan2(b, a) * (180 / Math.PI)

  return Math.abs(angleDeg) < 0.1 ? 0 : angleDeg
}

// ============================================================
// 主解析接口
// ============================================================

export interface ParsedStyle {
  // 基础
  backgroundColor: string
  color: string
  fontSize: number
  fontFamily: string
  fontWeight: string | number
  fontStyle: string // 'normal' | 'italic' | 'oblique'

  // 排版
  lineHeight: number // 行高倍数（相对 fontSize），fabric.js Textbox.lineHeight 使用此值
  letterSpacing: number // 像素值；需转换为 fabric.js charSpacing（1/1000 em）
  textAlign: string // 'left' | 'center' | 'right' | 'justify'
  textDecoration: {
    underline: boolean
    linethrough: boolean
    overline: boolean
  }

  // 边框
  borderColor: string
  borderWidth: number
  borderRadius: number

  // 视觉效果
  opacity: number
  boxShadow: ParsedShadow | null
  textShadow: ParsedShadow | null
  gradient: ParsedGradient | null

  // 变换
  rotation: number // 旋转角度（度）

  // 图片相关
  objectFit: string
  objectPosition: string
  overflow: string
}

/**
 * 从 DOM 元素提取所有视觉相关的 CSS 计算样式。
 * 这是 DOM→Canvas 管道的核心解析步骤，直接决定画布渲染的保真度。
 */
export function parseStyle(element: HTMLElement): ParsedStyle {
  const computed = window.getComputedStyle(element)

  // 计算行高倍数：CSS lineHeight 可能是 px 值（"24px"）或 "normal"
  const fontSize = parseFloat(computed.fontSize) || 16
  let lineHeight = 1.2 // 默认行高
  if (computed.lineHeight && computed.lineHeight !== 'normal') {
    const lhPx = parseFloat(computed.lineHeight)
    if (!isNaN(lhPx) && lhPx > 0) {
      lineHeight = lhPx / fontSize
    }
  }

  // 字间距：CSS 返回 px 值（"0.8px"）或 "normal"
  let letterSpacing = 0
  if (computed.letterSpacing && computed.letterSpacing !== 'normal') {
    letterSpacing = parseFloat(computed.letterSpacing) || 0
  }

  // 文本装饰
  const textDecorationLine = computed.textDecorationLine || computed.textDecoration || ''
  const textDecoration = {
    underline: textDecorationLine.includes('underline'),
    linethrough: textDecorationLine.includes('line-through'),
    overline: textDecorationLine.includes('overline'),
  }

  // 文本对齐
  const textAlign = computed.textAlign || 'left'

  return {
    backgroundColor: computed.backgroundColor,
    color: computed.color,
    fontSize,
    fontFamily: computed.fontFamily,
    fontWeight: computed.fontWeight,
    fontStyle: computed.fontStyle || 'normal',

    lineHeight,
    letterSpacing,
    textAlign,
    textDecoration,

    borderColor: computed.borderColor,
    borderWidth: parseFloat(computed.borderWidth) || 0,
    borderRadius: parseFloat(computed.borderRadius) || 0,

    opacity: parseFloat(computed.opacity) || 1,
    boxShadow: parseShadow(computed.boxShadow),
    textShadow: parseShadow(computed.textShadow),
    gradient: parseGradient(computed.backgroundImage),

    rotation: parseRotation(computed.transform),

    objectFit: computed.objectFit || 'fill',
    objectPosition: computed.objectPosition || '50% 50%',
    overflow: computed.overflow || 'visible',
  }
}
