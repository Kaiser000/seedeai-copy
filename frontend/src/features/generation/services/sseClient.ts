import type { SseMessage } from '../types/sseMessages'

export interface SseCallbacks {
  onThinking?: (content: string) => void
  /** 联网搜索开始，content 为搜索关键词 */
  onSearchStart?: (keywords: string) => void
  /** 联网搜索完成，content 为 JSON 格式结果列表 */
  onSearchComplete?: (resultsJson: string) => void
  /** 需求分析阶段流式文本片段 */
  onAnalysisChunk?: (chunk: string) => void
  /** 需求分析阶段完成，content 为完整分析文本 */
  onAnalysisComplete?: (content: string) => void
  /** 页面布局完成，content 为 JSON 格式的元素列表 */
  onLayoutComplete?: (elementsJson: string) => void
  onCodeChunk?: (chunk: string) => void
  onCodeComplete?: (fullCode: string) => void
  onComplete?: (fullCode: string) => void
  onError?: (message: string, retryable: boolean) => void
  onImageAnalyzing?: (content: string) => void
  onImageGenerating?: (content: string) => void
  onImageComplete?: (content: string) => void
}

export function parseSseMessage(data: string): SseMessage | null {
  try {
    const parsed = JSON.parse(data)
    if (parsed.type && parsed.content !== undefined) {
      return parsed as SseMessage
    }
    return null
  } catch (err) {
    console.warn('[SSE] JSON parse failed:', { error: (err as Error).message, rawData: data.slice(0, 200) })
    return null
  }
}

export async function connectSse(
  url: string,
  body: Record<string, unknown>,
  callbacks: SseCallbacks,
  signal?: AbortSignal,
): Promise<string> {
  const codeBuffer: string[] = []

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)')
    console.error('[SSE] HTTP error:', { url, status: response.status, body: body.slice(0, 300) })
    throw new Error(`HTTP error: ${response.status}`)
  }

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''
  let lastCompleteCode = ''

  // 统一的消息分发逻辑，供主循环和 buffer 残留处理共用。
  // 返回值：complete 事件返回最终代码字符串，其它事件返回 undefined。
  const dispatchMessage = (message: SseMessage): string | undefined => {
    switch (message.type) {
      case 'thinking':
        callbacks.onThinking?.(message.content)
        break
      case 'search_start':
        callbacks.onSearchStart?.(message.content)
        break
      case 'search_complete':
        callbacks.onSearchComplete?.(message.content)
        break
      case 'analysis_chunk':
        callbacks.onAnalysisChunk?.(message.content)
        break
      case 'analysis_complete':
        callbacks.onAnalysisComplete?.(message.content)
        break
      case 'layout_complete':
        callbacks.onLayoutComplete?.(message.content)
        break
      case 'code_chunk':
        codeBuffer.push(message.content)
        callbacks.onCodeChunk?.(message.content)
        break
      case 'code_complete':
        lastCompleteCode = message.content
        callbacks.onCodeComplete?.(message.content)
        break
      case 'image_analyzing':
        callbacks.onImageAnalyzing?.(message.content)
        break
      case 'image_generating':
        callbacks.onImageGenerating?.(message.content)
        break
      case 'image_complete':
        callbacks.onImageComplete?.(message.content)
        break
      case 'complete':
        lastCompleteCode = message.content
        callbacks.onComplete?.(message.content)
        return message.content
      case 'error':
        callbacks.onError?.(message.content, message.retryable ?? true)
        break
    }
    return undefined
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue

      const data = trimmed.slice(5).trim()
      if (!data || data === '[DONE]') continue

      const message = parseSseMessage(data)
      if (!message) continue

      if (message.type === 'error') {
        dispatchMessage(message)
        reader.cancel()
        throw new Error(message.content)
      }

      const result = dispatchMessage(message)
      if (result !== undefined) {
        return result // complete 事件，返回最终代码
      }
    }
  }

  // 流结束后，检查 buffer 中是否有未处理的最后一行。
  // 当 SSE 最后一个事件没有尾部 \n 时，它会卡在 buffer 中不被处理，
  // 这会导致 complete 事件丢失，前端拿到的仍是 code_complete 的旧代码。
  if (buffer.trim()) {
    const trimmed = buffer.trim()
    if (trimmed.startsWith('data:')) {
      const data = trimmed.slice(5).trim()
      if (data && data !== '[DONE]') {
        const message = parseSseMessage(data)
        if (message) {
          console.log('[SSE] 处理 buffer 残留事件:', message.type)
          const result = dispatchMessage(message)
          if (result !== undefined) {
            return result
          }
        }
      }
    }
  }

  // 流异常结束且未收到 complete 事件，使用已收到的最佳代码
  const accumulated = lastCompleteCode || codeBuffer.join('')
  if (accumulated) {
    console.warn('[SSE] 流结束未收到 complete 事件，使用已有代码:', {
      url,
      codeLength: accumulated.length,
    })
    callbacks.onComplete?.(accumulated)
  }
  return accumulated
}
