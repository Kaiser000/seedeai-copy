import { useRef, useCallback } from 'react'
import { useEditorStore } from '@/features/editor/stores/useEditorStore'
import type {
  LayoutElement,
  RagCriteria,
  RagSample,
  PromptBuiltInfo,
  GeneratedImage,
} from '@/features/editor/stores/useEditorStore'
import { connectSse } from '../services/sseClient'

// 转义正则元字符，防止 attrName 中包含特殊字符时造成正则注入或解析异常
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function extractAttr(tag: string, attrName: string): string | null {
  const name = escapeRegex(attrName)
  const doubleQuote = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i')
  const m1 = tag.match(doubleQuote)
  if (m1?.[1]) return m1[1]
  const singleQuote = new RegExp(`${name}\\s*=\\s*'([^']*)'`, 'i')
  const m2 = tag.match(singleQuote)
  if (m2?.[1]) return m2[1]
  return null
}

function replaceImgSrc(tag: string, nextSrc: string): string {
  if (/src\s*=\s*"[^"]*"/i.test(tag)) {
    return tag.replace(/src\s*=\s*"[^"]*"/i, `src="${nextSrc}"`)
  }
  if (/src\s*=\s*'[^']*'/i.test(tag)) {
    return tag.replace(/src\s*=\s*'[^']*'/i, `src='${nextSrc}'`)
  }
  return tag
}

function replaceByOrderFallback(code: string, images: GeneratedImage[]): { code: string; replacedCount: number } {
  const allMatches = [...code.matchAll(/https:\/\/picsum\.photos\/seed\/[^/]+\/\d+\/\d+/g)]
  const uniqueUrls = [...new Set(allMatches.map((m) => m[0]))]
  if (uniqueUrls.length === 0) return { code, replacedCount: 0 }

  const sortedImages = [...images]
    .filter((img) => !!img.url)
    .sort((a, b) => a.index - b.index)

  let nextCode = code
  let replacedCount = 0
  for (let i = 0; i < uniqueUrls.length && i < sortedImages.length; i++) {
    const proxyUrl = `/api/proxy/image?url=${encodeURIComponent(sortedImages[i].url)}`
    nextCode = nextCode.replaceAll(uniqueUrls[i], proxyUrl)
    replacedCount += 1
  }
  return { code: nextCode, replacedCount }
}

/**
 * 统一的图片替换入口：先按 imageId 精确替换，再对仍残留的占位图走顺序兜底。
 *
 * 处理三种场景：
 *   1. 所有图片都有 imageId → 一次命中，无需兜底
 *   2. 所有图片都无 imageId（旧版 LLM 产物）→ id 阶段命中 0，整体走顺序兜底
 *   3. 混合：部分有 id 部分没有 → id 命中部分图片后，用剩余未匹配的图片按顺序补充替换
 *
 * 混合场景下会输出 warn 日志，便于排查生成质量问题。
 */
