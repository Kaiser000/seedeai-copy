/**
 * EditorStore — single Zustand store for the entire poster editor session.
 *
 * Generation lifecycle:
 *   idle → startGeneration() sets isGenerating=true, resets sseMessages/generatedCode/error
 *        → SSE chunks arrive via addSseMessage()
 *        → complete event → setGeneratedCode(code), isGenerating=false (via useGenerate)
 *        OR error event  → setError(msg), isGenerating=false
 *
 * Canvas editing state (selectedElementId) is independent of the
 * generation lifecycle. chatHistory is reset by startGeneration to
 * show a fresh workflow for each new generation session.
 */
import { create } from 'zustand'
import type { PosterSize } from '@/features/input/components/SizeSelector'

type Page = 'input' | 'editor'

export interface SseMessage {
  type:
    | 'thinking'
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

export type ChatMessageType =
  | 'message'
  | 'thinking'
  | 'code_complete'
  | 'image_progress'
  | 'complete'
  | 'error'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  msgType?: ChatMessageType
}

interface EditorState {
  // Page navigation
  currentPage: Page
  setCurrentPage: (page: Page) => void

  // Generation input
  prompt: string
  posterSize: PosterSize
  setPrompt: (prompt: string) => void
  setPosterSize: (size: PosterSize) => void
  startGeneration: (prompt: string, posterSize: PosterSize) => void

  // SSE streaming
  isGenerating: boolean
  sseMessages: SseMessage[]
  generatedCode: string
  setIsGenerating: (generating: boolean) => void
  addSseMessage: (message: SseMessage) => void
  setGeneratedCode: (code: string) => void
  clearSseMessages: () => void

  // Canvas state
  selectedElementId: string | null
  selectElement: (id: string | null) => void
  clearSelection: () => void

  // Chat history
  chatHistory: ChatMessage[]
  addChatMessage: (msg: ChatMessage) => void
  clearChatHistory: () => void

  // Error state
  error: string | null
  setError: (error: string | null) => void
}

export const useEditorStore = create<EditorState>()((set) => ({
  currentPage: 'input',
  setCurrentPage: (page) => set({ currentPage: page }),

  prompt: '',
  posterSize: { width: 1080, height: 1920, label: '1080×1920 竖版海报' },
  setPrompt: (prompt) => set({ prompt }),
  setPosterSize: (size) => set({ posterSize: size }),
  startGeneration: (prompt, posterSize) =>
    set({
      prompt,
      posterSize,
      currentPage: 'editor',
      isGenerating: true,
      sseMessages: [],
      generatedCode: '',
      error: null,
      chatHistory: [
        { role: 'user', content: prompt, timestamp: Date.now(), msgType: 'message' as ChatMessageType },
      ],
    }),

  isGenerating: false,
  sseMessages: [],
  generatedCode: '',
  setIsGenerating: (generating) => set({ isGenerating: generating }),
  addSseMessage: (message) =>
    set((state) => ({ sseMessages: [...state.sseMessages, message] })),
  setGeneratedCode: (code) => set({ generatedCode: code }),
  clearSseMessages: () => set({ sseMessages: [] }),

  selectedElementId: null,
  selectElement: (id) => set({ selectedElementId: id }),
  clearSelection: () => set({ selectedElementId: null }),

  chatHistory: [],
  addChatMessage: (msg) =>
    set((state) => ({ chatHistory: [...state.chatHistory, msg] })),
  clearChatHistory: () => set({ chatHistory: [] }),

  error: null,
  setError: (error) => set({ error }),
}))
