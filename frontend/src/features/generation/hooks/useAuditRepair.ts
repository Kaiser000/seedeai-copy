/**
 * useAuditRepair — 把几何审计结果回注到 LLM 修复流水线。
 *
 * 触发场景：CanvasPanel 渲染完成后 runGeometricAudit 发现 error 级问题，
 * 用户（或自动策略）点击 AuditBanner 上的"自动修复"按钮时调用本 hook 的 repair()。
 *
 * 流程：
 *   1. 从 store 拉取当前 auditReport，用 formatIssuesForRepair 转成中文修复 prompt
 *   2. 把当前 canvas 序列化，连同 chatHistory / 修复 prompt 一起 POST /api/posters/chat
 *   3. 收到完整 JSX 后通过 setGeneratedCode() 触发 CanvasPanel 重渲染
 *      —— CanvasPanel 的 useEffect 会自动跑新一轮 audit，从而形成闭环
 *   4. 把用户 prompt 和修复结果摘要写入 chatHistory，让修复痕迹在对话里可见
 *
 * 设计决策：
 *   - 复用 /api/posters/chat 而不是新增端点，后端 0 改动
 *   - 不直接渲染 —— 只更新 generatedCode，让 CanvasPanel 统一负责渲染 + 审计
 *   - 最多允许一次正在飞的修复请求（abortRef + isAuditRepairing）
 */
import { useCallback, useRef } from 'react'
import { connectSse } from '../services/sseClient'
import { serializeCanvas } from '../services/canvasSerializer'
import { useEditorStore } from '@/features/editor/stores/useEditorStore'
import { getGlobalCanvas } from '@/features/editor/canvasRegistry'
import { formatIssuesForRepair } from '@/engine/audit/auditFormatter'

/** 修复请求完成时返回给调用方的结果 */
export interface RepairResult {
  /** 是否真的发起了修复请求（没有 error 时不会发起） */
  triggered: boolean
  /** 修复成功时 LLM 返回的新 JSX 全量代码 */
  newCode?: string
  /** 失败时的错误描述 */
  error?: string
}

export function useAuditRepair() {
  const abortRef = useRef<AbortController | null>(null)

  const repair = useCallback(async (): Promise<RepairResult> => {
    const state = useEditorStore.getState()
    const {
      auditReport,
      chatHistory,
      posterSize,
      selectedModel,
      addChatMessage,
      setGeneratedCode,
      setIsAuditRepairing,
    } = state

    // 没有报告或者审计已通过 → 没什么可修的
    if (!auditReport || auditReport.errorCount === 0) {
      console.log('[AuditRepair] 审计已通过或无报告，跳过修复')
      return { triggered: false }
    }

    const canvas = getGlobalCanvas()
    if (!canvas) {
      console.warn('[AuditRepair] 无全局 canvas，无法修复')
      return { triggered: false, error: '画布未就绪' }
    }

    // 终止上一次正在飞的修复请求（避免重入）
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setIsAuditRepairing(true)

    const repairPrompt = formatIssuesForRepair(auditReport)
    console.log('[AuditRepair] 发起修复请求:', {
      errorCount: auditReport.errorCount,
      warningCount: auditReport.warningCount,
      promptChars: repairPrompt.length,
    })

    // 把修复指令作为一条 user 消息写入对话历史，让用户可见
    addChatMessage({
      role: 'user',
      content: `[自动修复] 检测到 ${auditReport.errorCount} 个布局错误，已请求 LLM 修复`,
      timestamp: Date.now(),
    })

    try {
      const canvasState = serializeCanvas(canvas)
      const historyForApi = chatHistory.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      // 注意：userMessage 直接使用完整的 repairPrompt，LLM 会读到结构化的问题清单
      const fullCode = await connectSse(
        '/api/posters/chat',
        {
          canvasState,
          userMessage: repairPrompt,
          chatHistory: historyForApi,
          width: posterSize.width,
          height: posterSize.height,
          modelName: selectedModel || undefined,
        },
        {
          onError: (msg) => {
            console.error('[AuditRepair] SSE onError:', msg)
          },
        },
        controller.signal,
      )

      if (!fullCode) {
        console.warn('[AuditRepair] SSE 无完整代码返回')
        return { triggered: true, error: '修复请求返回为空' }
      }

      // 清空旧的 audit report，让 UI 在 CanvasPanel 跑完新一轮审计前呈现"已触发修复"状态
      useEditorStore.getState().setAuditReport(null)

      // 只更新 generatedCode —— CanvasPanel 的 useEffect 会自动重渲染 + 重审计
      setGeneratedCode(fullCode)

      addChatMessage({
        role: 'assistant',
        content: `已根据审计结果修复，正在重新审计...`,
        timestamp: Date.now(),
      })

      return { triggered: true, newCode: fullCode }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        console.log('[AuditRepair] 修复请求已取消')
        return { triggered: true, error: 'aborted' }
      }
      const message = (err as Error).message || '修复失败'
      console.error('[AuditRepair] 修复异常:', {
        error: message,
        stack: (err as Error).stack,
      })
      addChatMessage({
        role: 'assistant',
        content: `修复失败：${message}`,
        timestamp: Date.now(),
        msgType: 'error',
      })
      return { triggered: true, error: message }
    } finally {
      setIsAuditRepairing(false)
    }
  }, [])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    useEditorStore.getState().setIsAuditRepairing(false)
  }, [])

  return { repair, cancel }
}
