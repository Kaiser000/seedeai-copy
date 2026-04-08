import { useEffect, useRef } from 'react'
import { useEditorStore } from '@/features/editor/stores/useEditorStore'

/**
 * StreamPanel — 左侧"代码"面板，实时显示 LLM 流式输出的 JSX 代码。
 *
 * 使用深色代码块样式，模仿编辑器体验：
 * - 深色背景 + 等宽字体
 * - 行号显示
 * - 自动滚动跟随
 */
export function StreamPanel() {
  const sseMessages = useEditorStore((s) => s.sseMessages)
  const isGenerating = useEditorStore((s) => s.isGenerating)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 新内容到达时自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [sseMessages])

  // 拼接所有 code_chunk 消息
  const codeChunks = sseMessages
    .filter((m) => m.type === 'code_chunk')
    .map((m) => m.content)
    .join('')

  const thinkingMessage = sseMessages.find((m) => m.type === 'thinking')

  // 将代码按行拆分，用于行号渲染
  const codeLines = codeChunks ? codeChunks.split('\n') : []

  return (
    <div ref={scrollRef} className="h-full overflow-auto flex flex-col">
      {/* 思考阶段提示 */}
      {thinkingMessage && (
        <div className="text-[11px] text-gray-400 italic px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
          {thinkingMessage.content}
        </div>
      )}

      {/* 代码块区域 */}
      {codeLines.length > 0 && (
        <div className="flex-1 bg-[#1e1e2e] text-[11px] leading-[1.6] font-mono overflow-auto">
          {/* 语言标签 */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-3 py-1 bg-[#181825] border-b border-[#313244] text-[10px]">
            <span className="text-[#a6adc8]">JSX</span>
            {isGenerating && (
              <span className="text-[#89b4fa] animate-pulse">streaming...</span>
            )}
          </div>
          {/* 代码内容 + 行号 */}
          <div className="flex">
            {/* 行号列 */}
            <div className="flex-shrink-0 py-2 pl-2 pr-1 text-right select-none border-r border-[#313244] bg-[#181825]">
              {codeLines.map((_, i) => (
                <div key={i} className="text-[#585b70] text-[10px] leading-[1.6]">
                  {i + 1}
                </div>
              ))}
            </div>
            {/* 代码区 */}
            <pre className="flex-1 py-2 px-3 overflow-x-auto whitespace-pre text-[#cdd6f4]">
              {codeLines.map((line, i) => (
                <div key={i} className="leading-[1.6]">
                  {line || '\u00A0'}
                </div>
              ))}
            </pre>
          </div>
        </div>
      )}

      {/* 等待状态 */}
      {isGenerating && !codeChunks && !thinkingMessage && (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
          等待生成...
        </div>
      )}
      {!isGenerating && !codeChunks && !thinkingMessage && (
        <div className="flex-1 flex items-center justify-center text-xs text-gray-400">
          等待生成海报代码...
        </div>
      )}
    </div>
  )
}
