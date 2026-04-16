/**
 * auditTypes.ts — 几何审计（Geometric Audit）相关类型定义。
 *
 * 审计的作用：JSX 渲染到 hidden DOM 后、拷贝到 fabric canvas 前，
 * 遍历 DOM 树用一组纯 JS 规则检查"能看见的问题"：文字溢出、超出画布、
 * 字号过小、对比度不足。失败的 issue 会被格式化后回注到 LLM 做修复（repair loop）。
 *
 * 这个文件只放类型，不放实现，便于被审计主模块、格式化器、store 和测试共享。
 */

/** 审计规则 ID —— 与 LLM 修复指令里的标签一一对应 */
export type AuditRuleId =
  | 'TEXT_OVERFLOW'     // 文字横/纵向溢出自身容器
  | 'OUT_OF_BOUNDS'     // 元素 bbox 超出画布边界且未被 overflow:hidden 裁切
  | 'MIN_FONT_SIZE'     // 正文字号低于可读下限
  | 'LOW_CONTRAST'      // 前景色与有效背景色的 WCAG 对比度不足
  | 'SIBLING_OVERLAP'   // 同级 flow 子元素的 bbox 发生视觉重叠（section 覆盖问题）

/** 单条问题的严重等级：error 触发修复，warning 只展示不阻塞 */
export type AuditSeverity = 'error' | 'warning'

/** 单条审计问题 —— message 写给人 & LLM 都读得懂，metrics 保留数值便于调试 */
export interface AuditIssue {
  /** 规则 ID */
  rule: AuditRuleId
  /** 严重等级 */
  severity: AuditSeverity
  /** 中文描述 + 明确的修复建议；repair loop 会把它拼成 prompt 发给 LLM */
  message: string
  /** 可读的元素路径，如 "section.hero > h1.title"，用于前端定位 */
  elementPath: string
  /** 原始测量数值（像素、比率等），仅用于调试和日志 */
  metrics?: Record<string, number | string>
}

/** 审计配置 —— 所有阈值都可注入，方便不同画布尺寸/用途调整 */
export interface AuditOptions {
  /** 正文字号下限，默认 14px */
  minBodyFontSize?: number
  /** WCAG 对比度阈值，默认 4.5（AA 级） */
  contrastThreshold?: number
  /** bbox 比较的浮点容差，默认 2px（避开浏览器 subpixel 抖动） */
  bboxTolerance?: number
  /** 是否开启对比度检查，默认 true（关掉可显著降低审计耗时） */
  enableContrastCheck?: boolean
}

/** 审计报告 —— 整次 audit 的汇总，被写入 store 驱动 UI 和 repair */
export interface AuditReport {
  /** 全部问题（按发现顺序，不排序） */
  issues: AuditIssue[]
  /** error 数量 —— > 0 即认为 audit 失败 */
  errorCount: number
  /** warning 数量 —— 展示给用户但不阻塞渲染 */
  warningCount: number
  /** 是否通过：errorCount === 0 */
  passed: boolean
  /** 执行耗时（毫秒），便于观测性能 */
  durationMs: number
  /** 审计完成时间戳 */
  timestamp: number
  /** 画布尺寸快照，便于在 UI 上展示"在 1080×1920 下发现的问题" */
  canvasBounds: { width: number; height: number }
}
