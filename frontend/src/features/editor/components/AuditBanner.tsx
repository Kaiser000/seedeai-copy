/**
 * AuditBanner — 几何审计结果浮层。
 *
 * 位置：CanvasPanel 右上角，半透明背景，只有在 auditReport.errorCount > 0
 * 或 warningCount > 0 时渲染（通过即完全不显示，避免干扰正常生成）。
 *
 * 交互：
 *   1. 折叠/展开 —— 默认只显示 headline，点击展开后列出所有 issue
 *   2. "自动修复"按钮 —— 调 useAuditRepair.repair()，触发 LLM 重新生成
 *   3. "忽略"按钮 —— 清空 auditReport，Banner 消失
 */
import { useState, useMemo } from 'react'
import { AlertTriangle, AlertCircle, Sparkles, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useEditorStore } from '../stores/useEditorStore'
import { useAuditRepair } from '@/features/generation/hooks/useAuditRepair'
import { formatIssuesForUi } from '@/engine/audit/auditFormatter'
import type { AuditUiItem } from '@/engine/audit/auditFormatter'

export function AuditBanner() {
  const auditReport = useEditorStore((s) => s.auditReport)
  const isAuditRepairing = useEditorStore((s) => s.isAuditRepairing)
  const isGenerating = useEditorStore((s) => s.isGenerating)
  const setAuditReport = useEditorStore((s) => s.setAuditReport)
  const { repair } = useAuditRepair()

  const [expanded, setExpanded] = useState(false)

  // 把 report 转成 UI 友好的条目列表。没有 report 或已通过 → 不渲染
  const summary = useMemo(
    () => (auditReport ? formatIssuesForUi(auditReport) : null),
    [auditReport],
  )

  if (!summary) return null
  if (summary.passed) return null
  if (summary.errorCount === 0 && summary.warningCount === 0) return null

  // 生成中时不打扰 —— audit 会被新一轮覆盖，避免闪烁
  if (isGenerating) return null

  const hasErrors = summary.errorCount > 0
  const bannerColor = hasErrors
    ? 'border-red-200 bg-red-50/95'
    : 'border-amber-200 bg-amber-50/95'
  const accentColor = hasErrors ? 'text-red-600' : 'text-amber-600'
  const Icon = hasErrors ? AlertCircle : AlertTriangle

  const handleRepair = async () => {
    if (isAuditRepairing) return
    await repair()
  }

  const handleDismiss = () => {
    setAuditReport(null)
    setExpanded(false)
  }

  return (
    <div
      className={`absolute top-3 right-3 z-20 max-w-[360px] rounded-xl border shadow-lg backdrop-blur-md ${bannerColor}`}
    >
      {/* ── 头部摘要 ── */}
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <Icon size={16} className={`flex-shrink-0 ${accentColor}`} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-gray-800 truncate">
            {summary.headline}
          </div>
          <div className="text-[11px] text-gray-500 mt-0.5">
            几何审计 · 点击查看详情
          </div>
        </div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-black/5 transition-colors"
          title={expanded ? '收起' : '展开'}
        >
          {expanded ? (
            <ChevronUp size={14} className="text-gray-500" />
          ) : (
            <ChevronDown size={14} className="text-gray-500" />
          )}
        </button>
        <button
          onClick={handleDismiss}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-black/5 transition-colors"
          title="忽略"
        >
          <X size={14} className="text-gray-500" />
        </button>
      </div>

      {/* ── 展开的问题列表 ── */}
      {expanded && (
        <div className="border-t border-black/5 max-h-[260px] overflow-y-auto">
          <ul className="px-3.5 py-2 space-y-1.5">
            {summary.items.map((item, idx) => (
              <AuditIssueItem key={idx} item={item} />
            ))}
          </ul>
        </div>
      )}

      {/* ── 底部操作区 ── */}
      {hasErrors && (
        <div className="border-t border-black/5 px-3.5 py-2 flex items-center justify-between gap-2">
          <span className="text-[11px] text-gray-500">
            LLM 会读到问题清单并尝试最小改动修复
          </span>
          <button
            onClick={handleRepair}
            disabled={isAuditRepairing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-gray-900 text-white text-[12px] font-medium hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            <Sparkles size={12} />
            {isAuditRepairing ? '修复中...' : '自动修复'}
          </button>
        </div>
      )}
    </div>
  )
}

/** 单条 issue 展示 */
function AuditIssueItem({ item }: { item: AuditUiItem }) {
  const isError = item.severity === 'error'
  const dotColor = isError ? 'bg-red-500' : 'bg-amber-500'
  return (
    <li className="flex items-start gap-2 text-[11px] leading-snug">
      <span
        className={`mt-[5px] w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor}`}
      />
      <div className="flex-1 min-w-0">
        <div className="font-medium text-gray-700">
          <span className="text-gray-500">[{item.ruleLabel}]</span> {item.message}
        </div>
        {item.elementPath && (
          <div className="text-[10px] text-gray-400 mt-0.5 font-mono truncate">
            {item.elementPath}
          </div>
        )}
      </div>
    </li>
  )
}
