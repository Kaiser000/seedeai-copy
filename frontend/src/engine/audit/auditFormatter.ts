/**
 * auditFormatter.ts — 把 AuditReport 格式化为两种用途：
 *
 *   1. formatIssuesForRepair() — 回注到 LLM 的修复 prompt（严格结构化的中文指令）
 *   2. formatIssuesForUi()    — 前端 Banner 展示用的精简结构
 *
 * 规则：只做格式转换，不做过滤/排序。调用方自己决定要传什么。
 */
import type { AuditIssue, AuditReport, AuditRuleId } from './auditTypes'

/** LLM 修复 prompt 里展示规则时用的中文别名 */
const RULE_LABELS: Record<AuditRuleId, string> = {
  OUT_OF_BOUNDS: '元素超出画布',
  TEXT_OVERFLOW: '文字溢出容器',
  MIN_FONT_SIZE: '字号过小',
  LOW_CONTRAST: '对比度不足',
  SIBLING_OVERLAP: '同级元素重叠',
}

/**
 * 把 AuditReport 格式化为一段可直接作为 userMessage 发给 /api/posters/chat 的中文修复指令。
 * LLM 会读到：问题清单 → 修复约束 → 输出要求。
 *
 * 空报告返回空字符串，调用方需要自己决定是否跳过修复。
 */
export function formatIssuesForRepair(report: AuditReport): string {
  if (report.issues.length === 0) return ''

  const errors = report.issues.filter((i) => i.severity === 'error')
  const warnings = report.issues.filter((i) => i.severity === 'warning')

  const lines: string[] = []
  lines.push('【布局质量审计】系统在画布 ' +
    `${report.canvasBounds.width}×${report.canvasBounds.height} 下检测到以下问题，请修复：`)
  lines.push('')

  if (errors.length > 0) {
    lines.push('## 必须修复（Error）')
    errors.forEach((iss, i) => {
      lines.push(`${i + 1}. [${RULE_LABELS[iss.rule]}] ${iss.message}`)
      if (iss.elementPath) lines.push(`   定位：${iss.elementPath}`)
    })
    lines.push('')
  }

  if (warnings.length > 0) {
    lines.push('## 建议修复（Warning）')
    warnings.forEach((iss, i) => {
      lines.push(`${i + 1}. [${RULE_LABELS[iss.rule]}] ${iss.message}`)
      if (iss.elementPath) lines.push(`   定位：${iss.elementPath}`)
    })
    lines.push('')
  }

  lines.push('## 修复要求')
  lines.push('1. 保持整体构图、配色方向、字体层级、文案语义不变 —— 只针对上述问题做最小必要改动。')
  lines.push('2. 不要为了"避免溢出"就把所有文字全部缩小到下限，优先考虑缩短文案、增大容器或调整换行策略。')
  lines.push('3. 输出完整的 Poster 组件 JSX 代码，不要只输出 diff。')
  return lines.join('\n')
}

/** 给 UI Banner 使用的精简条目类型 */
export interface AuditUiItem {
  rule: AuditRuleId
  ruleLabel: string
  severity: AuditIssue['severity']
  message: string
  elementPath: string
}

/** 给 UI Banner 使用的汇总信息 */
export interface AuditUiSummary {
  passed: boolean
  errorCount: number
  warningCount: number
  headline: string
  items: AuditUiItem[]
}

/**
 * 把 AuditReport 格式化为 UI Banner 用的简单结构。
 * headline 是一句中文摘要，items 逐条问题，方便渲染成列表。
 */
export function formatIssuesForUi(report: AuditReport): AuditUiSummary {
  const headline = report.passed
    ? '布局审计通过 ✓'
    : report.warningCount > 0
      ? `检测到 ${report.errorCount} 个错误、${report.warningCount} 个警告`
      : `检测到 ${report.errorCount} 个错误`

  return {
    passed: report.passed,
    errorCount: report.errorCount,
    warningCount: report.warningCount,
    headline,
    items: report.issues.map((iss) => ({
      rule: iss.rule,
      ruleLabel: RULE_LABELS[iss.rule],
      severity: iss.severity,
      message: iss.message,
      elementPath: iss.elementPath,
    })),
  }
}
