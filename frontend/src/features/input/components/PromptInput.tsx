import { Textarea } from '@/shared/components/ui/textarea'

interface PromptInputProps {
  value: string
  onChange: (value: string) => void
}

export function PromptInput({ value, onChange }: PromptInputProps) {
  return (
    <div className="w-full">
      <Textarea
        placeholder="五一劳动节促销海报，主标题'狂欢五一'，副标题'全场5折起'，红色喜庆风格，底部放二维码区域..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[160px] text-base resize-none"
      />
    </div>
  )
}
