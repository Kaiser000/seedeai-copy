import type { LayoutElement } from '@/features/editor/stores/useEditorStore'

/**
 * 从 JSX 代码中解析出页面布局元素列表。
 *
 * 用于工作流"页面布局"阶段的元素概览展示。
 * 采用简单正则匹配，识别图片、文本和形状元素，
 * 不要求 100% 精确——仅为给用户提供直观的布局摘要。
 */
export function parseLayoutElements(jsxCode: string): LayoutElement[] {
  const elements: LayoutElement[] = []

  // ── 图片元素：查找 <img 标签 ────────────────────────────────────
  const imgMatches = jsxCode.match(/<img\b/g)
  if (imgMatches) {
    for (let i = 0; i < imgMatches.length; i++) {
      elements.push({ type: 'image', label: '图片' })
    }
  }

  // ── 文本元素：查找 JSX 中有意义的文本节点 ────────────────────────
  // 匹配 > 和 < 之间长度 >= 2 的非空文本
  const textRegex = />\s*([^\s<>{][^<>{}\n]*?)\s*</g
  let match
  while ((match = textRegex.exec(jsxCode)) !== null) {
    const text = match[1].trim()
    // 过滤：纯数字/标点、JSX 表达式、注释
    if (
      text.length >= 2 &&
      !/^[\s\d.,;:!?\-_=+/\\'"()]+$/.test(text) &&
      !text.startsWith('{') &&
      !text.startsWith('//')
    ) {
      const display = text.length > 20 ? text.slice(0, 20) + '...' : text
      elements.push({ type: 'text', label: `"${display}"` })
    }
  }

  // ── 形状元素：查找有可视样式（背景色/渐变/边框）的 div ──────────
  // 只匹配含 bg-{颜色} 或 bg-gradient 或 border-{数字} 的 className
  const shapeRegex = /<div\b[^>]*className="([^"]*)"[^>]*(?:\/>|>)/g
  while ((match = shapeRegex.exec(jsxCode)) !== null) {
    const classes = match[1]
    const hasVisualStyle =
      /\bbg-(?:red|blue|green|yellow|purple|pink|orange|gray|black|white|slate|zinc|neutral|stone|amber|lime|emerald|teal|cyan|sky|indigo|violet|fuchsia|rose)-\d/.test(classes) ||
      /\bbg-gradient-/.test(classes) ||
      /\bborder-\d/.test(classes) ||
      /\brounded-full\b/.test(classes)
    // 排除纯布局容器（只有 flex/grid/absolute 等定位类）
    const isOnlyLayout = /^(?:flex|grid|absolute|relative|fixed|w-|h-|p-|m-|inset-|items-|justify-|overflow-|min-|max-|gap-|space-|\s)+$/.test(classes)
    if (hasVisualStyle && !isOnlyLayout) {
      elements.push({ type: 'shape', label: '形状' })
    }
  }

  return elements
}
