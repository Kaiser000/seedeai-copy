import type { Canvas as FabricCanvas } from 'fabric'

/**
 * Global Fabric.js canvas singleton registry.
 *
 * Provides canvas access to toolbar, export, roll, and chat components
 * without prop drilling through the component tree.
 *
 * Lifecycle (managed by useFabricCanvas):
 *  - Set to the new canvas instance when CanvasPanel mounts.
 *  - Cleared to null when CanvasPanel unmounts (canvas.dispose() is also called).
 *
 * Assumption: only ONE canvas is active at a time. If multiple CanvasPanel
 * instances were ever mounted simultaneously, the last one to mount would win.
 * Use React Context instead if multi-canvas support is ever needed.
 */
let _canvas: FabricCanvas | null = null

export function getGlobalCanvas(): FabricCanvas | null {
  return _canvas
}

export function setGlobalCanvas(canvas: FabricCanvas | null): void {
  _canvas = canvas
}
