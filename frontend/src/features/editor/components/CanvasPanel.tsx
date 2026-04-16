import { useRef, useEffect, useState, useCallback } from 'react'
import { useEditorStore } from '../stores/useEditorStore'
import { useFabricCanvas } from '../hooks/useFabricCanvas'
import { loadFonts } from '@/engine/utils/fontLoader'
import { convertDomToCanvas } from '@/engine/index'
import { runGeometricAudit } from '@/engine/audit/geometricAudit'
import { compileJsx, renderToHiddenDom } from '@/features/generation/services/jsxCompiler'
import { ADAPTIVE_HEIGHT } from '@/features/input/components/SizeSelector'
import React from 'react'
import * as ReactDOMClient from 'react-dom/client'
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { AuditBanner } from './AuditBanner'

/** 自适应长图模式下，渲染前的画布占位高度（仅用于初始显示，渲染后被实测值替换） */
const ADAPTIVE_PLACEHOLDER_HEIGHT = 3000

interface CanvasPanelProps {
  onLayersChange?: () => void
}

export function CanvasPanel({ onLayersChange }: CanvasPanelProps) {
  const canvasElRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)

  const { getCanvas } = useFabricCanvas(canvasElRef)

  const generatedCode = useEditorStore((s) => s.generatedCode)
  const posterSize = useEditorStore((s) => s.posterSize)
  const setPosterSize = useEditorStore((s) => s.setPosterSize)
  const setError = useEditorStore((s) => s.setError)
  const setAuditReport = useEditorStore((s) => s.setAuditReport)

  /** 是否为自适应高度模式（长图） */
  const isAdaptive = posterSize.height === ADAPTIVE_HEIGHT
  /** 用于显示和计算的有效高度：自适应模式使用占位高度直到渲染后测量出实际值 */
  const effectiveHeight = isAdaptive ? ADAPTIVE_PLACEHOLDER_HEIGHT : posterSize.height

  const [fontsReady, setFontsReady] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [zoomDisplay, setZoomDisplay] = useState(100)

  // 跟踪待渲染代码：当渲染进行中时新代码到来，暂存到 ref，
  // 渲染结束后检查并触发二次渲染（解决 code_complete → complete 丢失问题）
  const pendingCodeRef = useRef<string | null>(null)

  // Zoom/pan state kept in refs for smooth, non-rerender updates
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const isPanningRef = useRef(false)
  const lastPosRef = useRef({ x: 0, y: 0 })

  const applyTransform = useCallback(() => {
    if (!innerRef.current) return
    const { x, y } = panRef.current
    const z = zoomRef.current
    innerRef.current.style.transform =
      `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${z})`
    setZoomDisplay(Math.round(z * 100))
  }, [])

  const fitToScreen = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const { width: cw, height: ch } = container.getBoundingClientRect()
    const pad = 64
    const scaleX = (cw - pad * 2) / posterSize.width
    // 自适应模式下高度可能为 0（尚未渲染），使用占位高度避免除零
    const displayH = posterSize.height || ADAPTIVE_PLACEHOLDER_HEIGHT
    const scaleY = (ch - pad * 2) / displayH
    const scale = Math.min(scaleX, scaleY)
    zoomRef.current = Math.max(0.05, Math.min(4, scale))
    panRef.current = { x: 0, y: 0 }
    applyTransform()
  }, [posterSize, applyTransform])

  // Initial fit after layout settles
  useEffect(() => {
    const timer = setTimeout(fitToScreen, 120)
    return () => clearTimeout(timer)
  }, [fitToScreen])

  const zoomIn = useCallback(() => {
    zoomRef.current = Math.min(zoomRef.current * 1.25, 8)
    applyTransform()
  }, [applyTransform])

  const zoomOut = useCallback(() => {
    zoomRef.current = Math.max(zoomRef.current / 1.25, 0.05)
    applyTransform()
  }, [applyTransform])

  const zoomReset = useCallback(() => {
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
    applyTransform()
  }, [applyTransform])

  // Ctrl+wheel zoom: 0.999^deltaY maps each wheel tick (~120 units) to ~±12% scale change.
  // Negative deltaY (scroll up) → factor > 1 → zoom in; positive → zoom out.
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      zoomRef.current = Math.max(0.05, Math.min(8, zoomRef.current * (0.999 ** e.deltaY)))
      applyTransform()
    }
  }, [applyTransform])

  // Middle mouse button pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault()
      isPanningRef.current = true
      lastPosRef.current = { x: e.clientX, y: e.clientY }
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanningRef.current) return
    const dx = e.clientX - lastPosRef.current.x
    const dy = e.clientY - lastPosRef.current.y
    panRef.current = { x: panRef.current.x + dx, y: panRef.current.y + dy }
    lastPosRef.current = { x: e.clientX, y: e.clientY }
    applyTransform()
  }, [applyTransform])

  const stopPan = useCallback(() => { isPanningRef.current = false }, [])

  // Keyboard shortcuts: Ctrl+0 fit, Ctrl+= zoom in, Ctrl+- zoom out
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return
      if (e.key === '0') { e.preventDefault(); fitToScreen() }
      if (e.key === '=' || e.key === '+') { e.preventDefault(); zoomIn() }
      if (e.key === '-') { e.preventDefault(); zoomOut() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [fitToScreen, zoomIn, zoomOut])

  useEffect(() => {
    loadFonts().then(() => setFontsReady(true))
  }, [])

  // Render pipeline: JSX string → Babel compile → hidden DOM render → 200ms flush
  // → Fabric.js canvas snapshot.
  //
  // 当渲染进行中有新代码到来（如 code_complete → complete），暂存到 pendingCodeRef，
  // 当前渲染结束后自动触发二次渲染。
  useEffect(() => {
    if (!generatedCode || !fontsReady) return
    if (rendering) {
      // 渲染中收到新代码，暂存等当前渲染结束后再渲染
      pendingCodeRef.current = generatedCode
      return
    }
    runRender(generatedCode)
  }, [generatedCode, fontsReady]) // eslint-disable-line react-hooks/exhaustive-deps

  const runRender = useCallback(async (codeToRender: string) => {
    setRendering(true)
    pendingCodeRef.current = null

    // 自适应长图模式：hidden div 使用 auto 高度，渲染后测量实际内容高度
    const adaptive = posterSize.height === ADAPTIVE_HEIGHT

    // 将 hidden div 挂到 document.body 而非组件内部的 overflow:hidden 容器，
    // 避免父容器的 CSS 属性干扰布局计算（getBoundingClientRect）
    const hiddenDiv = document.createElement('div')
    hiddenDiv.style.cssText =
      `position:absolute;visibility:hidden;pointer-events:none;left:-9999px;` +
      `width:${posterSize.width}px;` +
      (adaptive ? '' : `height:${posterSize.height}px;`)
    document.body.appendChild(hiddenDiv)

    try {
      // 调试：输出原始 JSX 代码的前 500 字符，用于排查 LLM 输出格式问题
      console.log('[CanvasPanel] 原始 JSX 代码 (前500字符):', codeToRender.slice(0, 500))
      console.log('[CanvasPanel] 代码总长度:', codeToRender.length)
      if (adaptive) {
        console.log('[CanvasPanel] 自适应长图模式 — 渲染后将测量实际高度')
      }

      const compiledJs = await compileJsx(codeToRender)

      // 调试：输出 Babel 编译后代码的前 500 字符
      console.log('[CanvasPanel] Babel 编译后 (前500字符):', compiledJs.slice(0, 500))

      renderToHiddenDom(compiledJs, hiddenDiv, React, ReactDOMClient)

      // 等待所有图片加载完成，然后等待浏览器完成布局重排。
      // flushSync 已确保 React 同步渲染完成，此时 DOM 一定存在。
      const imgs = Array.from(hiddenDiv.querySelectorAll<HTMLImageElement>('img'))
      console.log('[CanvasPanel] 检测到图片数:', imgs.length)
      if (imgs.length > 0) {
        await Promise.all(
          imgs.map((img) =>
            img.complete
              ? Promise.resolve()
              : new Promise<void>((resolve) => {
                  img.onload = () => resolve()
                  img.onerror = () => resolve()
                }),
          ),
        )
        // 图片加载后等待浏览器完成布局重排（图片尺寸变化会触发 reflow）
        await new Promise((r) => setTimeout(r, 200))
      } else {
        // 无图片时也等待布局稳定（Tailwind 类名解析、flex/grid 计算）
        await new Promise((r) => setTimeout(r, 200))
      }

      // ── 自适应高度测量：渲染完成后从 DOM 取实际高度 ──
      // 对于固定尺寸模式直接使用预设高度；自适应模式从 hidden div 的内容高度推导
      let resolvedHeight = posterSize.height
      if (adaptive) {
        // scrollHeight 包含了 overflow 溢出的内容，是内容的真实高度
        const measured = hiddenDiv.scrollHeight
        // 安全下限：即使 LLM 生成了几乎空的内容，也至少保持一个合理的最小高度
        resolvedHeight = Math.max(measured, posterSize.width)
        console.log('[CanvasPanel] 自适应长图实测高度:', {
          scrollHeight: hiddenDiv.scrollHeight,
          offsetHeight: hiddenDiv.offsetHeight,
          resolvedHeight,
        })
        // 将实测高度回写到 store，后续 export/chat/roll 都使用此值
        setPosterSize({ ...posterSize, height: resolvedHeight })
      }

      const canvas = getCanvas()
      if (!canvas) return

      // ── 几何审计：在拷贝到 fabric canvas 之前跑一遍规则集 ──
      // audit 不抛异常，失败只是"发现问题"；写入 store 让 AuditBanner 展示，
      // 并可被 useAuditRepair 回注到 LLM 做修复。
      try {
        const report = runGeometricAudit(hiddenDiv, {
          width: posterSize.width,
          height: resolvedHeight,
        })
        setAuditReport(report)
      } catch (auditErr) {
        // 保险丝：审计模块异常绝不能阻塞渲染主流程
        console.error('[CanvasPanel] 几何审计异常，跳过:', {
          error: (auditErr as Error).message,
        })
        setAuditReport(null)
      }

      await convertDomToCanvas(
        hiddenDiv,
        { width: posterSize.width, height: resolvedHeight, backgroundColor: '#ffffff' },
        canvas,
      )

      // 自适应模式下画布尺寸变化，重新 fit 到屏幕
      if (adaptive) {
        setTimeout(() => fitToScreen(), 50)
      }

      onLayersChange?.()
    } catch (err) {
      const rawMessage = (err as Error).message || 'unknown error'
      console.error('[CanvasPanel] Render pipeline failed:', {
        error: rawMessage,
        stack: (err as Error).stack,
        codeLength: codeToRender.length,
        posterSize,
      })

      // 渲染失败时清空画布：避免上次成功渲染的 fabric 对象残留，
      // 让用户误以为"只是局部丢了"。空白画布 + 明确错误条能诚实反映状态。
      const canvas = getCanvas()
      if (canvas) {
        try {
          canvas.clear()
          canvas.backgroundColor = '#ffffff'
          canvas.renderAll()
          onLayersChange?.()
        } catch (clearErr) {
          console.warn('[CanvasPanel] 清空画布失败:', clearErr)
        }
      }

      // 把真实错误类型透给用户，LLM typo 这种场景下一眼可见是哪个变量
      // ReferenceError / SyntaxError / TypeError 等运行时错误都会被捕获
      setError(`渲染失败：${rawMessage}`)
    } finally {
      document.body.removeChild(hiddenDiv)
      setRendering(false)
      const pending = pendingCodeRef.current
      if (pending) {
        pendingCodeRef.current = null
        runRender(pending)
      }
    }
  }, [posterSize, getCanvas, onLayersChange, setError, setPosterSize, fitToScreen]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col h-full">
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden select-none"
        style={{
          background: `radial-gradient(circle, #c8c8c8 1.5px, #f0f0f0 1.5px)`,
          backgroundSize: '24px 24px',
          cursor: isPanningRef.current ? 'grabbing' : 'default',
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopPan}
        onMouseLeave={stopPan}
      >
        {/* Canvas transform wrapper */}
        <div
          ref={innerRef}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transformOrigin: 'center center',
            willChange: 'transform',
          }}
        >
          <canvas
            ref={canvasElRef}
            width={posterSize.width}
            height={posterSize.height || effectiveHeight}
            style={{ display: 'block', boxShadow: '0 8px 40px rgba(0,0,0,0.22)' }}
          />
        </div>

        {/* Loading overlay */}
        {(rendering || !fontsReady) && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-[2px] z-20">
            <div className="flex items-center gap-2.5 bg-white border border-gray-200 rounded-xl px-5 py-3 shadow-lg">
              <div className="w-4 h-4 border-2 border-gray-800 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-medium text-gray-700">
                {!fontsReady ? '加载字体中...' : '正在渲染海报...'}
              </span>
            </div>
          </div>
        )}

        {/* Zoom controls — bottom right */}
        <div className="absolute bottom-4 right-4 flex items-center bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden z-10">
          <button
            onClick={zoomOut}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 transition-colors border-r border-gray-200"
            title="缩小 (Ctrl+-)"
          >
            <ZoomOut size={14} className="text-gray-600" />
          </button>
          <button
            onClick={zoomReset}
            className="px-2.5 h-8 flex items-center justify-center hover:bg-gray-100 transition-colors text-xs font-medium text-gray-700 min-w-[52px] border-r border-gray-200"
            title="重置缩放 (100%)"
          >
            {zoomDisplay}%
          </button>
          <button
            onClick={zoomIn}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 transition-colors border-r border-gray-200"
            title="放大 (Ctrl+=)"
          >
            <ZoomIn size={14} className="text-gray-600" />
          </button>
          <button
            onClick={fitToScreen}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 transition-colors"
            title="适配窗口 (Ctrl+0)"
          >
            <Maximize2 size={13} className="text-gray-600" />
          </button>
        </div>

        {/* Canvas size — bottom left */}
        <div className="absolute bottom-4 left-4 text-[11px] text-gray-400 bg-white/80 px-2 py-1 rounded-md z-10">
          {posterSize.width} × {isAdaptive ? '自适应' : posterSize.height}
        </div>

        {/* Usage hint — middle mouse pan */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 text-[11px] text-gray-400 pointer-events-none select-none z-10 opacity-60">
          滚轮缩放 (Ctrl)  ·  中键拖拽平移
        </div>

        {/* 几何审计结果 Banner —— 仅在发现问题时渲染，右上角浮层 */}
        <AuditBanner />
      </div>
    </div>
  )
}
