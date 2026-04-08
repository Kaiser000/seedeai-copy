import { useState } from 'react'
import { Button } from '@/shared/components/ui/button'
import { PromptInput } from './components/PromptInput'
import { SizeSelector, PRESET_SIZES } from './components/SizeSelector'
import type { PosterSize } from './components/SizeSelector'
import { ModelSelector } from './components/ModelSelector'
import { PresetCases } from './components/PresetCases'
import { useEditorStore } from '@/features/editor/stores/useEditorStore'

export function InputPage() {
  const [prompt, setPrompt] = useState('')
  const [posterSize, setPosterSize] = useState<PosterSize>(PRESET_SIZES[0])
  const [selectedModel, setSelectedModel] = useState('')
  const [validationError, setValidationError] = useState('')
  const startGeneration = useEditorStore((s) => s.startGeneration)

  const handleGenerate = () => {
    if (!prompt.trim()) {
      setValidationError('请输入海报描述')
      return
    }
    setValidationError('')
    startGeneration(prompt.trim(), posterSize, selectedModel)
  }

  const handlePresetSelect = (presetPrompt: string) => {
    setPrompt(presetPrompt)
    setValidationError('')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 max-w-2xl mx-auto gap-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">Seede AI</h1>
        <p className="text-muted-foreground">用自然语言描述，AI 帮你生成海报</p>
      </div>

      <div className="w-full space-y-4">
        <PromptInput value={prompt} onChange={(v) => { setPrompt(v); setValidationError('') }} />

        {validationError && (
          <p className="text-sm text-destructive">{validationError}</p>
        )}

        <SizeSelector value={posterSize} onChange={setPosterSize} />

        <ModelSelector value={selectedModel} onChange={setSelectedModel} />

        <Button onClick={handleGenerate} className="w-full" size="lg">
          生成海报
        </Button>
      </div>

      <div className="w-full">
        <p className="text-sm text-muted-foreground mb-3">试试这些案例：</p>
        <PresetCases onSelect={handlePresetSelect} />
      </div>
    </div>
  )
}
