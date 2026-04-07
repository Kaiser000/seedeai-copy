import { useCallback, useEffect, useState } from 'react'
import { Textbox } from 'fabric'
import type { FabricObject } from 'fabric'
import { getGlobalCanvas } from '../canvasRegistry'
import { useEditorStore } from '../stores/useEditorStore'
import { useCanvasCommands } from '../hooks/useCanvasCommands'
import type { Command } from '../hooks/useCanvasCommands'

function NumInput({ value, onChange, min, max }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number
}) {
  return (
    <input
      type="number"
      value={Math.round(value)}
      min={min}
      max={max}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-7 px-2 border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-gray-400 text-right"
    />
  )
}

interface ObjState {
  x: number; y: number; w: number; h: number; opacity: number
  isTxt: boolean
  fill: string; fontSize: number; textAlign: string
}

function readState(obj: FabricObject): ObjState {
  const isTxt = obj instanceof Textbox
  return {
    x: Math.round(obj.left || 0),
    y: Math.round(obj.top || 0),
    w: Math.round((obj.width || 0) * (obj.scaleX || 1)),
    h: Math.round((obj.height || 0) * (obj.scaleY || 1)),
    opacity: Math.round((obj.opacity ?? 1) * 100),
    isTxt,
    fill: isTxt ? (obj as Textbox).fill as string || '#000000' : '#000000',
    fontSize: isTxt ? (obj as Textbox).fontSize || 16 : 16,
    textAlign: isTxt ? (obj as Textbox).textAlign || 'left' : 'left',
  }
}

interface PropertiesPanelProps {
  refreshToken?: number
}

export function PropertiesPanel({ refreshToken }: PropertiesPanelProps) {
  const [state, setState] = useState<ObjState | null>(null)
  const selectedId = useEditorStore((s) => s.selectedElementId)
  const { pushCommand } = useCanvasCommands()

  const refresh = useCallback(() => {
    const canvas = getGlobalCanvas()
    const obj = canvas?.getActiveObject()
    setState(obj ? readState(obj) : null)
  }, [])

  useEffect(() => { refresh() }, [refresh, selectedId, refreshToken])

  useEffect(() => {
    const canvas = getGlobalCanvas()
    if (!canvas) return
    const evs = ['selection:created', 'selection:updated', 'selection:cleared', 'object:modified']
    evs.forEach((ev) => canvas.on(ev as never, refresh))
    return () => evs.forEach((ev) => canvas.off(ev as never, refresh))
  }, [refresh])

  // Apply a property change with undo/redo
  const applyProp = useCallback((fabricKey: string, newVal: unknown, oldVal: unknown) => {
    const canvas = getGlobalCanvas()
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj) return
    const cmd: Command = {
      execute: () => { obj.set(fabricKey as keyof FabricObject, newVal as never); obj.setCoords(); canvas.renderAll() },
      undo: () => { obj.set(fabricKey as keyof FabricObject, oldVal as never); obj.setCoords(); canvas.renderAll() },
      description: `Set ${fabricKey}`,
      timestamp: Date.now(),
    }
    cmd.execute()
    pushCommand(cmd)
  }, [pushCommand])

  const setProp = useCallback((key: keyof ObjState, val: number | string) => {
    const canvas = getGlobalCanvas()
    const obj = canvas?.getActiveObject()
    if (!canvas || !obj || state === null) return

    if (key === 'x') applyProp('left', val, obj.left)
    else if (key === 'y') applyProp('top', val, obj.top)
    else if (key === 'w') applyProp('scaleX', (val as number) / (obj.width || 1), obj.scaleX)
    else if (key === 'h') applyProp('scaleY', (val as number) / (obj.height || 1), obj.scaleY)
    else if (key === 'opacity') applyProp('opacity', (val as number) / 100, obj.opacity)
    else if (key === 'fill') applyProp('fill', val, (obj as Textbox).fill)
    else if (key === 'fontSize') applyProp('fontSize', val, (obj as Textbox).fontSize)
    else if (key === 'textAlign') applyProp('textAlign', val, (obj as Textbox).textAlign)

    setState((s) => s ? { ...s, [key]: val } : s)
  }, [applyProp, state])

  if (!state) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8 text-center">
        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center mb-2">
          <Settings2Icon />
        </div>
        <p className="text-xs text-gray-400">选中元素后</p>
        <p className="text-[11px] text-gray-300 mt-0.5">属性将显示在这里</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3">

      {/* Position & Size */}
      <SectionTitle>位置与大小</SectionTitle>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-2">
        <FieldRow label="X">
          <NumInput value={state.x} onChange={(v) => setProp('x', v)} />
        </FieldRow>
        <FieldRow label="Y">
          <NumInput value={state.y} onChange={(v) => setProp('y', v)} />
        </FieldRow>
        <FieldRow label="宽">
          <NumInput value={state.w} onChange={(v) => setProp('w', v)} min={1} />
        </FieldRow>
        <FieldRow label="高">
          <NumInput value={state.h} onChange={(v) => setProp('h', v)} min={1} />
        </FieldRow>
      </div>

      <FieldRow label="透明">
        <div className="flex items-center gap-2">
          <input
            type="range" min={0} max={100} value={state.opacity}
            onChange={(e) => setProp('opacity', Number(e.target.value))}
            className="flex-1 accent-gray-700 h-1"
          />
          <span className="text-[11px] text-gray-500 w-8 text-right">{state.opacity}%</span>
        </div>
      </FieldRow>

      {/* Text */}
      {state.isTxt && (
        <>
          <div className="h-px bg-gray-100 my-3" />
          <SectionTitle>文字属性</SectionTitle>

          <FieldRow label="颜色">
            <input
              type="color" value={state.fill}
              onChange={(e) => setProp('fill', e.target.value)}
              className="w-full h-7 border border-gray-200 rounded cursor-pointer"
            />
          </FieldRow>

          <FieldRow label="字号">
            <NumInput value={state.fontSize} onChange={(v) => setProp('fontSize', v)} min={6} max={400} />
          </FieldRow>

          <FieldRow label="对齐">
            <div className="flex gap-1">
              {(['left', 'center', 'right'] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setProp('textAlign', a)}
                  className={`flex-1 h-7 text-xs rounded border transition-colors
                    ${state.textAlign === a
                      ? 'bg-gray-900 text-white border-gray-900'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {a === 'left' ? '左' : a === 'center' ? '中' : '右'}
                </button>
              ))}
            </div>
          </FieldRow>
        </>
      )}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-2">{children}</p>
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <PropLabel>{label}</PropLabel>
      <div className="flex-1">{children}</div>
    </div>
  )
}

function PropLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-gray-400 w-10 flex-shrink-0">{children}</span>
}

function Settings2Icon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}
