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

/**
 * 清理 LLM 输出中的 markdown 代码块格式和前缀文本。
 *
 * LLM 有时会在 JSX 外面包裹 ```jsx ... ``` 或添加说明性文字，
 * 这些内容会导致 Babel 编译失败（反引号不是合法 JS）。
 */
function stripCodeFences(code: string): string {
  let cleaned = code.trim()

  // 去除开头的 markdown 代码块标记：```jsx、```tsx、```html、```javascript 等
  cleaned = cleaned.replace(/^```(?:jsx|tsx|javascript|js|html|react)?\s*\n?/, '')
  // 去除结尾的 markdown 代码块标记
  cleaned = cleaned.replace(/\n?```\s*$/, '')

  // 去除开头可能的非代码文本（LLM 有时加说明），定位到 function 或 const 声明
  const funcStart = cleaned.search(/^(function |const |export )/m)
  if (funcStart > 0) {
    cleaned = cleaned.substring(funcStart)
  }

  return cleaned.trim()
}

export async function compileJsx(jsxCode: string): Promise<string> {
  const babel = await loadBabel()
  // 清理 LLM 输出中可能的 markdown 代码块格式
  const cleanedCode = stripCodeFences(jsxCode)
  try {
    // 必须使用 classic runtime（React.createElement）而非 automatic（jsx-runtime）。
    // automatic runtime 编译后会生成 require("react/jsx-runtime")，
    // 在 new Function 执行上下文中 require 不可用，导致运行时错误。
    const result = babel.transform(cleanedCode, {
      presets: [['react', { runtime: 'classic' }]],
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
