/**
 * groupHandler.ts — DOM 树递归遍历，将每个 DOM 元素分类并交由对应 handler 处理。
 *
 * 元素分类逻辑：
 *   1. <img> → imageHandler（图片）
 *   2. <svg> → shapeHandler（将 SVG 整体视为装饰形状，提取背景色）
 *   3. 纯文本叶节点 → textHandler（文本）
 *   4. 容器元素（有背景色/边框/渐变/阴影）→ shapeHandler（背景形状）+ 递归处理子元素
 *
 * 改进点（相比旧版本）：
 *   - 有边框但无背景的元素也会生成 shape（之前只检查背景色）
 *   - 有阴影/渐变的容器也会生成 shape
 *   - 传递完整的样式信息给 imageHandler（opacity、shadow、rotation、borderRadius）
 *   - SVG 元素作为装饰形状处理而非跳过
 *   - overflow:hidden 容器的子元素会被 clipPath 裁切，防止内容溢出
 */
import type { FabricObject } from 'fabric'
import { Rect } from 'fabric'
import { parseLayout } from '../parsers/layoutParser'
import type { ElementLayout } from '../parsers/layoutParser'
import { parseStyle } from '../parsers/styleParser'
import { isInlineTextContainer, collectInlineSegments } from '../parsers/inlineTextParser'
import { createTextObject, createStyledTextObject } from './textHandler'
import { createShapeObject } from './shapeHandler'
import { createImageObject } from './imageHandler'

/**
 * 提取元素的直接文本内容（仅 TEXT_NODE 子节点）。
 * 嵌套元素内的文本不被捕获（它们会在递归中被独立处理）。
 */
function getTextContent(element: HTMLElement): string {
  let text = ''
  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent || ''
    }
  }
  return text.trim()
}

/**
 * 判断元素是否应被渲染为 fabric.js Textbox。
 * 条件：有直接文本内容 且 无子元素（叶节点）。
 */
function isTextNode(element: HTMLElement): boolean {
  const text = getTextContent(element)
  if (text && element.children.length === 0) return true
  return false
}

/** 判断是否是 <img> 元素 */
function isImageElement(element: HTMLElement): boolean {
  return element.tagName === 'IMG'
}

/** 判断是否是 <svg> 元素 */
function isSvgElement(element: HTMLElement): boolean {
  return element.tagName === 'svg' || element.tagName === 'SVG'
}

/**
 * 判断容器元素是否有需要渲染的视觉属性（背景色/边框/渐变/阴影）。
 * 如果有，就需要生成一个 shape 对象作为背景层。
 */
function hasVisualBackground(bg: string, style: ReturnType<typeof parseStyle>): boolean {
  // 有非透明背景色
  const hasBg = bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent'
  // 有边框
  const hasBorder = style.borderWidth > 0
  // 有渐变
  const hasGradient = style.gradient !== null
  // 有阴影
  const hasShadow = style.boxShadow !== null

  return hasBg || hasBorder || hasGradient || hasShadow
}

/**
 * 判断容器是否与父容器完全重合且背景相同（纯布局容器）。
 * 这类容器生成的 shape 会与父容器的 shape 完全重叠，产生不必要的层叠。
 * 跳过它们可以减少画布上的冗余矩形，降低视觉遮挡问题。
 *
 * 判断条件（全部满足才跳过）：
 *   1. 容器的尺寸与父容器几乎完全相同（宽高差 < 2px）
 *   2. 容器没有圆角、边框、渐变、阴影等独立视觉效果
 *   3. 容器只有纯色背景（可能继承自父级）
 */
function isRedundantContainer(
  layout: ElementLayout,
  parentLayout: ElementLayout | undefined,
  style: ReturnType<typeof parseStyle>,
): boolean {
  if (!parentLayout) return false

  // 尺寸几乎与父容器相同
  const sameWidth = Math.abs(layout.width - parentLayout.width) < 2
  const sameHeight = Math.abs(layout.height - parentLayout.height) < 2
  if (!sameWidth || !sameHeight) return false

  // 有独立的视觉效果（圆角、边框、渐变、阴影）则不跳过
  if (style.borderRadius > 0) return false
  if (style.borderWidth > 0) return false
  if (style.gradient !== null) return false
  if (style.boxShadow !== null) return false

  return true
}

/**
 * 判断 fabric 对象是否超出指定裁切区域的边界。
 * 通过比较对象的 left/top/width/height 与裁切区域判断。
 */
function objectExceedsBounds(obj: FabricObject, bounds: ElementLayout): boolean {
  const objLeft = (obj.left ?? 0)
  const objTop = (obj.top ?? 0)
  // 考虑 scaleX/scaleY（图片缩放后的实际尺寸）
  const objWidth = (obj.width ?? 0) * (obj.scaleX ?? 1)
  const objHeight = (obj.height ?? 0) * (obj.scaleY ?? 1)

  // 对象是否有任何部分超出容器边界
  return (
    objLeft < bounds.left - 1 ||
    objTop < bounds.top - 1 ||
    objLeft + objWidth > bounds.left + bounds.width + 1 ||
    objTop + objHeight > bounds.top + bounds.height + 1
  )
}

/**
 * 为超出 overflow:hidden 容器边界的 fabric 对象添加 clipPath 裁切。
 * 使用 absolutePositioned: true 使 clipPath 工作在画布坐标系中。
 */
