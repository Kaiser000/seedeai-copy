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
 * 线性渐变：coords {x1, y1, x2, y2}（相对对象尺寸的像素坐标）。
 * CSS 角度 → fabric coords 映射：
 *   0deg   (to top)    → (0, h) → (0, 0)
 *   90deg  (to right)  → (0, 0) → (w, 0)
 *   180deg (to bottom) → (0, 0) → (0, h)
 *   270deg (to left)   → (w, 0) → (0, 0)
 *
 * 径向渐变：coords {x1, y1, r1, x2, y2, r2}（内外圆的圆心和半径）。
 *   内圆 (x1,y1,r1) = 圆心，半径 0
 *   外圆 (x2,y2,r2) = 圆心，半径为元素最大维度的一半（覆盖整个元素）
 */
function createFabricGradient(
  gradient: ParsedGradient,
  width: number,
  height: number,
): InstanceType<typeof Gradient<'linear'>> | InstanceType<typeof Gradient<'radial'>> {
  // 构建 fabric colorStops（线性和径向共用）
  const colorStops = gradient.stops.map(stop => ({
    offset: stop.offset,
    color: stop.color,
  }))

  if (gradient.type === 'radial') {
    // 径向渐变：根据 centerX/centerY 和 shape 计算 fabric 坐标
    const cx = (gradient.centerX ?? 0.5) * width
    const cy = (gradient.centerY ?? 0.5) * height
    // 外圆半径：circle 用最大维度，ellipse 用对角线距离以覆盖整个元素
    const radius = gradient.shape === 'circle'
      ? Math.max(width, height) / 2
      : Math.sqrt(width * width + height * height) / 2

    console.log('[ShapeHandler] 创建径向渐变:', {
      cx, cy, radius, shape: gradient.shape, stops: colorStops.length,
    })

    return new Gradient({
      type: 'radial',
      coords: {
        x1: cx,
        y1: cy,
        r1: 0,       // 内圆半径为 0（从圆心开始）
        x2: cx,
        y2: cy,
        r2: radius,  // 外圆半径覆盖整个元素
      },
      colorStops,
    })
  }

  // 线性渐变：将 CSS 角度转为弧度，并计算起止坐标
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
  let fill: string | InstanceType<typeof Gradient<'linear'>> | InstanceType<typeof Gradient<'radial'>> = style.backgroundColor
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
