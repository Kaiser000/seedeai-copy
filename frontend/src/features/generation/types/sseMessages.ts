export interface SseMessage {
  type:
    | 'thinking'
    | 'search_start'
    | 'search_complete'
    | 'analysis_chunk'
    | 'analysis_complete'
    | 'layout_complete'
    | 'rag_retrieving'
    | 'rag_complete'
    | 'prompt_built'
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
