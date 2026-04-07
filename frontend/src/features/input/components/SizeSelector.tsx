import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select'

export interface PosterSize {
  width: number
  height: number
  label: string
}

const PRESET_SIZES: PosterSize[] = [
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
