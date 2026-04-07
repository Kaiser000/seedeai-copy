import { Canvas as FabricCanvas } from 'fabric'
import type { CanvasConfig, CanvasElement, ConversionResult } from './types'
import { processElement } from './handlers/groupHandler'

let elementCounter = 0

function generateId(): string {
  return `el-${++elementCounter}`
}

// Maps Fabric.js internal object types to CanvasElement type values.
// - textbox → text  (created by textHandler)
// - rect    → shape (created by shapeHandler for background fills)
// - image   → image (created by imageHandler for <img> elements)
const FABRIC_TYPE_MAP: Record<string, CanvasElement['type']> = {
  textbox: 'text',
  rect: 'shape',
  image: 'image',
}

export async function convertDomToCanvas(
  domRoot: HTMLElement,
  canvasConfig: CanvasConfig,
  targetCanvas?: FabricCanvas,
): Promise<ConversionResult> {
  const warnings: string[] = []
  const elements: CanvasElement[] = []

  // Reuse targetCanvas if provided (chat/roll updates); otherwise create an offscreen canvas.
  // When reusing, clear and resize to match the new config before adding objects.
  const canvas = targetCanvas || new FabricCanvas(null as unknown as HTMLCanvasElement, {
    width: canvasConfig.width,
    height: canvasConfig.height,
    backgroundColor: canvasConfig.backgroundColor || '#ffffff',
  })

  if (targetCanvas) {
    canvas.clear()
    canvas.setDimensions({
      width: canvasConfig.width,
      height: canvasConfig.height,
    })
    canvas.backgroundColor = canvasConfig.backgroundColor || '#ffffff'
  }

  const containerRect = domRoot.getBoundingClientRect()
  console.log('[ConvertDomToCanvas] containerRect:', {
    left: containerRect.left,
    top: containerRect.top,
    width: containerRect.width,
    height: containerRect.height,
  })

  let fabricObjects: Awaited<ReturnType<typeof processElement>>
  try {
    fabricObjects = await processElement(domRoot, containerRect, warnings)
  } catch (err) {
    console.error('[ConvertDomToCanvas] Fatal error during element processing:', {
      error: (err as Error).message,
      stack: (err as Error).stack,
    })
    throw err
  }

  for (const obj of fabricObjects) {
    canvas.add(obj)
    const objType = obj.type as string
    const type = FABRIC_TYPE_MAP[objType]
    if (!type) {
      console.warn('[ConvertDomToCanvas] Unknown Fabric.js object type, skipping:', objType)
      continue
    }
    elements.push({
      id: generateId(),
      type,
      fabricObject: obj,
    })
  }

  canvas.renderAll()

  return { canvas, elements, warnings }
}
