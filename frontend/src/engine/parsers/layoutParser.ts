export interface ElementLayout {
  left: number
  top: number
  width: number
  height: number
}

export function parseLayout(element: HTMLElement, containerRect: DOMRect): ElementLayout {
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    console.warn('[LayoutParser] Element has zero dimensions (hidden or display:none?):', element.tagName, element.className)
  }
  return {
    left: rect.left - containerRect.left,
    top: rect.top - containerRect.top,
    width: rect.width,
    height: rect.height,
  }
}
