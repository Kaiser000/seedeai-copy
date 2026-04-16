import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'

export interface PosterSize {
  width: number
  /** 画布高度（px）。0 表示自适应长图 — 高度由 LLM 生成内容决定，渲染后测量实际高度 */
  height: number
  label: string
}

/** height=0 哨兵值，标识自适应高度模式（长图） */
export const ADAPTIVE_HEIGHT = 0

/**
 * 预设尺寸 — 来源于模板库中实际存在的比例：
 *   - 1080×1920 竖版（163 个模板）
 *   - 1080×1080 方形（社交通用）
 *   - 1920×1080 横版（2 个模板）
 *   - 1080×自适应 长图（97 个模板，比例 ≥ 2.5，高度由内容决定）
 */
const PRESET_SIZES: PosterSize[] = [
  { width: 1080, height: ADAPTIVE_HEIGHT, label: '1080×自适应 长图' },
  { width: 1080, height: 1920, label: '1080×1920 竖版海报' },
  { width: 1080, height: 1080, label: '1080×1080 方形' },
  { width: 1920, height: 1080, label: '1920×1080 横版' },
]

interface SizeSelectorProps {
  value: PosterSize
  onChange: (size: PosterSize) => void
}

export function SizeSelector({ value, onChange }: SizeSelectorProps) {
  const handleChange = (val: string) => {
    const size = PRESET_SIZES.find((s) => `${s.width}x${s.height}` === val)
    if (size) onChange(size)
  }

  return (
    <Select
      value={`${value.width}x${value.height}`}
      onValueChange={handleChange}
    >
      <SelectTrigger className="w-full">
        <SelectValue placeholder="选择海报尺寸" />
      </SelectTrigger>
      <SelectContent>
        {PRESET_SIZES.map((size) => (
          <SelectItem
            key={`${size.width}x${size.height}`}
            value={`${size.width}x${size.height}`}
          >
            {size.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export { PRESET_SIZES }
