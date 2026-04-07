import type { Canvas as FabricCanvas } from 'fabric'
import { Button } from '@/shared/components/ui/button'
import { useEditorStore } from '../stores/useEditorStore'
import { useRoll } from '@/features/generation/hooks/useRoll'

interface RollButtonProps {
  getCanvas: () => FabricCanvas | null
}

export function RollButton({ getCanvas }: RollButtonProps) {
  const selectedElementId = useEditorStore((s) => s.selectedElementId)
  const { roll, isRolling, rollError } = useRoll(getCanvas)

  if (!selectedElementId) return null

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={roll}
        disabled={isRolling}
      >
        {isRolling ? '重新生成中...' : 'Roll 重新生成'}
      </Button>
      {rollError && (
        <span className="text-xs text-destructive">{rollError}</span>
      )}
    </div>
  )
}