function applyOverflowClip(obj: FabricObject, clipBounds: ElementLayout): void {
  // 如果对象已有 clipPath（如图片圆角），不覆盖，避免破坏现有裁切效果
  if (obj.clipPath) return

  const clipRect = new Rect({
    left: clipBounds.left,
    top: clipBounds.top,
    width: clipBounds.width,
    height: clipBounds.height,
    originX: 'left',
    originY: 'top',
    // absolutePositioned 使 clipPath 使用画布坐标系而非对象本地坐标系
    absolutePositioned: true,
  })
  obj.clipPath = clipRect
}

export async function processElement(
  element: HTMLElement,
  containerRect: DOMRect,
  warnings: string[],
  clipBounds?: ElementLayout,
  parentLayout?: ElementLayout,
): Promise<FabricObject[]> {
  const objects: FabricObject[] = []
  const layout = parseLayout(element, containerRect)
  const style = parseStyle(element)

  // 跳过无尺寸的元素（隐藏元素或 display:none）
  if (layout.width < 1 || layout.height < 1) return objects

  // ---- 图片元素 ----
  if (isImageElement(element)) {
    const src = (element as HTMLImageElement).src
    console.log('[GroupHandler] IMG 元素:', {
      src: src.substring(0, 60),
      layout,
      objectFit: style.objectFit,
    })
    try {
      const img = await createImageObject(src, layout, {
        objectFit: style.objectFit,
        objectPosition: style.objectPosition,
        borderRadius: style.borderRadius,
        opacity: style.opacity,
        boxShadow: style.boxShadow,
        rotation: style.rotation,
      })
      objects.push(img)
    } catch (err) {
      const reason = (err as Error).message || 'unknown error'
      const warning = `图片加载失败: ${src} - ${reason}`
      console.error('[GroupHandler]', warning)
      warnings.push(warning)
    }
    return objects
  }

  // ---- SVG 元素：视为装饰形状 ----
  if (isSvgElement(element)) {
    // SVG 元素本身可能有背景色、边框等；将其整体作为一个形状块处理
    const shape = createShapeObject(layout, style)
    objects.push(shape)
    console.log('[GroupHandler] SVG 元素视为装饰形状:', {
      layout,
      backgroundColor: style.backgroundColor,
    })
    return objects
  }

  // ---- 纯文本叶节点 ----
  if (isTextNode(element)) {
    const text = getTextContent(element)
    if (text) {
      const textObj = createTextObject(text, layout, style)
      objects.push(textObj)
    }
    return objects
  }

  // ---- 内联文本容器（TEXT_NODE 与 inline <span> 混排）----
  // 处理如下两类 LLM 常见结构：
  //   <p>全场<span>5折</span>起</p>                     → 3 段合并
  //   <div class="flex items-baseline"><span>¥</span><span>50</span></div>
  // 旧路径会丢失父节点直接 TEXT_NODE、或让不同字号 span 独立定位造成基线错位。
  // 这里把所有子段合并成一个带 per-character styles 的 Textbox，保留各段样式并自动基线对齐。
  if (isInlineTextContainer(element)) {
    // 容器本身若有背景/边框/渐变/阴影，仍要先生成底层 shape，再叠加合并文本
    const inlineBg = style.backgroundColor
    if (inlineBg && hasVisualBackground(inlineBg, style)) {
      if (!isRedundantContainer(layout, parentLayout, style)) {
        const shape = createShapeObject(layout, style)
        objects.push(shape)
      }
    }
    const segments = collectInlineSegments(element)
    if (segments.length > 0) {
      const textObj = createStyledTextObject(segments, layout, style)
      objects.push(textObj)
      console.log('[GroupHandler] 合并内联文本容器:', {
        tag: element.tagName,
        className: (element.className || '').toString().substring(0, 60),
        segmentCount: segments.length,
        fontSizes: segments.map(s => s.style.fontSize),
        text: segments.map(s => s.text).join('').substring(0, 40),
        layout,
      })
    }
    return objects
  }

  // ---- 容器元素 ----
  // 检查是否有视觉背景（背景色/边框/渐变/阴影），如有则生成底层 shape
  // 跳过与父容器完全重合的纯布局容器，减少冗余矩形层叠
  const bg = style.backgroundColor
  if (bg && hasVisualBackground(bg, style)) {
    if (isRedundantContainer(layout, parentLayout, style)) {
      console.log('[GroupHandler] 跳过冗余容器 shape:', {
        tag: element.tagName,
        className: element.className?.toString().substring(0, 60),
        layout,
      })
    } else {
      const shape = createShapeObject(layout, style)
      objects.push(shape)
    }
  }

  // 判断此容器是否有 overflow:hidden，若有则传递裁切边界给子元素
  const hasOverflow = style.overflow === 'hidden'
  const childClipBounds = hasOverflow ? layout : clipBounds

  // 递归处理子元素；每个子元素的错误被隔离，不影响兄弟节点
  for (const child of element.children) {
    try {
      const childObjects = await processElement(
        child as HTMLElement,
        containerRect,
        warnings,
        childClipBounds,
        layout,
      )

      // 对来自 overflow:hidden 容器的子对象应用裁切
      if (childClipBounds) {
        for (const obj of childObjects) {
          if (objectExceedsBounds(obj, childClipBounds)) {
            applyOverflowClip(obj, childClipBounds)
            console.log('[GroupHandler] overflow:hidden 裁切:', {
              objType: obj.type,
              objLeft: obj.left,
              objTop: obj.top,
              clipBounds: childClipBounds,
            })
          }
        }
      }

      objects.push(...childObjects)
    } catch (err) {
      const reason = (err as Error).message || 'unknown error'
      const warning = `子元素处理失败 <${(child as HTMLElement).tagName}>: ${reason}`
      console.error('[GroupHandler]', warning)
      warnings.push(warning)
    }
  }

  return objects
}
