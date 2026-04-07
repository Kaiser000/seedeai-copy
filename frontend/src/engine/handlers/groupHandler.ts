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
 */
import type { FabricObject } from 'fabric'
import { parseLayout } from '../parsers/layoutParser'
import { parseStyle } from '../parsers/styleParser'
import { createTextObject } from './textHandler'
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

export async function processElement(
  element: HTMLElement,
  containerRect: DOMRect,
  warnings: string[],
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

  // ---- 容器元素 ----
  // 检查是否有视觉背景（背景色/边框/渐变/阴影），如有则生成底层 shape
  const bg = style.backgroundColor
  if (bg && hasVisualBackground(bg, style)) {
    const shape = createShapeObject(layout, style)
    objects.push(shape)
  }

  // 递归处理子元素；每个子元素的错误被隔离，不影响兄弟节点
  for (const child of element.children) {
    try {
      const childObjects = await processElement(
        child as HTMLElement,
        containerRect,
        warnings,
      )
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
