/**
 * jsxCompiler.ts — LLM 生成的 JSX 代码编译和渲染服务。
 *
 * 流程：JSX 字符串 → Babel 编译为 JS → new Function 创建组件 → ReactDOM 渲染到 hidden DOM
 *
 * 关键点：使用 flushSync 确保 React 18 的 createRoot.render() 同步完成，
 * 否则后续读取 getBoundingClientRect() 会拿到空 DOM。
 */
import { flushSync } from 'react-dom'

let babelInstance: typeof import('@babel/standalone') | null = null

async function loadBabel() {
  if (babelInstance) return babelInstance
  babelInstance = await import('@babel/standalone')
  return babelInstance
}

export async function compileJsx(jsxCode: string): Promise<string> {
  const babel = await loadBabel()
  try {
    const result = babel.transform(jsxCode, {
      presets: ['react'],
      filename: 'poster.jsx',
    })
    if (!result.code) {
      console.error('[JSX Compiler] Babel 返回空结果:', { codeLength: jsxCode.length, snippet: jsxCode.slice(0, 100) })
      throw new Error('Babel compilation returned empty result')
    }
    return result.code
  } catch (err) {
    console.error('[JSX Compiler] 编译失败:', {
      error: (err as Error).message,
      codeLength: jsxCode.length,
      snippet: jsxCode.slice(0, 100),
    })
    throw err
  }
}

export function renderToHiddenDom(
  compiledJs: string,
  container: HTMLDivElement,
  React: typeof import('react'),
  ReactDOM: typeof import('react-dom/client'),
): void {
  // 将 React 挂到全局，编译后的 JSX 代码通过 new Function 执行时需要它
  const win = window as unknown as Record<string, unknown>
  win.React = React

  try {
    // 执行编译后的 JS，获取 Poster 函数组件
    const factory = new Function('React', compiledJs + '\nreturn Poster;')
    const PosterComponent = factory(React)

    // 使用 React 18 createRoot 渲染。
    // 关键：flushSync 确保 render 同步完成，DOM 立即可用。
    // 不使用 flushSync 时，render() 是异步的（React 18 行为变更），
    // 导致后续 querySelectorAll('img') 和 getBoundingClientRect() 拿到空/旧 DOM。
    const root = ReactDOM.createRoot(container)
    flushSync(() => {
      root.render(React.createElement(PosterComponent))
    })

    console.log('[JSX Render] DOM 同步渲染完成，子元素数:', container.children.length)
  } catch (err) {
    console.error('[JSX Render] 组件渲染失败:', {
      error: (err as Error).message,
      containerDimensions: `${container.offsetWidth}x${container.offsetHeight}`,
    })
    throw err
  }
}
