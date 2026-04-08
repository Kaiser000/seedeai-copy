import { useState, useEffect } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'

/**
 * 模型信息，与后端 ModelInfo DTO 对应
 */
export interface ModelInfo {
  id: string
  name: string
  provider: string
  isDefault: boolean
}

interface ModelSelectorProps {
  value: string
  onChange: (modelId: string) => void
}

/**
 * 前端硬编码的模型列表 — 当后端 /api/models 不可用时作为回退。
 * 保持与后端 ModelController 中的列表一致。
 */
const FALLBACK_MODELS: ModelInfo[] = [
  { id: 'glm-5', name: 'glm-5（默认）', provider: '默认', isDefault: true },

  // Anthropic Claude
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', provider: 'Anthropic', isDefault: false },
  { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6', provider: 'Anthropic', isDefault: false },

  // OpenAI GPT
  { id: 'openai/gpt-5.4', name: 'GPT-5.4', provider: 'OpenAI', isDefault: false },
  { id: 'openai/gpt-5.4-mini', name: 'GPT-5.4 Mini', provider: 'OpenAI', isDefault: false },
  { id: 'openai/gpt-5.4-nano', name: 'GPT-5.4 Nano', provider: 'OpenAI', isDefault: false },

  // Google Gemini
  { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro', provider: 'Google', isDefault: false },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash', provider: 'Google', isDefault: false },

  // xAI Grok
  { id: 'x-ai/grok-4.20', name: 'Grok 4.20', provider: 'xAI', isDefault: false },

  // Qwen 通义千问
  { id: 'qwen/qwen3.6-plus', name: 'Qwen3.6 Plus', provider: 'Qwen', isDefault: false },
  { id: 'qwen/qwen3.5-flash-02-23', name: 'Qwen3.5 Flash', provider: 'Qwen', isDefault: false },
  { id: 'qwen/qwen3-max-thinking', name: 'Qwen3 Max Thinking', provider: 'Qwen', isDefault: false },

  // Z.ai GLM
  { id: 'z-ai/glm-5.1', name: 'GLM 5.1', provider: 'Z.ai', isDefault: false },
  { id: 'z-ai/glm-5', name: 'GLM 5', provider: 'Z.ai', isDefault: false },
  { id: 'z-ai/glm-5-turbo', name: 'GLM 5 Turbo', provider: 'Z.ai', isDefault: false },
  { id: 'z-ai/glm-4.7', name: 'GLM 4.7', provider: 'Z.ai', isDefault: false },
  { id: 'z-ai/glm-4.7-flash', name: 'GLM 4.7 Flash', provider: 'Z.ai', isDefault: false },

  // Mistral
  { id: 'mistralai/mistral-small-2603', name: 'Mistral Small 4', provider: 'Mistral', isDefault: false },
]

/**
 * 模型选择器 — 优先从后端 /api/models 加载列表，
 * 加载失败时使用前端硬编码的 FALLBACK_MODELS。
 * 按提供商分组展示。
 */
export function ModelSelector({ value, onChange }: ModelSelectorProps) {
  const [models, setModels] = useState<ModelInfo[]>(FALLBACK_MODELS)
  const [loading, setLoading] = useState(true)

  // 组件挂载时尝试从后端获取模型列表，失败则使用 fallback
  useEffect(() => {
    let cancelled = false

    fetch('/api/models')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((data: ModelInfo[]) => {
        if (!cancelled && data.length > 1) {
          setModels(data)
        }
      })
      .catch((err) => {
        console.warn('[ModelSelector] 后端模型列表不可用，使用本地列表:', err.message)
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          // 如果当前选中的 value 为空，自动选择默认模型
          if (!value) {
            const defaultModel = FALLBACK_MODELS.find((m) => m.isDefault)
            if (defaultModel) onChange(defaultModel.id)
          }
        }
      })

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 按提供商分组
  const providers = [...new Set(models.map((m) => m.provider))]

  if (loading) {
    return (
      <div className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm text-muted-foreground flex items-center">
        加载模型列表...
      </div>
    )
  }

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder="选择生成模型" />
      </SelectTrigger>
      <SelectContent>
        {providers.map((provider) => {
          const providerModels = models.filter((m) => m.provider === provider)
          return (
            <div key={provider}>
              {/* 提供商分组标题 */}
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                {provider}
              </div>
              {providerModels.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.name}
                </SelectItem>
              ))}
            </div>
          )
        })}
      </SelectContent>
    </Select>
  )
}
