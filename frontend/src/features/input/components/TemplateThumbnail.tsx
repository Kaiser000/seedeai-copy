/**
 * TemplateThumbnail — 模板预览缩略图组件
 *
 * 通过 IntersectionObserver 懒加载模板 sourceCode，
 * 编译 JSX 并渲染到隐藏 DOM 容器，再用 CSS transform 缩放为缩略图。
 * 外部图片统一替换为纯色占位，避免网络请求和 broken image。
 *
 * 使用模块级渲染队列，确保同一时刻只有一个模板在编译/渲染，防止主线程阻塞。
 */
import { useRef, useEffect, useState } from 'react'
import React from 'react'
import * as ReactDOMClient from 'react-dom/client'
import { flushSync } from 'react-dom'
import { compileJsx } from '@/features/generation/services/jsxCompiler'

// ---------------------------------------------------------------------------
// 渲染队列 — 逐个处理模板编译，避免同时触发多个 Babel 编译导致 UI 卡顿
// ---------------------------------------------------------------------------
let processing = false
const renderQueue: Array<() => Promise<void>> = []

function enqueueRender(task: () => Promise<void>) {
  return new Promise<void>((resolve) => {
    renderQueue.push(async () => {
      await task()
      resolve()
    })
    drainQueue()
  })
}

async function drainQueue() {
  if (processing) return
  processing = true
  while (renderQueue.length > 0) {
    const task = renderQueue.shift()!
    await task()
  }
  processing = false
}

// ---------------------------------------------------------------------------
// 模板源码预处理 — 清理非组件代码，确保 new Function 执行安全
// ---------------------------------------------------------------------------

/**
 * 清理模板 sourceCode，移除 ReactDOM 渲染调用和非代码包裹。
 *
 * 模板源码通常包含:
 * 1. `import React ...` / `import ReactDOM ...` （由 compileJsx 的 stripCodeFences 处理）
 * 2. 末尾的 `ReactDOM.createRoot(document.getElementById('root')).render(...)` 会导致
 *    new Function 执行时报错（ReactDOM 未定义、#root 不存在）
 * 3. 部分模板被 markdown 代码块或 XML 标签包裹（如 <seede-code>）
 */
