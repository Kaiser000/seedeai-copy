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
import type { InlineSegment } from '../parsers/inlineTextParser'

/**
 * 从 CSS font-family fallback 列表中取第一个字体名并剥离引号，
 * fabric.js 只接受单一字体名，不理解 CSS 回退语法。
 */
function pickFirstFontFamily(fontFamily: string): string {
  return fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')
}

/**
 * 为"DOM 渲染为单行"的 Textbox 计算扩展后的 width/left，吸收字体度量差。
 *
 * 背景：
 *   DOM 渲染用浏览器 layout 引擎 + CSS 字体回退链测量文字宽度；
 *   fabric.js 使用 canvas 2D context 的 `measureText`，canvas 的字体回退链和
 *   浏览器不完全一致（CJK 尤其严重，常回退到更宽的 serif）。
 *   结果：DOM 里刚好一行能放下的文字（例如 "狂欢五一" 220px × 4 字 ≈ 880px），
 *   到了 fabric 里测出来 > layout.width，被 Textbox 自动换行为 "狂欢五\n一"。
 *
 * 解决：
 *   检测到 DOM 渲染为单行（layout.height ≈ fontSize × lineHeight × 1）时，
 *   把 Textbox 的 width 放宽 slack = max(layout.width × 0.5, fontSize × 2)，
 *   让无论字体差异多大都能塞进单行。扩展方向依赖 textAlign 保持视觉位置：
 *     - left/start  → 向右扩（文字起点不变）
 *     - right/end   → 向左扩（文字终点不变）
 *     - center      → 左右对称扩（中心不变）
 *
 * 多行 DOM 元素不做扩展——它们本来就需要换行，保留 fabric 的自动断行行为。
 */
export function computeSingleLineWidthSlack(
  layout: ElementLayout,
  fontSize: number,
  lineHeight: number,
  textAlign: 'left' | 'center' | 'right' | 'justify',
): { left: number; width: number; slackApplied: boolean } {
  // 预期单行高度 = fontSize × lineHeight；实际 height 在此阈值 1.5x 以内视为单行
  const expectedSingleLineHeight = fontSize * lineHeight
  const domIsSingleLine = layout.height < expectedSingleLineHeight * 1.5

  if (!domIsSingleLine) {
    return { left: layout.left, width: layout.width, slackApplied: false }
  }

  // slack 至少 50% 原宽 或 2 倍字号，取较大者
  const slack = Math.max(layout.width * 0.5, fontSize * 2)
  const expandedWidth = layout.width + slack

  let expandedLeft = layout.left
  if (textAlign === 'right') {
    // 向左扩：文字终点保持 layout.left + layout.width
    expandedLeft = layout.left - slack
  } else if (textAlign === 'center' || textAlign === 'justify') {
    // 对称扩：中心点不变
    expandedLeft = layout.left - slack / 2
  }
  // 'left' 情况保持 layout.left 不变，只向右扩

  return { left: expandedLeft, width: expandedWidth, slackApplied: true }
}

