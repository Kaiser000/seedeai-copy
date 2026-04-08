export interface SseMessage {
  type:
    | 'thinking'
    | 'analysis_chunk'
    | 'analysis_complete'
    | 'layout_complete'
    | 'code_chunk'
    | 'code_complete'
    | 'complete'
    | 'error'
    | 'image_analyzing'
    | 'image_generating'
    | 'image_complete'
  content: string
  retryable?: boolean
}
