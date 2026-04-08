/**
 * shapeHandler.ts — 将容器元素的背景转换为 fabric.js Rect 对象。
 *
 * 支持的视觉属性：
 *   - 纯色背景 / 线性渐变背景
 *   - 边框（颜色 + 宽度）
 *   - 圆角（rx / ry）
 *   - 阴影（box-shadow → fabric.Shadow）
 *   - 透明度
 *   - 旋转
 */
import { Rect, Shadow, Gradient } from 'fabric'
import type { ElementLayout } from '../parsers/layoutParser'
import type { ParsedStyle, ParsedGradient } from '../parsers/styleParser'

/**
 * 将 ParsedGradient 转为 fabric.js Gradient 对象。
 *
 * fabric.js 线性渐变使用 coords {x1, y1, x2, y2}（相对对象尺寸的像素坐标）。
 * CSS 角度 → fabric coords 映射：
 *   0deg   (to top)    → (0, h) → (0, 0)
 *   90deg  (to right)  → (0, 0) → (w, 0)
 *   180deg (to bottom) → (0, 0) → (0, h)
 *   270deg (to left)   → (w, 0) → (0, 0)
 */
function createFabricGradient(
  gradient: ParsedGradient,
  width: number,
  height: number,
): InstanceType<typeof Gradient<'linear'>> {
  // 将 CSS 角度转为弧度，并计算起止坐标
  const angleRad = ((gradient.angle - 90) * Math.PI) / 180
  const cos = Math.cos(angleRad)
  const sin = Math.sin(angleRad)

  // 使用对象中心为原点计算，然后偏移到左上角坐标系
  const halfW = width / 2
  const halfH = height / 2

  const coords = {
    x1: halfW - cos * halfW,
    y1: halfH - sin * halfH,
    x2: halfW + cos * halfW,
    y2: halfH + sin * halfH,
  }

  // 构建 fabric colorStops
  const colorStops = gradient.stops.map(stop => ({
    offset: stop.offset,
    color: stop.color,
  }))

  return new Gradient({
    type: 'linear',
    coords,
    colorStops,
  })
}

export function createShapeObject(
  layout: ElementLayout,
  style: ParsedStyle,
): Rect {
  // 决定填充：渐变优先，否则纯色背景
  let fill: string | InstanceType<typeof Gradient<'linear'>>  = style.backgroundColor
  if (style.gradient) {
    fill = createFabricGradient(style.gradient, layout.width, layout.height)
    console.log('[ShapeHandler] 应用渐变背景:', {
      angle: style.gradient.angle,
      stops: style.gradient.stops.length,
    })
  }

  // 构建 fabric.Shadow（如有 box-shadow）
  let shadow: InstanceType<typeof Shadow> | undefined
  if (style.boxShadow) {
    shadow = new Shadow({
      color: style.boxShadow.color,
      offsetX: style.boxShadow.offsetX,
      offsetY: style.boxShadow.offsetY,
      blur: style.boxShadow.blur,
    })
    console.log('[ShapeHandler] 应用阴影:', style.boxShadow)
  }

  const rect = new Rect({
    left: layout.left,
    top: layout.top,
    width: layout.width,
    height: layout.height,
    // fabric.js v6 默认 originX/Y 为 'center'，需显式设为 'left'/'top'
    // 确保 left/top 表示元素左上角而非中心点
    originX: 'left',
    originY: 'top',
    fill,
    // 圆角：fabric.js Rect 使用 rx/ry 属性
    rx: style.borderRadius,
    ry: style.borderRadius,
    // 边框
    stroke: style.borderWidth > 0 ? style.borderColor : undefined,
    strokeWidth: style.borderWidth,
    // 透明度（1 = 完全不透明）
    opacity: style.opacity,
    // 阴影
    shadow,
    // 旋转（度）
    angle: style.rotation,
    selectable: true,
  })

  return rect
}