export function createTextObject(
  text: string,
  layout: ElementLayout,
  style: ParsedStyle,
): Textbox {
  // CSS font-family 是逗号分隔的 fallback 列表（如 "AlibabaPuHuiTi", serif）。
  // 提取第一个（首选）字体并去除引号，供 fabric.js 使用。
  const fontFamily = pickFirstFontFamily(style.fontFamily)

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
  const normalizedAlign = textAlign as 'left' | 'center' | 'right' | 'justify'

  // 单行 DOM 元素 width 扩展，防止 fabric 字体度量差造成不必要的换行。
  const { left: textLeft, width: textWidth, slackApplied } = computeSingleLineWidthSlack(
    layout,
    style.fontSize,
    style.lineHeight,
    normalizedAlign,
  )
  if (slackApplied) {
    console.log('[TextHandler] 单行 slack 扩展:', {
      text: text.length > 20 ? text.slice(0, 20) + '…' : text,
      origin: { left: layout.left, width: layout.width },
      expanded: { left: textLeft, width: textWidth },
      fontSize: style.fontSize,
      align: normalizedAlign,
    })
  }

  const textbox = new Textbox(text, {
    left: textLeft,
    top: layout.top,
    width: textWidth,
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
    textAlign: normalizedAlign,
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

/**
 * fabric Textbox 的 per-character styles 单元。
 * fabric v6 的 styles 结构为：styles[lineIndex][charIndex] = CharStyle
 * 本地只填充 styles[0]（合并后的文本只占逻辑 0 行，实际换行由 splitByGrapheme 自动处理）。
 */
interface FabricCharStyle {
  fontSize: number
  fill: string
  fontFamily: string
  fontWeight: string | number
  fontStyle: 'normal' | 'italic' | 'oblique'
  underline?: boolean
  linethrough?: boolean
  overline?: boolean
}

/**
 * 创建一个合并了多段不同样式的 fabric.Textbox。
 *
 * 使用场景：`isInlineTextContainer` 识别出的内联文本容器，
 * 内部 TEXT_NODE 和 inline <span> 段被按 DOM 顺序合并成一个整体，
 * 每一段的颜色/字号/字重等通过 fabric 的 styles 字段作用到对应字符区间。
 *
 * 关键决策：
 *   1. Textbox.fontSize 取所有段字号的最大值作为基线，
 *      因为 fabric 按每行最大 fontSize 计算行高，这样小字号段不会意外拉低行高
 *   2. Textbox 级别的 fontFamily/fill 用父容器（baseStyle）作为 fallback，
 *      每个字符再通过 styles 精确覆盖
 *   3. letterSpacing 按 maxFontSize 换算为 charSpacing，保持 CSS 行为近似
 *   4. textShadow 只支持容器级别，不支持 per-character
 *      （fabric 的 Shadow 是对象级别属性，不能挂到 styles 上）
 *   5. 所有字符归入 styles[0]，不手动拆行，fabric 会按 width + splitByGrapheme 自动断行
 */
export function createStyledTextObject(
  segments: InlineSegment[],
  layout: ElementLayout,
  baseStyle: ParsedStyle,
): Textbox {
  // 按 DOM 顺序拼接所有段的原始文本
  const mergedText = segments.map(s => s.text).join('')

  // 构建 per-character 样式映射：每个字符索引对应一个 FabricCharStyle 对象
  const charStyles: Record<number, FabricCharStyle> = {}
  let charIndex = 0
  for (const seg of segments) {
    const segFontFamily = pickFirstFontFamily(seg.style.fontFamily)
    const perChar: FabricCharStyle = {
      fontSize: seg.style.fontSize,
      fill: seg.style.color,
      fontFamily: segFontFamily,
      fontWeight: seg.style.fontWeight,
      fontStyle: seg.style.fontStyle as 'normal' | 'italic' | 'oblique',
      underline: seg.style.textDecoration.underline,
      linethrough: seg.style.textDecoration.linethrough,
      overline: seg.style.textDecoration.overline,
    }
    // 对该段每个字符索引赋样式。
    // 注意：JS string.length 返回 UTF-16 code unit 数，不是 grapheme 数。
    // 对 BMP 范围内的 CJK/拉丁字符来说 1 code unit == 1 grapheme，
    // fabric 内部也按 code unit 索引 styles，一致即可。
    // 仅对 emoji/surrogate pair 场景存在偏差，目前生成内容不涉及。
    for (let i = 0; i < seg.text.length; i++) {
      charStyles[charIndex + i] = { ...perChar }
    }
    charIndex += seg.text.length
  }

  // 取所有段字号的最大值作为 Textbox 基线字号，确保行高以最大字号驱动
  const maxFontSize = segments.reduce(
    (max, seg) => Math.max(max, seg.style.fontSize),
    baseStyle.fontSize,
  )

  // 容器级 fontFamily 和 letterSpacing 兜底
  const baseFontFamily = pickFirstFontFamily(baseStyle.fontFamily)
  const charSpacing = maxFontSize > 0
    ? (baseStyle.letterSpacing / maxFontSize) * 1000
    : 0

  // textShadow 来自父元素（不支持 per-character shadow）
  let shadow: InstanceType<typeof Shadow> | undefined
  if (baseStyle.textShadow) {
    shadow = new Shadow({
      color: baseStyle.textShadow.color,
      offsetX: baseStyle.textShadow.offsetX,
      offsetY: baseStyle.textShadow.offsetY,
      blur: baseStyle.textShadow.blur,
    })
  }

  // textAlign 映射（与 createTextObject 一致）
  let textAlign = baseStyle.textAlign
  if (textAlign === 'start') textAlign = 'left'
  else if (textAlign === 'end') textAlign = 'right'
  const normalizedAlign = textAlign as 'left' | 'center' | 'right' | 'justify'

  // 单行 slack 扩展：使用 maxFontSize 作为参考行高基准
  // （fabric 的行高被最大字号驱动，所以判断"DOM 是否单行"也应该用 maxFontSize）
  const { left: textLeft, width: textWidth, slackApplied } = computeSingleLineWidthSlack(
    layout,
    maxFontSize,
    baseStyle.lineHeight,
    normalizedAlign,
  )
  if (slackApplied) {
    console.log('[TextHandler] 混合样式单行 slack 扩展:', {
      text: mergedText.length > 20 ? mergedText.slice(0, 20) + '…' : mergedText,
      origin: { left: layout.left, width: layout.width },
      expanded: { left: textLeft, width: textWidth },
      maxFontSize,
    })
  }

  const textbox = new Textbox(mergedText, {
    left: textLeft,
    top: layout.top,
    width: textWidth,
    originX: 'left',
    originY: 'top',

    // 基线样式（作为未被 styles 覆盖的字符的 fallback）
    fontSize: maxFontSize,
    fontFamily: baseFontFamily,
    fontWeight: baseStyle.fontWeight as string,
    fontStyle: baseStyle.fontStyle as 'normal' | 'italic' | 'oblique',
    fill: baseStyle.color,

    // 排版
    lineHeight: baseStyle.lineHeight,
    charSpacing,
    textAlign: normalizedAlign,
    splitByGrapheme: true,

    underline: baseStyle.textDecoration.underline,
    linethrough: baseStyle.textDecoration.linethrough,
    overline: baseStyle.textDecoration.overline,

    opacity: baseStyle.opacity,
    shadow,
    angle: baseStyle.rotation,

    // per-character 样式映射：所有字符归入虚拟行 0
    styles: { 0: charStyles },

    editable: true,
    selectable: true,
  })

  console.log('[TextHandler] 创建混合样式 Textbox:', {
    text: mergedText.length > 30 ? mergedText.slice(0, 30) + '…' : mergedText,
    segments: segments.length,
    maxFontSize,
    fontSizes: segments.map(s => s.style.fontSize),
    layout,
  })

  return textbox
}
