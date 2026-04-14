## 设计参考库（基于 325 个真实高质量模板提炼）

本文件供 LLM 在海报生成和分析阶段参考。以下模式均经过大规模模板验证。

---

### 一、Design Token 标准模式

**优秀模板的共同点：在代码顶部定义结构化的色彩和排版 token 对象。** 这确保全篇风格一致。

#### 色彩 Token 模式（必须定义）

```jsx
// 标准色彩 Token — 限制在 3 色系以内
const colors = {
  primary: '#006B3F',     // 主色（品牌色/基调色）
  accent: '#D4AF37',      // 强调色（仅用于标题、价格、按钮、装饰线）
  bg: '#FDFCF8',          // 背景色
  text: '#1A1A1A',        // 主文字色
  textMuted: '#6B7280',   // 弱化文字色
  border: 'rgba(0,0,0,0.08)', // 分割线/边框
};
```

#### 排版 Token 模式（必须定义）

```jsx
// 标准排版 Token — 至少覆盖 4 级层次
const typography = {
  h1: { fontFamily: 'OPPO Sans 4.0', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.02em' },
  h2: { fontFamily: 'OPPO Sans 4.0', fontWeight: 700, lineHeight: 1.2, letterSpacing: '0.02em' },
  body: { fontFamily: 'Noto Sans', fontWeight: 400, lineHeight: 1.7 },
  caption: { fontFamily: 'Noto Sans', fontWeight: 400, lineHeight: 1.5 },
  numeric: { fontFamily: 'Inter', fontWeight: 800 },
};
```

---

### 二、推荐字体组合（按使用频率排序）

| 用途 | 推荐字体 | 适用场景 |
|------|---------|---------|
| **中文无衬线**（正文首选） | `Noto Sans` | 所有场景通用 |
| **中文衬线**（标题/高端） | `Noto Serif SC` | 品牌、文化、高端 |
| **英文/数字** | `Inter` | 数据、价格、英文标签 |
| **中文品牌标题** | `OPPO Sans 4.0` | 科技、产品、现代感 |
| **手写/活泼标题** | `Smiley Sans Oblique` | 年轻、活泼、创意 |
| **潮流/抖音风** | `Douyin Sans` | 社交媒体、潮流 |
| **古典/文化** | `LanternMingA` | 传统文化、古典、节日 |
| **手绘/艺术** | `Muyao-Softbrush` | 手绘风、笔记风 |

**字体搭配原则：**
- 标题和正文用不同字体家族（如标题 `OPPO Sans 4.0` + 正文 `Noto Sans`）
- 数字/价格单独用 `Inter`（等宽、清晰）
- 衬线体用于需要文化感/权威感的场景

---

### 三、场景配色方案（从真实模板提炼）

#### 电商/促销
```jsx
const colors = {
  primary: '#E53935',    // 热烈红
  accent: '#FFD700',     // 金色促销
  bg: '#FFF5F5',         // 暖白底
  text: '#1A1A1A',
  textMuted: '#666666',
};
```

#### 科技/AI
```jsx
const colors = {
  primary: '#0A0A0B',    // 深黑底
  accent: '#0066FF',     // 科技蓝
  bg: '#0A0A0B',
  text: '#FFFFFF',
  textMuted: '#999999',
  card: '#161618',       // 卡片底色
};
```

#### 健康/医疗
```jsx
const colors = {
  primary: '#334139',    // 深绿
  accent: '#8DA399',     // 薄荷绿
  bg: '#FDFBF7',         // 暖白
  text: '#334139',
  textMuted: '#6B7280',
  secondary: '#C89B7B',  // 温暖棕
};
```

#### 高端/奢华
```jsx
const colors = {
  primary: '#1A1A1A',    // 深黑
  accent: '#D4AF37',     // 金色
  bg: '#F9F8F6',         // 象牙白
  text: '#1A1A1A',
  textMuted: '#6C6863',
  border: 'rgba(26,26,26,0.1)',
};
```

#### 文化/传统
```jsx
const colors = {
  primary: '#8B4513',    // 古铜色
  accent: '#C89B7B',     // 暖金
  bg: '#F5EDE4',         // 宣纸色
  text: '#3D2B1F',
  textMuted: '#8B7355',
};
```

#### 清新/自然
```jsx
const colors = {
  primary: '#2D5A27',    // 森林绿
  accent: '#F59E0B',     // 暖黄点缀
  bg: '#F0FDF4',         // 薄荷白
  text: '#1A1A1A',
  textMuted: '#6B7280',
};
```

---

### 四、高频布局模式（from 325 templates）

#### 模式 1：全屏背景图 + 蒙版 + 浮层文字
```jsx
<div style={{ height: '600px' }} className="relative overflow-hidden">
  <img src="{图片URL}" className="absolute inset-0 w-full h-full object-cover" />
  <div className="absolute inset-0 bg-black/25" />
  <div className="relative z-10 flex flex-col justify-end h-full pb-12 px-8">
    <h1 className="text-white" style={{ ...typography.h1, fontSize: '64px', textShadow: '0 4px 12px rgba(0,0,0,0.6)' }}>标题</h1>
  </div>
</div>
```

