interface PresetCase {
  title: string
  description: string
  prompt: string
}

const PRESETS: PresetCase[] = [
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
  onSelect: (prompt: string) => void
}

export function PresetCases({ onSelect }: PresetCasesProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {PRESETS.map((preset) => (
        <button
          key={preset.title}
          onClick={() => onSelect(preset.prompt)}
          className="text-left p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-accent transition-colors"
        >
          <div className="font-medium text-sm mb-1">{preset.title}</div>
          <div className="text-xs text-muted-foreground">{preset.description}</div>
        </button>
      ))}
    </div>
  )
}
