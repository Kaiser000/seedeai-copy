export interface SseMessage {
  type:
    | 'thinking'
    | 'search_start'
    | 'search_complete'
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