#### 模式 2：数据卡片网格
```jsx
<div className="grid grid-cols-2 gap-4 px-8">
  {[
    { label: '年营收', value: '5.2亿', unit: '元' },
    { label: '用户数', value: '320', unit: '万+' },
  ].map((item, i) => (
    <div key={i} className="rounded-2xl p-6" style={{ backgroundColor: colors.card, border: `1px solid ${colors.border}` }}>
      <div style={{ ...typography.caption, color: colors.textMuted }}>{item.label}</div>
      <div className="flex items-baseline gap-1 mt-2">
        <span style={{ ...typography.numeric, fontSize: '36px', color: colors.accent }}>{item.value}</span>
        <span style={{ ...typography.caption, color: colors.textMuted }}>{item.unit}</span>
      </div>
    </div>
  ))}
</div>
```

#### 模式 3：时间轴 / 流程
```jsx
<div className="px-8 space-y-6">
  {steps.map((step, i) => (
    <div key={i} className="flex items-start gap-4">
      <div className="flex flex-col items-center">
        <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: colors.accent }}>
          <span className="text-white font-bold" style={{ fontFamily: 'Inter' }}>{i + 1}</span>
        </div>
        {i < steps.length - 1 && <div className="w-0.5 h-12" style={{ backgroundColor: colors.border }} />}
      </div>
      <div className="flex-1 pt-1">
        <div style={{ ...typography.h2, fontSize: '18px', color: colors.text }}>{step.title}</div>
        <div className="mt-1" style={{ ...typography.body, fontSize: '14px', color: colors.textMuted }}>{step.desc}</div>
      </div>
    </div>
  ))}
</div>
```

#### 模式 4：特性卖点横排（带图片）
```jsx
<div className="grid grid-cols-3 gap-6 px-8">
  {features.map((f, i) => (
    <div key={i} className="text-center">
      <div className="w-20 h-20 rounded-2xl overflow-hidden mx-auto mb-3">
        <img src={f.image} className="w-full h-full object-cover" />
      </div>
      <div style={{ ...typography.h2, fontSize: '16px', color: colors.text }}>{f.title}</div>
      <div className="mt-1" style={{ ...typography.caption, fontSize: '13px', color: colors.textMuted }}>{f.desc}</div>
    </div>
  ))}
</div>
```

#### 模式 5：分区标题（装饰线 + 英文副标题）
```jsx
<div className="text-center py-10">
  <div className="flex items-center justify-center gap-4 mb-3">
    <div className="w-12 h-0.5" style={{ backgroundColor: colors.accent }} />
    <span style={{ ...typography.h2, fontSize: '28px', color: colors.text, letterSpacing: '0.1em' }}>核心优势</span>
    <div className="w-12 h-0.5" style={{ backgroundColor: colors.accent }} />
  </div>
  <div style={{ ...typography.caption, fontSize: '12px', color: colors.textMuted, letterSpacing: '0.2em', textTransform: 'uppercase' }}>
    CORE ADVANTAGES
  </div>
</div>
```

---

### 五、情绪→设计参数映射（数据驱动）

| 情绪 | 字体组合 | 色彩方向 | 字间距 | 圆角 | 阴影 |
|------|---------|---------|--------|------|------|
| **专业/权威** | OPPO Sans + Noto Sans | 冷色（slate/blue 系） | tracking-wide | rounded-lg | shadow-lg |
| **活泼/年轻** | Douyin Sans + Noto Sans | 暖色饱和（orange/pink） | tracking-normal | rounded-3xl | shadow-xl |
| **紧急/促销** | OPPO Sans（粗） + Inter | 高对比（red+yellow） | tracking-tight | rounded-xl | shadow-2xl |
| **温暖/治愈** | Noto Serif SC + Noto Sans | 暖色柔和（amber/rose） | tracking-wide | rounded-2xl | shadow-md |
| **高端/奢华** | LanternMingA + Inter | 深色+金（#1A1A1A+#D4AF37） | tracking-widest | rounded-sm~lg | shadow-lg |
| **极简/现代** | Inter + Noto Sans | 黑白+单色强调 | tracking-wider | rounded-none~lg | shadow-none~md |
| **文化/传统** | LanternMingA + Noto Serif SC | 古典色（棕/赤/墨绿） | tracking-wide | rounded-sm | shadow-md |
| **手绘/笔记** | Muyao-Softbrush + Smiley Sans | 马克笔色（highlight yellow/red） | tracking-normal | rounded-2xl | shadow-sm |

---

### 六、统计数据（设计决策参考）

- 平均每个模板 **5 个内容区块**（中位数也是 5）
- 平均代码长度 **12,940 字符**
- **94.4%** 使用 `flex flex-col` 作为主布局
- **86.7%** 使用阴影（shadow-md/lg/xl 最常见）
- **71.9%** 使用渐变背景
- **94.4%** 使用边框装饰
- **63.6%** 在代码顶部定义 `colors` 对象
- **58.3%** 使用 `.map()` 动态渲染列表
