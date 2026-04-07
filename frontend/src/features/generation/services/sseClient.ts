import type { SseMessage } from '../types/sseMessages'

export interface SseCallbacks {
  onThinking?: (content: string) => void
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

      switch (message.type) {
        case 'thinking':
          callbacks.onThinking?.(message.content)
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
          reader.cancel()
          throw new Error(message.content)
      }
    }
  }

  // If we reach here without a complete message, stream ended unexpectedly
  const accumulated = lastCompleteCode || codeBuffer.join('')
  if (accumulated) {
    console.warn('[SSE] Stream ended without complete message, using accumulated code:', {
      url,
      codeLength: accumulated.length,
    })
    callbacks.onComplete?.(accumulated)
  }
  return accumulated
}