function preprocessTemplateSource(source: string): string {
  let cleaned = source

  // 去除 XML/HTML 包裹标签（如 <seede-code>、<ai_message> 等）
  cleaned = cleaned.replace(/<\/?(?:seede-code|ai_message|assistant)[^>]*>/g, '')

  // 去除 markdown 代码块（```jsx ... ```）
  cleaned = cleaned.replace(/^```[\w]*\s*\n?/gm, '')
  cleaned = cleaned.replace(/\n?```\s*$/gm, '')

  // 移除末尾的 ReactDOM.createRoot(...).render(...) 调用
  // 匹配模式: const root = ReactDOM.createRoot(...); root.render(...);
  // 或: ReactDOM.createRoot(...).render(...)
  cleaned = cleaned.replace(
    /(?:\/\/[^\n]*\n)*(?:const\s+root\s*=\s*)?ReactDOM\.createRoot\([\s\S]*$/,
    '',
  )

  return cleaned.trim()
}

// ---------------------------------------------------------------------------
// 组件
// ---------------------------------------------------------------------------
interface TemplateThumbnailProps {
  /** 模板 ID，用于请求 /api/templates/{id} 获取 sourceCode */
  templateId: string
  /** 模板原始画布宽度（px），用于计算缩放比例 */
  templateWidth: number
  /** 模板原始画布高度（px） */
  templateHeight: number
  /** 模板主色调数组，用于渐变占位背景 */
  colors: string[]
}

export function TemplateThumbnail({
  templateId,
  templateWidth,
  templateHeight,
  colors,
}: TemplateThumbnailProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const renderRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<ReactDOMClient.Root | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle')

  // IntersectionObserver — 进入视口 100px 范围时开始加载
  useEffect(() => {
    if (!containerRef.current || state !== 'idle') return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          observer.disconnect()
          setState('loading')
          enqueueRender(() => loadAndRender())
        }
      },
      { rootMargin: '100px' },
    )

    observer.observe(containerRef.current)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId])

  /** 获取 sourceCode → 编译 → 渲染 → 替换图片 */
  const loadAndRender = async () => {
    try {
      // 1. 获取模板详情（含 sourceCode）
      const resp = await fetch(`/api/templates/${templateId}`)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const json = await resp.json()
      if (json.code !== 200 || !json.data?.sourceCode) {
        setState('error')
        return
      }

      // 2. 预处理源码（去除 ReactDOM 渲染调用等），然后编译 JSX
      const preprocessed = preprocessTemplateSource(json.data.sourceCode)
      const compiled = await compileJsx(preprocessed)
      if (!renderRef.current) return

      // 3. 执行编译产物，获取组件函数
      //    模板组件名可能是 App 或 Poster，兼容两种命名
      const win = window as unknown as Record<string, unknown>
      win.React = React

      const detectComponent =
        '\nreturn typeof Poster!=="undefined"?Poster:typeof App!=="undefined"?App:null;'
      const factory = new Function('React', compiled + detectComponent)
      const Component = factory(React)

      if (!Component) {
        console.warn('[TemplateThumbnail] 未找到 Poster/App 组件:', templateId)
        setState('error')
        return
      }

      // 4. 创建 React root 并同步渲染
      rootRef.current = ReactDOMClient.createRoot(renderRef.current)
      flushSync(() => {
        rootRef.current!.render(React.createElement(Component))
      })

      // 5. 替换所有 <img> 的 src，防止大量外部图片请求
      //    用 1×1 透明 SVG 替代，保留背景色显示布局占位
      const placeholderColor = colors[0] || '#e5e7eb'
      renderRef.current.querySelectorAll('img').forEach((img) => {
        img.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'
        img.removeAttribute('srcset')
        img.style.backgroundColor = placeholderColor
        img.style.opacity = '0.3'
      })

      setState('loaded')
    } catch (err) {
      console.warn('[TemplateThumbnail] 渲染失败:', templateId, (err as Error).message)
      setState('error')
    }
  }

  // 组件卸载时清理 React root
  useEffect(() => {
    return () => {
      // 延迟卸载避免 flushSync 冲突
      const root = rootRef.current
      if (root) {
        setTimeout(() => root.unmount(), 0)
      }
    }
  }, [])

  // 计算缩放比例 — 基于容器实际宽度
  const containerWidth = containerRef.current?.offsetWidth || 200
  const scale = containerWidth / templateWidth

  // 渐变占位背景
  const gradientBg =
    colors.length >= 2
      ? `linear-gradient(135deg, ${colors.join(', ')})`
      : colors[0] || '#f3f4f6'

  return (
    <div
      ref={containerRef}
      className="relative overflow-hidden bg-muted/30 rounded-t-lg"
      style={{ height: '120px' }}
    >
      {/* 渐变占位背景 — 加载前和出错时可见 */}
      {state !== 'loaded' && (
        <div
          className="absolute inset-0"
          style={{ background: gradientBg }}
        />
      )}

      {/* 实际渲染容器 — 缩放到缩略图尺寸 */}
      <div
        ref={renderRef}
        className={`origin-top-left absolute pointer-events-none select-none transition-opacity duration-300 ${
          state === 'loaded' ? 'opacity-100' : 'opacity-0'
        }`}
        style={{
          width: `${templateWidth}px`,
          height: `${templateHeight}px`,
          transform: `scale(${scale})`,
        }}
      />

      {/* 加载中旋转指示器 */}
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-muted-foreground/20 border-t-muted-foreground/60 rounded-full animate-spin" />
        </div>
      )}
    </div>
  )
}
