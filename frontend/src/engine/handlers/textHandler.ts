/**
 * textHandler.ts — 将文本元素转换为 fabric.js Textbox 对象。
 *
 * 支持的视觉属性：
 *   - 字体：family、size、weight、style (italic)
 *   - 排版：lineHeight、charSpacing (letterSpacing)、textAlign
 *   - 装饰：underline、linethrough、overline
 *   - 阴影：text-shadow → fabric.Shadow
 *   - 透明度
 *   - 旋转
 */
import { Textbox, Shadow } from 'fabric'
import type { ElementLayout } from '../parsers/layoutParser'
import type { ParsedStyle } from '../parsers/styleParser'

export function createTextObject(
  text: string,
  layout: ElementLayout,
  style: ParsedStyle,
): Textbox {
  // CSS font-family 是逗号分隔的 fallback 列表（如 "AlibabaPuHuiTi", serif）。
  // 提取第一个（首选）字体并去除引号，供 fabric.js 使用。
  const fontFamily = style.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')

  // CSS letterSpacing (px) → fabric.js charSpacing (1/1000 em)
  // 公式：charSpacing = letterSpacing / fontSize * 1000
  const charSpacing = style.fontSize > 0
    ? (style.letterSpacing / style.fontSize) * 1000
    : 0

  // 构建 fabric.Shadow（如有 text-shadow）
  let shadow: InstanceType<typeof Shadow> | undefined
  if (style.textShadow) {
    shadow = new Shadow({
      color: style.textShadow.color,
      offsetX: style.textShadow.offsetX,
      offsetY: style.textShadow.offsetY,
      blur: style.textShadow.blur,
    })
    console.log('[TextHandler] 应用文字阴影:', style.textShadow)
  }

  // fabric.js textAlign 值映射
  // CSS: 'left' | 'center' | 'right' | 'justify' | 'start' | 'end'
  // fabric.js: 'left' | 'center' | 'right' | 'justify'
  let textAlign = style.textAlign
  if (textAlign === 'start') textAlign = 'left'
  else if (textAlign === 'end') textAlign = 'right'

  const textbox = new Textbox(text, {
    left: layout.left,
    top: layout.top,
    width: layout.width,
    // fabric.js v6 默认 originX/Y 为 'center'，需显式设为 'left'/'top'
    // 确保 left/top 表示元素左上角而非中心点
    originX: 'left',
    originY: 'top',

    // 字体
    fontSize: style.fontSize,
    fontFamily,
    fontWeight: style.fontWeight as string,
    fontStyle: style.fontStyle as 'normal' | 'italic' | 'oblique',

    // 颜色
    fill: style.color,

    // 排版
    lineHeight: style.lineHeight,
    charSpacing,
    textAlign: textAlign as 'left' | 'center' | 'right' | 'justify',
    // CJK 文本支持：按字符边界断行，而非按空格断词。
    // 中文/日文/韩文没有空格分隔，若不启用此选项，
    // 整段文字被视为一个"单词"，超出宽度时不换行直接溢出，导致与相邻元素重叠。
    splitByGrapheme: true,

    // 文本装饰
    underline: style.textDecoration.underline,
    linethrough: style.textDecoration.linethrough,
    overline: style.textDecoration.overline,

    // 视觉效果
    opacity: style.opacity,
    shadow,

    // 旋转
    angle: style.rotation,

    editable: true,
    selectable: true,
  })

  return textbox
}
