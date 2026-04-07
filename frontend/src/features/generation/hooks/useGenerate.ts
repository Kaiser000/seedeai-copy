import { useRef, useCallback } from 'react'
import { useEditorStore } from '@/features/editor/stores/useEditorStore'
import { connectSse } from '../services/sseClient'

export function useGenerate() {
  const abortRef = useRef<AbortController | null>(null)
  const {
    prompt,
    posterSize,
    setIsGenerating,
    addSseMessage,
    setGeneratedCode,
    setError,
    addChatMessage,
  } = useEditorStore()

  const generate = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsGenerating(true)
    setError(null)

    // 用户消息已在 startGeneration() 中追加，此处不重复添加

    // 确保 thinking 消息只追加一次到对话记录
    let thinkingAdded = false

    try {
      const fullCode = await connectSse(
        '/api/posters/generate',
        { prompt, width: posterSize.width, height: posterSize.height },
        {
          onThinking: (content) => {
            addSseMessage({ type: 'thinking', content })
            if (!thinkingAdded) {
              thinkingAdded = true
              addChatMessage({
                role: 'assistant',
                content,
                timestamp: Date.now(),
                msgType: 'thinking',
              })
            }
          },
          onCodeChunk: (chunk) =>
            addSseMessage({ type: 'code_chunk', content: chunk }),
          onCodeComplete: (code) => {
            addSseMessage({ type: 'code_complete', content: code })
            // 步骤 3：代码生成完成，先用占位图预览
            setGeneratedCode(code)
            addChatMessage({
              role: 'assistant',
              content: '代码生成完成，正在生成海报图片...',
              timestamp: Date.now(),
              msgType: 'code_complete',
            })
          },
          onImageAnalyzing: (content) => {
            addSseMessage({ type: 'image_analyzing', content })
            // 步骤 4：图片需求分析
            addChatMessage({
              role: 'assistant',
              content,
              timestamp: Date.now(),
              msgType: 'image_progress',
            })
          },
          onImageGenerating: (content) => {
            addSseMessage({ type: 'image_generating', content })
            // 步骤 5：逐张图片生成进度
            addChatMessage({
              role: 'assistant',
              content,
              timestamp: Date.now(),
              msgType: 'image_progress',
            })
          },
          onImageComplete: (content) => {
            addSseMessage({ type: 'image_complete', content })
            try {
              const info = JSON.parse(content)
              if (info.url) {
                addChatMessage({
                  role: 'assistant',
                  content: `图片 ${info.index + 1} 生成完成`,
                  timestamp: Date.now(),
                  msgType: 'image_progress',
                })
              }
            } catch {
              // ignore parse errors
            }
          },
          onComplete: (code) => {
            addSseMessage({ type: 'complete', content: code })
            setGeneratedCode(code)
            // 步骤 6：全部完成
            addChatMessage({
              role: 'assistant',
              content: '海报生成完成 ✓',
              timestamp: Date.now(),
              msgType: 'complete',
            })
          },
          onError: (message) => {
            addSseMessage({ type: 'error', content: message, retryable: true })
            setError(message)
            addChatMessage({
              role: 'assistant',
              content: `生成失败：${message}`,
              timestamp: Date.now(),
              msgType: 'error',
            })
          },
        },
        controller.signal,
      )
      return fullCode
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        const message = (err as Error).message || '生成失败，请稍后重试'
        console.error('[Generate] Generation failed:', {
          error: message,
          stack: (err as Error).stack,
        })
        setError(message)
      }
      return null
    } finally {
      setIsGenerating(false)
    }
  }, [prompt, posterSize, setIsGenerating, addSseMessage, setGeneratedCode, setError, addChatMessage])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setIsGenerating(false)
  }, [setIsGenerating])

  return { generate, cancel }
}
