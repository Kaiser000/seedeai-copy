/**
 * imageHandler.ts — 将 <img> 元素转换为 fabric.js FabricImage 对象。
 *
 * 支持的视觉属性：
 *   - object-fit: cover / contain / fill
 *   - object-position: 定位裁切区域
 *   - border-radius: 通过 fabric.js clipPath (Rect with rx/ry) 实现圆角
 *   - box-shadow → fabric.Shadow
 *   - opacity
 *   - rotation
 */
import { FabricImage, Shadow, Rect } from 'fabric'
import type { ElementLayout } from '../parsers/layoutParser'
import type { ParsedStyle } from '../parsers/styleParser'

export interface ImageStyleInfo {
  objectFit: string
  objectPosition: string
  borderRadius: number
  opacity?: number
  boxShadow?: ParsedStyle['boxShadow']
  rotation?: number
}

export async function createImageObject(
  src: string,
  layout: ElementLayout,
  styleInfo?: ImageStyleInfo,
): Promise<FabricImage> {
  if (!src || !src.trim()) {
    throw new Error('Image src is empty or missing')
  }

  let img: FabricImage
  try {
    img = await FabricImage.fromURL(src, { crossOrigin: 'anonymous' })
  } catch (err) {
    console.error('[ImageHandler] 图片加载失败:', { src, error: (err as Error).message })
    throw err
  }

  const imgWidth = img.width ?? 0
  const imgHeight = img.height ?? 0
  if (imgWidth <= 0 || imgHeight <= 0) {
    console.error('[ImageHandler] 图片尺寸无效:', { src, imgWidth, imgHeight })
    throw new Error(`Image has invalid dimensions: ${imgWidth}x${imgHeight}`)
  }

  const objectFit = styleInfo?.objectFit || 'fill'
  const containerW = layout.width
  const containerH = layout.height

  console.log('[ImageHandler] 创建图片:', {
    src: src.substring(0, 80),
    imgNatural: `${imgWidth}x${imgHeight}`,
    container: `${containerW}x${containerH}`,
    position: `(${layout.left}, ${layout.top})`,
    objectFit,
    objectPosition: styleInfo?.objectPosition,
    borderRadius: styleInfo?.borderRadius,
  })

  if (objectFit === 'cover') {
    applyCover(img, imgWidth, imgHeight, containerW, containerH, layout, styleInfo)
  } else if (objectFit === 'contain') {
    applyContain(img, imgWidth, imgHeight, containerW, containerH, layout, styleInfo)
  } else {
    // fill: 拉伸填满
    img.set({
      left: layout.left,
      top: layout.top,
      scaleX: containerW / imgWidth,
      scaleY: containerH / imgHeight,
      selectable: true,
    })
  }

  // 应用圆角裁切：通过 clipPath 实现 border-radius 效果
  const borderRadius = styleInfo?.borderRadius ?? 0
  if (borderRadius > 0) {
    // clipPath 坐标是相对于对象自身中心的，需要计算可见区域的中心偏移
    const displayW = containerW / (img.scaleX || 1)
    const displayH = containerH / (img.scaleY || 1)
    const clipRect = new Rect({
      width: displayW,
      height: displayH,
      rx: borderRadius / (img.scaleX || 1),
      ry: borderRadius / (img.scaleY || 1),
      // clipPath 原点在对象中心，需偏移到左上角
      left: -displayW / 2,
      top: -displayH / 2,
    })
    img.set({ clipPath: clipRect })
    console.log('[ImageHandler] 应用圆角裁切:', { borderRadius })
  }

  // 应用阴影
  if (styleInfo?.boxShadow) {
    const shadow = new Shadow({
      color: styleInfo.boxShadow.color,
      offsetX: styleInfo.boxShadow.offsetX,
      offsetY: styleInfo.boxShadow.offsetY,
      blur: styleInfo.boxShadow.blur,
    })
    img.set({ shadow })
    console.log('[ImageHandler] 应用阴影:', styleInfo.boxShadow)
  }

  // 应用透明度
  if (styleInfo?.opacity !== undefined && styleInfo.opacity < 1) {
    img.set({ opacity: styleInfo.opacity })
  }

  // 应用旋转
  if (styleInfo?.rotation && styleInfo.rotation !== 0) {
    img.set({ angle: styleInfo.rotation })
  }

  return img
}

/**
 * object-cover: 保持宽高比缩放到完全覆盖容器，超出部分用 cropX/cropY 裁切。
 *
 * 原理：
 *   scale = max(containerW/imgW, containerH/imgH)
 *   缩放后图片 >= 容器，多余像素按 object-position 比例裁切掉。
 *   最终 scaleX === scaleY（等比缩放），可见区域恰好 = 容器尺寸。
 */
function applyCover(
  img: FabricImage,
  imgW: number, imgH: number,
  containerW: number, containerH: number,
  layout: ElementLayout,
  styleInfo?: ImageStyleInfo,
) {
  const scale = Math.max(containerW / imgW, containerH / imgH)
  const scaledW = imgW * scale
  const scaledH = imgH * scale

  // 超出容器的像素（缩放后坐标）
  const excessW = scaledW - containerW
  const excessH = scaledH - containerH

  // 转回原图像素
  const cropTotalX = excessW / scale
  const cropTotalY = excessH / scale

  // 按 object-position 分配裁切量到左/上
  const pos = parseObjectPosition(styleInfo?.objectPosition)
  const cropX = cropTotalX * pos.x
  const cropY = cropTotalY * pos.y

  // cropX/cropY 裁掉左上，width/height 限制可见区域
  const visibleW = imgW - cropTotalX
  const visibleH = imgH - cropTotalY

  img.set({
    left: layout.left,
    top: layout.top,
    cropX,
    cropY,
    width: visibleW,
    height: visibleH,
    scaleX: containerW / visibleW,
    scaleY: containerH / visibleH,
    selectable: true,
  })
}

/**
 * object-contain: 保持宽高比缩放到完全放入容器，不裁切。
 */
function applyContain(
  img: FabricImage,
  imgW: number, imgH: number,
  containerW: number, containerH: number,
  layout: ElementLayout,
  styleInfo?: ImageStyleInfo,
) {
  const scale = Math.min(containerW / imgW, containerH / imgH)
  const displayW = imgW * scale
  const displayH = imgH * scale

  const pos = parseObjectPosition(styleInfo?.objectPosition)
  const offsetX = (containerW - displayW) * pos.x
  const offsetY = (containerH - displayH) * pos.y

  img.set({
    left: layout.left + offsetX,
    top: layout.top + offsetY,
    scaleX: scale,
    scaleY: scale,
    selectable: true,
  })
}

/** 解析 object-position CSS 值为 0~1 比例 */
function parseObjectPosition(value?: string): { x: number; y: number } {
  if (!value) return { x: 0.5, y: 0.5 }

  const parts = value.trim().split(/\s+/)
  const parse = (part: string): number => {
    if (part === 'center') return 0.5
    if (part === 'left' || part === 'top') return 0
    if (part === 'right' || part === 'bottom') return 1
    if (part.endsWith('%')) return parseFloat(part) / 100
    return 0.5
  }

  if (parts.length >= 2) return { x: parse(parts[0]), y: parse(parts[1]) }
  if (parts.length === 1) {
    const v = parse(parts[0])
    return { x: v, y: v }
  }
  return { x: 0.5, y: 0.5 }
}
