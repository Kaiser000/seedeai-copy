import type { ApiResponse } from '@/shared/types/api'

class RequestError extends Error {
  code: number

  constructor(code: number, message: string) {
    super(message)
    this.code = code
    this.name = 'RequestError'
  }
}

export async function request<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '(unreadable)')
    console.error('[Request] HTTP error:', { url, status: response.status, body: body.slice(0, 300) })
    throw new RequestError(response.status, `HTTP error: ${response.status}`)
  }

  const result: ApiResponse<T> = await response.json()

  if (result.code !== 200) {
    console.error('[Request] API error:', { url, code: result.code, message: result.message })
    throw new RequestError(result.code, result.message)
  }

  return result.data
}

export { RequestError }
