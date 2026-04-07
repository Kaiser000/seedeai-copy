import { useEffect, useRef } from 'react'
import { useEditorStore } from '@/features/editor/stores/useEditorStore'

export function StreamPanel() {
  const sseMessages = useEditorStore((s) => s.sseMessages)
  const isGenerating = useEditorStore((s) => s.isGenerating)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [sseMessages])

  const codeChunks = sseMessages
    .filter((m) => m.type === 'code_chunk')
    .map((m) => m.content)
    .join('')

  const thinkingMessage = sseMessages.find((m) => m.type === 'thinking')

  return (
    <div ref={scrollRef} className="h-full overflow-auto p-4 bg-muted/30 font-mono text-sm">
      {thinkingMessage && (
        <div className="text-muted-foreground mb-2 italic">
          {thinkingMessage.content}
        </div>
      )}
      {codeChunks && (
        <pre className="whitespace-pre-wrap break-words text-foreground">
          {codeChunks}
        </pre>
      )}
      {isGenerating && !codeChunks && !thinkingMessage && (
        <div className="text-muted-foreground">等待生成...</div>
      )}
      {!isGenerating && !codeChunks && !thinkingMessage && (
        <div className="text-muted-foreground">等待生成海报代码...</div>
      )}
    </div>
  )
}
