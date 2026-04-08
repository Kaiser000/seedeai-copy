/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // LLM 可使用的 Tailwind 类名白名单。
  // 重要：LLM 在运行时生成 JSX，Tailwind JIT 编译时看不到这些类名，
  // 所以必须在 safelist 中显式列出所有可能用到的类名。
  safelist: [
    // ========== 布局 ==========
    'flex', 'flex-col', 'flex-row', 'flex-wrap', 'flex-1', 'flex-auto', 'flex-none',
    'items-center', 'items-start', 'items-end', 'items-stretch',
    'justify-center', 'justify-start', 'justify-end', 'justify-between', 'justify-around', 'justify-evenly',
    'self-start', 'self-center', 'self-end', 'self-stretch',
    'grid', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'grid-cols-4', 'grid-cols-5', 'grid-cols-6',
    // gap：覆盖 0~16 完整范围，含小数值（gap-0.5、gap-1.5 等）
    { pattern: /^gap-(px|\d+(\.\d+)?)$/ },

    // ========== 间距（p/m 全系列），含小数值（py-1.5、px-0.5 等） ==========
    { pattern: /^(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr)-(px|auto|\d+(\.\d+)?)$/ },

    // ========== Space 工具类（space-y-1、space-x-2 等） ==========
    { pattern: /^space-(x|y)-(px|reverse|\d+(\.\d+)?)$/ },

    // ========== 尺寸，含小数值（h-0.5、w-1.5 等）和分数值（w-1/2、w-1/3 等） ==========
    { pattern: /^(w|h|min-w|min-h|max-w|max-h)-(full|screen|auto|fit|px|\d+(\.\d+)?|\d+\/\d+)$/ },
    'w-full', 'h-full', 'w-screen', 'h-screen', 'w-fit', 'h-fit',
    'min-h-full', 'min-h-screen',

    // ========== 文字 ==========
    { pattern: /^text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl)$/ },
    { pattern: /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/ },
    'text-left', 'text-center', 'text-right', 'text-justify',
    'leading-none', 'leading-tight', 'leading-snug', 'leading-normal', 'leading-relaxed', 'leading-loose',
    'tracking-tighter', 'tracking-tight', 'tracking-normal', 'tracking-wide', 'tracking-wider', 'tracking-widest',
    'uppercase', 'lowercase', 'capitalize', 'normal-case',
    'italic', 'not-italic',
    'underline', 'overline', 'line-through', 'no-underline',
    'whitespace-normal', 'whitespace-nowrap', 'whitespace-pre-line',
    'truncate', 'break-words',

    // ========== 颜色 ==========
    { pattern: /^(text|bg|border)-(transparent|current|black|white)$/ },
    { pattern: /^(text|bg|border)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)$/ },

    // ========== 渐变 ==========
    { pattern: /^bg-gradient-to-(t|tr|r|br|b|bl|l|tl)$/ },
    { pattern: /^(from|via|to)-(transparent|current|black|white)$/ },
    // 渐变端点 + 透明度修饰符（蒙版渐变必备，如 from-black/30 to-transparent）
    { pattern: /^(from|via|to)-(black|white)\/(5|10|15|20|25|30|40|50|60|70|75|80|90|95)$/ },
    { pattern: /^(from|via|to)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)$/ },
    { pattern: /^(from|via|to)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)\/(5|10|15|20|25|30|40|50|60|70|75|80|90|95)$/ },

    // ========== 边框 ==========
    'border', 'border-0', 'border-2', 'border-4', 'border-8',
    // 方向性边框（LLM 常用于底部/顶部装饰线）
    { pattern: /^border-(t|r|b|l)(-0|-2|-4|-8)?$/ },
    // 圆角
    { pattern: /^rounded(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full)?$/ },
    // 方向性圆角
    { pattern: /^rounded-(t|b|l|r|tl|tr|bl|br)(-none|-sm|-md|-lg|-xl|-2xl|-3xl|-full)?$/ },

    // ========== 阴影 ==========
    { pattern: /^shadow(-sm|-md|-lg|-xl|-2xl|-inner|-none)?$/ },

    // ========== 定位 ==========
    'relative', 'absolute', 'fixed', 'sticky',
    'inset-0',
    { pattern: /^(top|right|bottom|left|inset)-\d+$/ },
    'z-0', 'z-10', 'z-20', 'z-30', 'z-40', 'z-50',

    // ========== 溢出 ==========
    'overflow-hidden', 'overflow-auto', 'overflow-scroll', 'overflow-visible',

    // ========== 图片适配 ==========
    'object-cover', 'object-contain', 'object-fill', 'object-none', 'object-scale-down',
    'object-center', 'object-top', 'object-bottom', 'object-left', 'object-right',

    // ========== 半透明背景（遮罩层/蒙版常用） ==========
    { pattern: /^bg-black\/(5|10|15|20|25|30|40|50|60|70|75|80|90|95)$/ },
    { pattern: /^bg-white\/(5|10|15|20|25|30|40|50|60|70|75|80|90|95)$/ },
    { pattern: /^border-white\/(10|20|30|40|50|60|70|80|90)$/ },
    { pattern: /^border-black\/(10|20|30|40|50|60|70|80|90)$/ },

    // ========== 文字/背景/边框颜色 + 透明度（text-white/60, bg-red-500/20 等） ==========
    { pattern: /^text-(white|black)\/(5|10|15|20|25|30|40|50|60|70|75|80|90|95)$/ },
    { pattern: /^text-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)\/(5|10|15|20|25|30|40|50|60|70|75|80|90|95)$/ },
    { pattern: /^bg-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|100|200|300|400|500|600|700|800|900|950)\/(5|10|15|20|25|30|40|50|60|70|75|80|90|95)$/ },

    // ========== 透明度 ==========
    { pattern: /^opacity-\d+$/ },

    // ========== 显示 ==========
    'hidden', 'block', 'inline-block', 'inline', 'inline-flex',

    // ========== 变换 ==========
    'transform',
    { pattern: /^(-)?rotate-\d+$/ },
    { pattern: /^(-)?translate-(x|y)-\d+$/ },
    '-translate-x-1/2', '-translate-y-1/2',
    { pattern: /^scale-\d+$/ },

    // ========== 分割线（LLM 用 divide-y 实现列表分隔线） ==========
    'divide-x', 'divide-y', 'divide-x-0', 'divide-y-0', 'divide-x-2', 'divide-y-2',
    { pattern: /^divide-(transparent|current|white|black|gray-\d+|slate-\d+)$/ },

    // ========== 其他 ==========
    'pointer-events-none', 'select-none', 'cursor-pointer',
    'transition', 'duration-200', 'duration-300',
    'aspect-square', 'aspect-video',
    'shrink-0', 'grow', 'grow-0',
    { pattern: /^order-\d+$/ },
  ],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