function replaceImagesInCode(
  code: string,
  images: GeneratedImage[],
): { code: string; replacedCount: number } {
  // 步骤 1：按 imageId 精确替换
  const imageMap = new Map<string, string>()
  for (const image of images) {
    if (!image.imageId || !image.url) continue
    imageMap.set(image.imageId, `/api/proxy/image?url=${encodeURIComponent(image.url)}`)
  }

  const matchedIds = new Set<string>()
  let idReplacedCount = 0
  const afterIdReplace = imageMap.size === 0
    ? code
    : code.replace(/<img\b[^>]*>/gi, (tag) => {
        const imageId = extractAttr(tag, 'data-seede-image-id')
        if (!imageId) return tag
        const nextSrc = imageMap.get(imageId)
        if (!nextSrc) return tag
        matchedIds.add(imageId)
        idReplacedCount += 1
        return replaceImgSrc(tag, nextSrc)
      })

  // 步骤 2：检查是否仍有占位图残留，如有则用未匹配的图片按顺序补齐
  const stillHasPicsum = /https:\/\/picsum\.photos\/seed\//.test(afterIdReplace)
  if (!stillHasPicsum) {
    return { code: afterIdReplace, replacedCount: idReplacedCount }
  }

  const remainingImages = images.filter(
    (img) => !img.imageId || !matchedIds.has(img.imageId),
  )
  if (remainingImages.length === 0) {
    // 还有占位图但没有可用图片——可能是 LLM 产出的 <img> 数量多于实际生成的图片
    if (idReplacedCount > 0) {
      console.warn(
        '[Generate] 图片替换后仍有占位图残留，但无剩余可用图片，可能 LLM 生成的 <img> 数量超过实际图片数',
      )
    }
    return { code: afterIdReplace, replacedCount: idReplacedCount }
  }

  const fallback = replaceByOrderFallback(afterIdReplace, remainingImages)
  if (idReplacedCount > 0 && fallback.replacedCount > 0) {
    console.warn(
      '[Generate] 混合图片场景兜底：按 id 替换',
      idReplacedCount,
      '张，按顺序补充',
      fallback.replacedCount,
      '张（建议检查 LLM 是否为所有 <img> 都输出了 data-seede-image-id）',
    )
  }
  return {
    code: fallback.code,
    replacedCount: idReplacedCount + fallback.replacedCount,
  }
}

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
    selectedModel,
    setIsGenerating,
    addSseMessage,
    setGeneratedCode,
    setError,
    addChatMessage,
    updateWorkflowStage,
    appendAccumulatedCode,
    appendAnalysisContent,
    addStageDetail,
    addStageImage,
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
        { prompt, width: posterSize.width, height: posterSize.height, modelName: selectedModel || undefined },
        {
          // ── 阶段 0：联网搜索 ──────────────────────────────────
          onSearchStart: (keywords) => {
            addSseMessage({ type: 'search_start', content: keywords })
            updateWorkflowStage('search', {
              status: 'active',
              summary: `搜索"${keywords}"...`,
            })
          },

          onSearchComplete: (resultsJson) => {
            addSseMessage({ type: 'search_complete', content: resultsJson })
            try {
              const results = JSON.parse(resultsJson)
              const count = Array.isArray(results) ? results.length : 0
              updateWorkflowStage('search', {
                status: 'complete',
                summary: count > 0 ? `找到 ${count} 条参考资料` : '无搜索结果',
                details: Array.isArray(results)
                  ? results.map((r: { title?: string }) => r.title || '').filter(Boolean)
                  : [],
              })
            } catch {
              updateWorkflowStage('search', {
                status: 'complete',
                summary: '搜索完成',
              })
            }
          },

          // ── 阶段 1：需求分析 ──────────────────────────────────
          onThinking: (content) => {
            addSseMessage({ type: 'thinking', content })

            // 如果搜索阶段还是 pending（后端未配置搜索 API），标记为跳过
            const searchStage = useEditorStore.getState().workflowStages.find((s) => s.id === 'search')
            if (searchStage && searchStage.status === 'pending') {
              updateWorkflowStage('search', { status: 'complete', summary: '跳过' })
            }

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
            // layout 完成后，立即把 RAG 阶段标记为 active（后端马上会推 rag_retrieving）
            updateWorkflowStage('rag', { status: 'active', summary: '检索同类样本...' })
          },

          // ── 阶段 RAG-1：参考样本检索开始 ──────────────────
          onRagRetrieving: (criteriaJson) => {
            addSseMessage({ type: 'rag_retrieving', content: criteriaJson })
            try {
              const criteria: RagCriteria = JSON.parse(criteriaJson)
              const summaryParts: string[] = []
              if (criteria.category) summaryParts.push(criteria.category)
              if (criteria.emotion) summaryParts.push(criteria.emotion)
              if (criteria.format) summaryParts.push(criteria.format)
              const summary = criteria.fallback
                ? `兜底检索：${criteria.fallbackScene || '-'} / ${criteria.fallbackEmotion || '-'}`
                : summaryParts.length > 0
                  ? `检索条件：${summaryParts.join(' · ')}`
                  : '正在检索...'
              updateWorkflowStage('rag', {
                status: 'active',
                summary,
                ragCriteria: criteria,
              })
            } catch (parseErr) {
              console.warn('[Generate] rag_retrieving JSON 解析失败:', parseErr)
              updateWorkflowStage('rag', { status: 'active', summary: '正在检索...' })
            }
          },

          // ── 阶段 RAG-2：参考样本检索完成 ──────────────────
          onRagComplete: (samplesJson) => {
            addSseMessage({ type: 'rag_complete', content: samplesJson })
            try {
              const parsed = JSON.parse(samplesJson) as { samples: RagSample[]; totalSampleChars?: number; error?: string }
              const samples = parsed.samples || []
              const summary = samples.length > 0
                ? `命中 ${samples.length} 个样本（${parsed.totalSampleChars || 0} 字符注入）`
                : (parsed.error ? `检索失败：${parsed.error}` : '未找到相似样本')
              updateWorkflowStage('rag', {
                status: samples.length > 0 ? 'complete' : 'complete', // 即使 0 条也算完成
                summary,
                ragSamples: samples,
              })
            } catch (parseErr) {
              console.warn('[Generate] rag_complete JSON 解析失败:', parseErr)
              updateWorkflowStage('rag', { status: 'complete', summary: '检索完成' })
            }
          },

          // ── 阶段 RAG-3：enriched prompt 拼装完成 ──────────
          onPromptBuilt: (infoJson) => {
            addSseMessage({ type: 'prompt_built', content: infoJson })
            try {
              const info: PromptBuiltInfo = JSON.parse(infoJson)
              updateWorkflowStage('code_gen', {
                status: 'active',
                summary: `Prompt ${info.totalChars} 字符（含 ${info.sampleTotalChars} 字符样本骨架）`,
                promptInfo: info,
                codeCharCount: 0,
              })
            } catch (parseErr) {
              console.warn('[Generate] prompt_built JSON 解析失败:', parseErr)
              updateWorkflowStage('code_gen', { status: 'active', summary: 'Prompt 已构建' })
            }
          },

          // ── 阶段 2：代码生成（设计合成阶段） ──────────────────
          onCodeChunk: (chunk) => {
            addSseMessage({ type: 'code_chunk', content: chunk })
            appendAccumulatedCode(chunk)

            // 首个代码片段到达时，将设计合成阶段标记为 active
            const composeStage = useEditorStore.getState().workflowStages.find((s) => s.id === 'compose')
            if (composeStage && composeStage.status === 'pending') {
              updateWorkflowStage('compose', { status: 'active', summary: '代码生成中...' })
            }

            // 持续累计 code_gen 阶段已接收的字符数，用于 UI 展示进度
            const codeGenStage = useEditorStore.getState().workflowStages.find((s) => s.id === 'code_gen')
            if (codeGenStage) {
              const next = (codeGenStage.codeCharCount || 0) + chunk.length
              updateWorkflowStage('code_gen', {
                status: codeGenStage.status === 'pending' ? 'active' : codeGenStage.status,
                codeCharCount: next,
                summary: `已生成 ${next} 字符 JSX`,
              })
            }
          },

          // 代码生成完成（后续还有图片生成阶段）
          onCodeComplete: (code) => {
            addSseMessage({ type: 'code_complete', content: code })
            // 用占位图先预览
            setGeneratedCode(code)
            // 标记 code_gen 阶段完成
            updateWorkflowStage('code_gen', {
              status: 'complete',
              summary: `代码生成完成 (${code.length} 字符)`,
            })
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
                // 保存图片信息，供工作流 UI 预览展示
                addStageImage('image_gen', {
                  index: info.index,
                  imageId: info.imageId || undefined,
                  prompt: info.prompt || '',
                  url: info.url,
                })

                // 主动嵌入：每张图片生成后立即替换海报代码中对应的占位图 URL。
                // 不再依赖 complete 事件（该事件在 SSE 传输中可能丢失或被截断），
                // 而是在 image_complete 时就将图片嵌入，让用户实时看到图片出现在海报上。
                const currentCode = useEditorStore.getState().generatedCode
                if (currentCode && /https:\/\/picsum\.photos\/seed\//.test(currentCode)) {
                  const allImages = useEditorStore.getState().workflowStages
                    .find((s) => s.id === 'image_gen')?.images || []
                  if (allImages.length > 0) {
                    const { code: updatedCode, replacedCount } = replaceImagesInCode(
                      currentCode,
                      allImages,
                    )

                    if (updatedCode !== currentCode) {
                      console.log(
                        '[Generate] 主动嵌入图片到海报，已替换',
                        replacedCount,
                        '张',
                      )
                      setGeneratedCode(updatedCode)
                    }
                  }
                }
              } else if (info.error) {
                addStageDetail('image_gen', `图片 ${info.index + 1} 生成失败: ${info.error}`)
              }
            } catch (parseErr) {
              console.warn('[Generate] image_complete JSON 解析失败:', parseErr)
            }
          },

          // ── 阶段 4：设计合成（全部完成） ──────────────────────
          onComplete: (code) => {
            // 优先使用已通过 image_complete 主动嵌入的代码（包含 proxy URLs），
            // 因为 complete 事件可能在 SSE 传输中丢失内容或仍包含占位图。
            // 只有当 complete 事件的代码已包含 proxy URLs（后端替换成功）时才使用它。
            const currentCode = useEditorStore.getState().generatedCode
            const completeHasPicsum = /https:\/\/picsum\.photos\/seed\//.test(code)
            const currentHasProxy = /\/api\/proxy\/image\?url=/.test(currentCode)

            let finalCode: string
            if (!completeHasPicsum) {
              // 后端替换成功，complete 代码已包含 proxy URLs → 使用 complete 代码
              finalCode = code
              console.log('[Generate] complete 事件已包含 proxy URLs（后端替换成功）')
            } else if (currentHasProxy) {
              // complete 代码仍是占位图，但当前代码已被主动嵌入替换过 → 使用当前代码
              finalCode = currentCode
              console.log('[Generate] 使用已主动嵌入的代码（complete 事件仍含占位图）')
            } else {
              // 兜底：complete 代码仍含占位图，当前代码也没有替换过 → 客户端手动替换
              finalCode = code
              const imageGenStage = useEditorStore.getState().workflowStages.find(
                (s) => s.id === 'image_gen',
              )
              const images = imageGenStage?.images || []
              if (images.length > 0) {
                console.warn(
                  '[Generate] 兜底替换：complete 和当前代码均含占位图，图片数:',
                  images.length,
                )
                const { code: replaced, replacedCount } = replaceImagesInCode(
                  finalCode,
                  images,
                )
                finalCode = replaced
                console.log(
                  '[Generate] 兜底替换完成，处理了',
                  replacedCount,
                  '张图片',
                )
              }
            }

            addSseMessage({ type: 'complete', content: finalCode })
            setGeneratedCode(finalCode)

            // code_gen 阶段如果未结束（无图片生成路径），在此一并 mark 完成
            const codeGenStage = useEditorStore.getState().workflowStages.find((s) => s.id === 'code_gen')
            if (codeGenStage && codeGenStage.status !== 'complete') {
              updateWorkflowStage('code_gen', {
                status: 'complete',
                summary: `代码生成完成 (${finalCode.length} 字符)`,
              })
            }

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
    prompt, posterSize, selectedModel, setIsGenerating, addSseMessage, setGeneratedCode,
    setError, addChatMessage, updateWorkflowStage, appendAccumulatedCode,
    appendAnalysisContent, addStageDetail, addStageImage, failActiveStages,
  ])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setIsGenerating(false)
  }, [setIsGenerating])

  return { generate, cancel }
}
