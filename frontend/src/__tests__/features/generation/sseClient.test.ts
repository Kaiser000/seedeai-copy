import { describe, it, expect, vi, afterEach } from 'vitest'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const global: any
import { parseSseMessage, connectSse } from '@/features/generation/services/sseClient'

// ---------------------------------------------------------------------------
// parseSseMessage
// ---------------------------------------------------------------------------
describe('parseSseMessage', () => {
  it('parses thinking message', () => {
    const msg = parseSseMessage('{"type":"thinking","content":"正在分析设计需求..."}')
    expect(msg).toEqual({ type: 'thinking', content: '正在分析设计需求...' })
  })

  it('parses code_chunk message', () => {
    const msg = parseSseMessage('{"type":"code_chunk","content":"const colors = {"}')
    expect(msg).toEqual({ type: 'code_chunk', content: 'const colors = {' })
  })

  it('parses complete message', () => {
    const msg = parseSseMessage('{"type":"complete","content":"function Poster() { return <div>Hello</div> }"}')
    expect(msg).toEqual({
      type: 'complete',
      content: 'function Poster() { return <div>Hello</div> }',
    })
  })

  it('parses error message with retryable flag', () => {
    const msg = parseSseMessage('{"type":"error","content":"生成失败","retryable":true}')
    expect(msg).toEqual({ type: 'error', content: '生成失败', retryable: true })
  })

  it('returns null for invalid JSON', () => {
    const msg = parseSseMessage('not json')
    expect(msg).toBeNull()
  })

  it('returns null for JSON without type field', () => {
    const msg = parseSseMessage('{"content":"hello"}')
    expect(msg).toBeNull()
  })

  it('handles empty content', () => {
    const msg = parseSseMessage('{"type":"thinking","content":""}')
    expect(msg).toEqual({ type: 'thinking', content: '' })
  })
})

// ---------------------------------------------------------------------------
// connectSse helpers
// ---------------------------------------------------------------------------

/**
 * Build a mock fetch that streams the given SSE lines one by one.
 * Each entry in `lines` becomes a separate ReadableStream chunk.
 * Lines are prefixed with "data: " if they are not already prefixed.
 */
function buildMockFetch(sseLines: string[], status = 200) {
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    start(controller) {
      for (const line of sseLines) {
        controller.enqueue(encoder.encode(line + '\n'))
      }
      controller.close()
    },
  })

  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(`HTTP ${status}`),
    body: readable,
  })
}

// ---------------------------------------------------------------------------
// connectSse
// ---------------------------------------------------------------------------
describe('connectSse', () => {
  const originalFetch = global.fetch

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('throws on non-ok HTTP response', async () => {
    global.fetch = buildMockFetch([], 500)
    await expect(connectSse('/api/test', {}, {})).rejects.toThrow('HTTP error: 500')
  })

  it('invokes onThinking callback for thinking messages', async () => {
    const line = 'data: {"type":"thinking","content":"正在生成..."}'
    global.fetch = buildMockFetch([line])
    const onThinking = vi.fn()
    // Stream ends without complete — returns accumulated empty string
    await connectSse('/api/test', {}, { onThinking })
    expect(onThinking).toHaveBeenCalledWith('正在生成...')
  })

  it('invokes onCodeChunk and accumulates code for code_chunk messages', async () => {
    const lines = [
      'data: {"type":"code_chunk","content":"function "}',
      'data: {"type":"code_chunk","content":"Poster()"}',
      'data: {"type":"complete","content":"function Poster()"}',
    ]
    global.fetch = buildMockFetch(lines)
    const onCodeChunk = vi.fn()
    const onComplete = vi.fn()
    const result = await connectSse('/api/test', {}, { onCodeChunk, onComplete })
    expect(onCodeChunk).toHaveBeenCalledTimes(2)
    expect(onComplete).toHaveBeenCalledWith('function Poster()')
    expect(result).toBe('function Poster()')
  })

  it('returns early with complete message content', async () => {
    const lines = [
      'data: {"type":"complete","content":"const x = 1"}',
    ]
    global.fetch = buildMockFetch(lines)
    const result = await connectSse('/api/test', {}, {})
    expect(result).toBe('const x = 1')
  })

  it('invokes onError and throws when error message arrives', async () => {
    const lines = [
      'data: {"type":"error","content":"generation failed","retryable":true}',
    ]
    global.fetch = buildMockFetch(lines)
    const onError = vi.fn()
    await expect(connectSse('/api/test', {}, { onError })).rejects.toThrow('generation failed')
    expect(onError).toHaveBeenCalledWith('generation failed', true)
  })

  it('returns accumulated code when stream ends without complete message', async () => {
    const lines = [
      'data: {"type":"code_chunk","content":"partial "}',
      'data: {"type":"code_chunk","content":"code"}',
    ]
    global.fetch = buildMockFetch(lines)
    const onComplete = vi.fn()
    const result = await connectSse('/api/test', {}, { onComplete })
    expect(result).toBe('partial code')
    expect(onComplete).toHaveBeenCalledWith('partial code')
  })

  it('silently skips malformed / non-data SSE lines', async () => {
    const lines = [
      ': heartbeat',
      'data: {"type":"complete","content":"ok"}',
    ]
    global.fetch = buildMockFetch(lines)
    const result = await connectSse('/api/test', {}, {})
    expect(result).toBe('ok')
  })

  it('aborts via AbortSignal without throwing to caller', async () => {
    const controller = new AbortController()
    // Reject fetch with AbortError to simulate cancellation
    global.fetch = vi.fn().mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' }))
    controller.abort()
    await expect(connectSse('/api/test', {}, {}, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
