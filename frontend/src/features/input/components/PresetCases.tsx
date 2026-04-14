import { useState, useEffect } from 'react'
import type { ApiResponse } from '@/shared/types/api'
import { TemplateThumbnail } from './TemplateThumbnail'

/**
 * 模板摘要信息，与后端 TemplateInfo DTO 对应
 */
interface TemplateInfo {
  id: string
  name: string
  description: string
  category: string
  emotion: string
  width: number
  height: number
  colors: string[]
  quality: number
}

/**
 * 模板完整详情，与后端 TemplateDetail DTO 对应
 */
interface TemplateDetail extends TemplateInfo {
  prompt: string
  sourceCode: string
}

/**
 * 本地硬编码的预设案例 — 始终显示在顶部的快速入口
 */
interface PresetCase {
  title: string
  description: string
  prompt: string
}

const LOCAL_PRESETS: PresetCase[] = [
  {
    title: '促销海报',
    description: '五一劳动节促销活动',
    prompt: '五一劳动节促销海报，主标题"狂欢五一"大字居中，副标题"全场5折起"，红色喜庆背景渐变，底部留有二维码占位区域，整体风格热烈喜庆',
  },
  {
    title: '活动通知',
    description: '线下活动邀请函',
    prompt: '公司年会邀请函海报，主标题"2026年度盛典"，副标题"诚邀您的参与"，时间地点信息在下方，深蓝色高端商务风格，金色点缀装饰',
  },
  {
    title: '品牌宣传',
    description: '简约品牌展示',
    prompt: '科技品牌宣传海报，主标题"创新无界"，副标题"引领未来科技生活"，简约白色背景，蓝色渐变装饰线条，现代感十足的排版布局',
  },
]

interface PresetCasesProps {
  /** 用户选择预设 prompt 时的回调 */
  onSelect: (prompt: string) => void
}

/**
 * 预设案例与模板推荐组件
 *
 * 顶部始终显示 3 个本地快速预设；
 * 下方从后端 /api/templates/recommend 加载推荐模板，
 * 加载失败时仅显示本地预设。
 * 用户点击模板卡片后，从后端获取完整 prompt 注入输入框。
 */
export function PresetCases({ onSelect }: PresetCasesProps) {
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [templatesAvailable, setTemplatesAvailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [showAll, setShowAll] = useState(false)

  // 加载推荐模板和分类列表
  useEffect(() => {
    let cancelled = false

    // 并行加载推荐和分类
    Promise.all([
      fetch('/api/templates/recommend?count=6')
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json() as Promise<ApiResponse<TemplateInfo[]>>
        }),
      fetch('/api/templates/categories')
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return res.json() as Promise<ApiResponse<string[]>>
        }),
    ])
      .then(([templatesResp, categoriesResp]) => {
        if (cancelled) return
        if (templatesResp.code === 200 && templatesResp.data.length > 0) {
          setTemplates(templatesResp.data)
          setTemplatesAvailable(true)
        }
        if (categoriesResp.code === 200) {
          setCategories(categoriesResp.data)
        }
      })
      .catch((err) => {
        if (cancelled) return
        console.warn('[PresetCases] 后端模板服务不可用，仅显示本地预设:', err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  // 按分类加载模板列表
  const handleCategoryClick = (category: string) => {
    if (activeCategory === category) {
      // 取消选中，回到推荐
      setActiveCategory(null)
      setShowAll(false)
      fetchRecommend()
      return
    }

    setActiveCategory(category)
    setShowAll(false)
    setLoading(true)

    fetch(`/api/templates?category=${encodeURIComponent(category)}&limit=9`)
      .then((res) => res.json() as Promise<ApiResponse<TemplateInfo[]>>)
      .then((resp) => {
        if (resp.code === 200) {
          setTemplates(resp.data)
        }
      })
      .catch((err) => {
        console.warn('[PresetCases] 加载分类模板失败:', err.message)
      })
      .finally(() => setLoading(false))
  }

  // 重新加载推荐
  const fetchRecommend = () => {
    setLoading(true)
    fetch('/api/templates/recommend?count=6')
      .then((res) => res.json() as Promise<ApiResponse<TemplateInfo[]>>)
      .then((resp) => {
        if (resp.code === 200) {
          setTemplates(resp.data)
        }
      })
      .catch(() => { /* 静默失败 */ })
      .finally(() => setLoading(false))
  }

  // 点击模板卡片 → 获取完整详情并注入 prompt
  const handleTemplateClick = (template: TemplateInfo) => {
    setLoadingDetail(template.id)

    fetch(`/api/templates/${template.id}`)
      .then((res) => res.json() as Promise<ApiResponse<TemplateDetail>>)
      .then((resp) => {
        if (resp.code === 200 && resp.data.prompt) {
          onSelect(resp.data.prompt)
        } else {
          // 回退：用模板名称+描述作为 prompt
          onSelect(`${template.name}，${template.description}`)
        }
      })
      .catch(() => {
        // 回退
        onSelect(`${template.name}，${template.description}`)
      })
      .finally(() => setLoadingDetail(null))
  }

  const visibleTemplates = showAll ? templates : templates.slice(0, 6)

  return (
    <div className="space-y-4">
      {/* 本地快速预设 — 始终显示 */}
      <div className="grid grid-cols-3 gap-3">
        {LOCAL_PRESETS.map((preset) => (
          <button
            key={preset.title}
            onClick={() => onSelect(preset.prompt)}
            className="text-left p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-accent transition-colors"
          >
            <div className="font-medium text-sm mb-1">{preset.title}</div>
            <div className="text-xs text-muted-foreground">{preset.description}</div>
          </button>
        ))}
      </div>

      {/* 分类标签栏 — 模板服务可用时显示 */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryClick(cat)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                activeCategory === cat
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* 模板卡片 — 加载中骨架屏 */}
      {loading && templates.length === 0 && !templatesAvailable && (
        <div className="grid grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border border-border overflow-hidden animate-pulse">
              <div className="h-[120px] bg-muted" />
              <div className="p-3">
                <div className="h-4 bg-muted rounded w-2/3 mb-2" />
                <div className="h-3 bg-muted rounded w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 模板卡片网格 — 缩略图预览 */}
      {visibleTemplates.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {visibleTemplates.map((template) => (
            <button
              key={template.id}
              onClick={() => handleTemplateClick(template)}
              disabled={loadingDetail === template.id}
              className="text-left rounded-lg border border-border hover:border-primary/50 hover:shadow-sm transition-all disabled:opacity-50 overflow-hidden"
            >
              {/* 实时渲染的缩略图预览 */}
              <TemplateThumbnail
                templateId={template.id}
                templateWidth={template.width}
                templateHeight={template.height}
                colors={template.colors || []}
              />
              <div className="p-3">
                <div className="font-medium text-sm mb-1 line-clamp-1">{template.name}</div>
                <div className="text-xs text-muted-foreground line-clamp-2">
                  {template.description || template.category}
                </div>
                {loadingDetail === template.id && (
                  <div className="text-xs text-primary mt-1">加载中...</div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* 展开/换一批 */}
      {templatesAvailable && (
        <div className="flex justify-center gap-3">
          {templates.length > 6 && !showAll && (
            <button
              onClick={() => setShowAll(true)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              展开更多
            </button>
          )}
          {!activeCategory && (
            <button
              onClick={fetchRecommend}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              换一批
            </button>
          )}
        </div>
      )}
    </div>
  )
}
