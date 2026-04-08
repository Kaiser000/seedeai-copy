/**
 * EditorStore — single Zustand store for the entire poster editor session.
 *
 * Generation lifecycle:
 *   idle → startGeneration() sets isGenerating=true, resets sseMessages/generatedCode/error
 *        → SSE chunks arrive via addSseMessage()
 *        → complete event → setGeneratedCode(code), isGenerating=false (via useGenerate)
 *        OR error event  → setError(msg), isGenerating=false
 *
 * Workflow stages track the generation progress in a structured way:
 *   analysis → layout → image_gen (optional) → compose
 * Each stage has a status: pending → active → complete | error
 *
 * Canvas editing state (selectedElementId) is independent of the
 * generation lifecycle. chatHistory stores user messages and simple
 * assistant responses. Workflow progress is shown via workflowStages.
 */
import { create } from 'zustand'
import type { PosterSize } from '@/features/input/components/SizeSelector'

type Page = 'input' | 'editor'

/* ── SSE 原始消息类型 ─────────────────────────────────────────────── */

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

/* ── 对话消息类型 ─────────────────────────────────────────────────── */

export type ChatMessageType = 'message' | 'error'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  msgType?: ChatMessageType
}

/* ── 工作流阶段类型 ───────────────────────────────────────────────── */

export type WorkflowStageId = 'search' | 'analysis' | 'layout' | 'image_gen' | 'compose'
export type WorkflowStageStatus = 'pending' | 'active' | 'complete' | 'error'

/** 页面布局阶段解析出的元素 */
export interface LayoutElement {
  type: 'shape' | 'text' | 'image'
  label: string
}

/** 图片生成阶段产出的图片信息 */
export interface GeneratedImage {
  index: number
  prompt: string
  /** 原始图片 URL（用于 UI 预览展示） */
  url: string
}

/** 单个工作流阶段的完整状态 */
export interface WorkflowStage {
  id: WorkflowStageId
  label: string
  status: WorkflowStageStatus
  /** 阶段右侧的简短摘要，如 "4015 代码已生成" */
  summary?: string
  /** 页面布局阶段解析出的元素列表 */
  elements?: LayoutElement[]
  /** 图片生成等阶段的进度详情 */
  details?: string[]
  /** 图片生成阶段产出的图片列表 */
  images?: GeneratedImage[]
}

/* ── Store 接口定义 ──────────────────────────────────────────────── */

interface EditorState {
  // Page navigation
  currentPage: Page
  setCurrentPage: (page: Page) => void

  // Generation input
  prompt: string
  posterSize: PosterSize
  /** 用户选择的 LLM 模型 ID（空字符串表示使用后端默认模型） */
  selectedModel: string
  setPrompt: (prompt: string) => void
  setPosterSize: (size: PosterSize) => void
  setSelectedModel: (model: string) => void
  startGeneration: (prompt: string, posterSize: PosterSize, selectedModel?: string) => void

  // SSE streaming
  isGenerating: boolean
  sseMessages: SseMessage[]
  generatedCode: string
  setIsGenerating: (generating: boolean) => void
  addSseMessage: (message: SseMessage) => void
  setGeneratedCode: (code: string) => void
  clearSseMessages: () => void

  // Workflow stages — 分阶段展示生成进度
  workflowStages: WorkflowStage[]
  accumulatedCode: string
  /** 需求分析阶段的流式文本内容（由后端 analysis_chunk 事件累积） */
  analysisContent: string
  updateWorkflowStage: (id: WorkflowStageId, updates: Partial<Omit<WorkflowStage, 'id'>>) => void
  appendAccumulatedCode: (chunk: string) => void
  /** 追加需求分析阶段的流式文本片段 */
  appendAnalysisContent: (chunk: string) => void
  addStageDetail: (id: WorkflowStageId, detail: string) => void
  /** 添加图片生成结果到指定阶段 */
  addStageImage: (id: WorkflowStageId, image: GeneratedImage) => void
  /** 将所有 active 阶段标记为 error（生成失败时调用） */
  failActiveStages: (message: string) => void

