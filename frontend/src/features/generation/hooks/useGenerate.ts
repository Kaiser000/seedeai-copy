import { useRef, useCallback } from 'react'
import { useEditorStore } from '@/features/editor/stores/useEditorStore'
import type { LayoutElement } from '@/features/editor/stores/useEditorStore'
import { connectSse } from '../services/sseClient'

/**
 * 海报生成 hook — 连接 SSE 并驱动多阶段工作流。
 *
 * 后端现在是真正的多阶段 Pipeline（两次 LLM 调用）：
 *   1. 需求分析 LLM 调用 → thinking → analysis_chunk* → analysis_complete → layout_complete
 *   2. 代码生成 LLM 调用 → code_chunk* → code_complete（有图片时）或 complete（无图片时）
 *   3. 图片生成（可选） → image_analyzing → image_generating* → image_complete*
 *   4. 最终完成 → complete
 *
 * 每个 SSE 事件更新对应的工作流阶段状态，前端实时展示进度。
 */
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
    updateWorkflowStage,
    appendAccumulatedCode,
    appendAnalysisContent,
    addStageDetail,
    failActiveStages,
  } = useEditorStore()

  const generate = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsGenerating(true)
    setError(null)

    try {
      const fullCode = await connectSse(
        '/api/posters/generate',
        { prompt, width: posterSize.width, height: posterSize.height },
        {
          // ── 阶段 1：需求分析 ──────────────────────────────────
          onThinking: (content) => {
            addSseMessage({ type: 'thinking', content })
            // 需求分析阶段开始
            updateWorkflowStage('analysis', {
              status: 'active',
              summary: content,
            })
          },

          // 分析文本流式输出
          onAnalysisChunk: (chunk) => {
            addSseMessage({ type: 'analysis_chunk', content: chunk })
            appendAnalysisContent(chunk)
          },

          // 需求分析完成
          onAnalysisComplete: (content) => {
            addSseMessage({ type: 'analysis_complete', content })
            updateWorkflowStage('analysis', {
              status: 'complete',
              summary: '需求分析完成',
            })
          },

          // 页面布局完成（后端解析出的元素列表）
          onLayoutComplete: (elementsJson) => {
            addSseMessage({ type: 'layout_complete', content: elementsJson })
            try {
              const parsed = JSON.parse(elementsJson)
              const elements: LayoutElement[] = parsed.elements || []
              updateWorkflowStage('layout', {
                status: 'complete',
                summary: `${elements.length} 个元素`,
                elements,
              })
            } catch (parseErr) {
              console.warn('[Generate] layout_complete JSON 解析失败:', parseErr)
              updateWorkflowStage('layout', {
                status: 'complete',
                summary: '布局解析完成',
              })
            }
          },

          // ── 阶段 2：代码生成 ──────────────────────────────────
          onCodeChunk: (chunk) => {
            addSseMessage({ type: 'code_chunk', content: chunk })
            appendAccumulatedCode(chunk)
          },

          // 代码生成完成（后续还有图片生成阶段）
          onCodeComplete: (code) => {
            addSseMessage({ type: 'code_complete', content: code })
            // 用占位图先预览
            setGeneratedCode(code)
          },

          // ── 阶段 3：图片生成 ──────────────────────────────────
          onImageAnalyzing: (content) => {
            addSseMessage({ type: 'image_analyzing', content })
            updateWorkflowStage('image_gen', {
              status: 'active',
              summary: content,
            })
            addStageDetail('image_gen', content)
          },

          onImageGenerating: (content) => {
            addSseMessage({ type: 'image_generating', content })
            updateWorkflowStage('image_gen', { summary: content })
            addStageDetail('image_gen', content)
          },

          onImageComplete: (content) => {
            addSseMessage({ type: 'image_complete', content })
            try {
              const info = JSON.parse(content)
              if (info.url) {
                addStageDetail('image_gen', `图片 ${info.index + 1} 生成完成`)
              }
            } catch (parseErr) {
              console.warn('[Generate] image_complete JSON 解析失败:', parseErr)
            }
          },

          // ── 阶段 4：设计合成（全部完成） ──────────────────────
          onComplete: (code) => {
            addSseMessage({ type: 'complete', content: code })
            setGeneratedCode(code)

            // 图片生成阶段完成（如果曾激活）
            updateWorkflowStage('image_gen', { status: 'complete' })

            // 设计合成完成
            updateWorkflowStage('compose', {
              status: 'complete',
              summary: '海报生成完成',
            })

            // 添加助手消息到对话历史（供后续 chat API 使用）
            addChatMessage({
              role: 'assistant',
              content: '已为您生成海报设计',
              timestamp: Date.now(),
            })
          },

          // ── 错误处理 ──────────────────────────────────────────
          onError: (message) => {
            addSseMessage({ type: 'error', content: message, retryable: true })
            setError(message)
            failActiveStages(message)
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
        failActiveStages(message)
      }
      return null
    } finally {
      setIsGenerating(false)
    }
  }, [
    prompt, posterSize, setIsGenerating, addSseMessage, setGeneratedCode,
    setError, addChatMessage, updateWorkflowStage, appendAccumulatedCode,
    appendAnalysisContent, addStageDetail, failActiveStages,
  ])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setIsGenerating(false)
  }, [setIsGenerating])

  return { generate, cancel }
}