  // Canvas state
  selectedElementId: string | null
  selectElement: (id: string | null) => void
  clearSelection: () => void

  // Chat history — 仅存用户消息和简单助手回复，工作流进度由 workflowStages 展示
  chatHistory: ChatMessage[]
  addChatMessage: (msg: ChatMessage) => void
  clearChatHistory: () => void

  // Error state
  error: string | null
  setError: (error: string | null) => void
}

/* ── 工作流初始阶段定义 ──────────────────────────────────────────── */

function createInitialStages(): WorkflowStage[] {
  return [
    { id: 'search', label: '联网搜索', status: 'pending' },
    { id: 'analysis', label: '需求分析', status: 'pending' },
    { id: 'layout', label: '页面布局', status: 'pending' },
    { id: 'image_gen', label: '图片生成', status: 'pending' },
    { id: 'compose', label: '设计合成', status: 'pending' },
  ]
}

/* ── Store 实现 ──────────────────────────────────────────────────── */

export const useEditorStore = create<EditorState>()((set) => ({
  currentPage: 'input',
  setCurrentPage: (page) => set({ currentPage: page }),

  prompt: '',
  posterSize: { width: 1080, height: 1920, label: '1080×1920 竖版海报' },
  selectedModel: '',
  setPrompt: (prompt) => set({ prompt }),
  setPosterSize: (size) => set({ posterSize: size }),
  setSelectedModel: (model) => set({ selectedModel: model }),
  startGeneration: (prompt, posterSize, selectedModel) =>
    set((state) => ({
      prompt,
      posterSize,
      selectedModel: selectedModel ?? state.selectedModel,
      currentPage: 'editor',
      isGenerating: true,
      sseMessages: [],
      generatedCode: '',
      error: null,
      accumulatedCode: '',
      analysisContent: '',
      chatHistory: [
        { role: 'user', content: prompt, timestamp: Date.now(), msgType: 'message' as ChatMessageType },
      ],
      workflowStages: createInitialStages(),
    })),

  isGenerating: false,
  sseMessages: [],
  generatedCode: '',
  setIsGenerating: (generating) => set({ isGenerating: generating }),
  addSseMessage: (message) =>
    set((state) => ({ sseMessages: [...state.sseMessages, message] })),
  setGeneratedCode: (code) => set({ generatedCode: code }),
  clearSseMessages: () => set({ sseMessages: [] }),

  // ── Workflow stages ────────────────────────────────────────────
  workflowStages: [],
  accumulatedCode: '',
  analysisContent: '',

  updateWorkflowStage: (id, updates) =>
    set((state) => ({
      workflowStages: state.workflowStages.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),

  appendAccumulatedCode: (chunk) =>
    set((state) => ({ accumulatedCode: state.accumulatedCode + chunk })),

  appendAnalysisContent: (chunk) =>
    set((state) => ({ analysisContent: state.analysisContent + chunk })),

  addStageDetail: (id, detail) =>
    set((state) => ({
      workflowStages: state.workflowStages.map((s) =>
        s.id === id ? { ...s, details: [...(s.details || []), detail] } : s
      ),
    })),

  addStageImage: (id, image) =>
    set((state) => ({
      workflowStages: state.workflowStages.map((s) =>
        s.id === id ? { ...s, images: [...(s.images || []), image] } : s
      ),
    })),

  failActiveStages: (message) =>
    set((state) => ({
      workflowStages: state.workflowStages.map((s) =>
        s.status === 'active' ? { ...s, status: 'error' as const, summary: message } : s
      ),
    })),

  // ── Canvas state ───────────────────────────────────────────────
  selectedElementId: null,
  selectElement: (id) => set({ selectedElementId: id }),
  clearSelection: () => set({ selectedElementId: null }),

  // ── Chat history ───────────────────────────────────────────────
  chatHistory: [],
  addChatMessage: (msg) =>
    set((state) => ({ chatHistory: [...state.chatHistory, msg] })),
  clearChatHistory: () => set({ chatHistory: [] }),

  // ── Error state ────────────────────────────────────────────────
  error: null,
  setError: (error) => set({ error }),
}))
