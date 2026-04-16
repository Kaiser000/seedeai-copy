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

### 三、配色策略（基于色彩理论，不要机械套用预设）

**核心原则：每次设计都应基于主题语义推导出独特的配色，而不是从 6 个预设中选一个。**

#### 配色算法（4 种策略，在 gene.colorStrategy 中选定）

**1. 单色方案（Monochromatic）** — 最安全、最和谐
```
主色 hue 不变 → 调整 S（饱和度）和 L（明度）生成阶梯：
  primary:   hsl(H, 70%, 35%)   — 深色主色
  accent:    hsl(H, 80%, 50%)   — 鲜艳强调
  bg:        hsl(H, 15%, 97%)   — 极浅背景
  text:      hsl(H, 20%, 15%)   — 深色文字
  textMuted: hsl(H, 10%, 45%)   — 弱化文字
```

**2. 互补色方案（Complementary）** — 对比强烈、有冲击力
```
主色 hue=H → 强调色 hue=H+180°
  primary:   hsl(H, 70%, 35%)
  accent:    hsl(H+180, 75%, 55%)   — 色轮对面
  适用：促销、运动、需要高对比的场景
```

**3. 分裂互补（Split-Complementary）** — 丰富但不刺眼
```
主色 hue=H → 辅助色 hue=H+150° 和 H+210°
  primary:   hsl(H, 70%, 35%)
  accent:    hsl(H+150, 65%, 50%)
  secondary: hsl(H+210, 60%, 50%)   — 可选第三色
  适用：活动、节庆、需要色彩丰富但和谐的场景
```

**4. 类似色方案（Analogous）** — 柔和、自然过渡
```
色轮相邻 30° 的 2-3 色
  primary:   hsl(H, 65%, 40%)
  accent:    hsl(H+30, 70%, 50%)
  适用：自然、温暖、治愈类场景
```

**具体的配色方案参考（hue 方向、真实 Token 示例）由后端从配色库中动态注入到用户消息，不在此文件硬编码。**

**重要：每次设计必须推导出具体 HEX 值写入 gene.style，不要写 hsl() 函数。**

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

#### 模式 6：高级背景处理（径向辉光 + 深浅交替）
```jsx
{/* 深色主题高级背景 — 径向辉光，避免纯色平铺 */}
<div style={{ backgroundColor: '#0a0a1a' }} className="relative overflow-hidden">
  {/* 辉光装饰层 */}
  <div className="absolute inset-0" style={{
    backgroundImage: 'radial-gradient(ellipse at 25% 15%, rgba(212,175,55,0.08), transparent 55%), radial-gradient(ellipse at 75% 85%, rgba(59,130,246,0.06), transparent 50%)'
  }} />
  <div className="relative z-10 py-16 px-8">
    {/* 内容 */}
  </div>
</div>

{/* 浅色主题 — 带色温的白 + 微渐变，不用纯白 */}
<div style={{ backgroundImage: 'linear-gradient(to bottom, #FDFCF8, #F5F3EF)' }} className="py-16 px-8">
  {/* 内容 */}
</div>

{/* 深色区块交替（同色系微变，不是同一个颜色） */}
<section style={{ backgroundColor: '#0f0f1a' }}>{/* section 1 */}</section>
<section style={{ backgroundColor: '#141428' }}>{/* section 2: 略浅 */}</section>
<section style={{ backgroundColor: '#0f0f1a' }}>{/* section 3: 回深 */}</section>
```

#### 模式 7：时间轴/流程（活动议程、历史年表）
```jsx
<div className="px-8 space-y-0">
  {schedule.map((item, i) => (
    <div key={i} className="flex items-start gap-6">
      <div className="flex flex-col items-center flex-shrink-0">
        <div className="w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
             style={{ backgroundColor: colors.accent }}>
          <span className="text-white font-bold" style={{ fontFamily: 'Inter', fontSize: '13px' }}>{item.time}</span>
        </div>
        {i < schedule.length - 1 && <div className="w-0.5 h-16" style={{ backgroundColor: colors.border }} />}
      </div>
      <div className="flex-1 pt-2 pb-6">
        <div style={{ ...typography.h2, fontSize: '24px', color: colors.text }}>{item.title}</div>
        <div className="mt-1" style={{ ...typography.body, fontSize: '16px', color: colors.textMuted }}>{item.desc}</div>
      </div>
    </div>
  ))}
</div>
```

#### 模式 8：编号步骤/路线卡片（旅游、指南）
```jsx
{/* 带编号 + 推荐标签 + 配图的步骤卡片 */}
<div className="rounded-3xl overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.05)' }}>
  <img src="..." className="w-full h-52 object-cover" />
  <div className="p-6">
    <div className="flex items-center gap-3 mb-3">
      <span className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
            style={{ backgroundColor: colors.accent, fontFamily: 'Inter' }}>01</span>
      <span className="px-3 py-1 rounded-full text-xs font-medium"
            style={{ backgroundColor: colors.accent, color: '#fff' }}>RECOMMENDED</span>
    </div>
    <h3 style={{ ...typography.h2, fontSize: '28px', color: colors.text }}>景点名称</h3>
    <p className="mt-2" style={{ ...typography.body, color: colors.textMuted }}>详细描述文字...</p>
  </div>
</div>
```

#### 模式 9：圆角容器系统（所有卡片/容器的默认样式）
```jsx
{/* 标准卡片 — 圆角 + 微妙边框 + 半透明背景 */}
<div className="rounded-2xl overflow-hidden"
     style={{ backgroundColor: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
  {/* 内容 */}
</div>

{/* 药丸标签 */}
<span className="px-4 py-1.5 rounded-full text-sm tracking-wide"
      style={{ backgroundColor: colors.accent, color: '#fff' }}>推荐</span>

{/* 高端场景的超大圆角容器 */}
<div className="rounded-[40px] p-10 shadow-2xl"
     style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}` }}>
  {/* 内容 */}
</div>
```

---

### 五、情绪→设计参数

**具体的情绪参数（Token 示例、装饰手法、布局偏好）由后端从情绪库中动态注入到用户消息。**

此处仅列出情绪维度的通用规则：
- 每种情绪有一组对应的**字间距 / 圆角 / 阴影 / 色温**微参数
- 微参数必须一致贯穿整张海报（不要混搭不同情绪的参数）
- 用户消息中的【情绪参考】块包含从同情绪模板统计出的真实 Token 示例和装饰手法，**必须参考**

---

### 六、构图风格模式（6 种，对应 gene.layoutStyle）

#### `classic-stack` — 经典排版（适合信息密集型长图）
```jsx
{/* flex 流式，section 从上到下堆叠 */}
<div style={{ width: '1080px', height: '3688px' }} className="flex flex-col overflow-hidden">
  <section style={{ height: '920px' }}>{/* header 主视觉 */}</section>
  <section style={{ height: '800px' }}>{/* 内容区 1 */}</section>
  <section style={{ height: '1000px' }}>{/* 内容区 2 */}</section>
  <section style={{ height: '968px' }}>{/* CTA */}</section>
</div>
```

#### `free-composition` — 自由构图（适合艺术/品牌海报）
```jsx
{/* absolute 定位，元素自由散布 */}
<div style={{ width: '1080px', height: '1920px' }} className="relative overflow-hidden">
  <img className="absolute inset-0 w-full h-full object-cover" />
  <div className="absolute inset-0 bg-black/25" />
  <h1 className="absolute" style={{ top: '15%', left: '8%', fontSize: '200px' }}>主标题</h1>
  <div className="absolute" style={{ bottom: '20%', right: '8%' }}>{/* 信息块 */}</div>
  <div className="absolute" style={{ top: '60%', left: '50%', transform: 'rotate(-5deg)' }}>{/* 装饰 */}</div>
</div>
```

#### `center-radial` — 中心放射（适合单焦点/方形海报）
```jsx
{/* 中心焦点 + 四周环绕 */}
<div style={{ width: '1080px', height: '1080px' }} className="relative overflow-hidden">
  <div className="absolute" style={{ top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
    {/* 核心焦点（产品图/主标题） */}
  </div>
  <div className="absolute top-8 left-8">{/* 左上角信息 */}</div>
  <div className="absolute bottom-8 right-8">{/* 右下角 CTA */}</div>
</div>
```

#### `magazine-split` — 杂志双栏（适合品牌故事/人物介绍）
```jsx
{/* 左右分栏 */}
<div style={{ width: '1080px', height: '1920px' }} className="relative overflow-hidden">
  <div className="absolute left-0 top-0 bottom-0" style={{ width: '45%' }}>
    <img className="w-full h-full object-cover" />
  </div>
  <div className="absolute right-0 top-0 bottom-0 flex flex-col justify-center px-12" style={{ width: '55%' }}>
    {/* 文字内容 */}
  </div>
</div>
```

#### `diagonal-cut` — 对角线切割（适合运动/时尚/高对比视觉）
```jsx
{/* 倾斜色块分割画面 */}
<div style={{ width: '1080px', height: '1920px' }} className="relative overflow-hidden">
  <div className="absolute inset-0" style={{ backgroundColor: colors.primary }} />
  <div className="absolute" style={{
    top: '-20%', right: '-10%', width: '80%', height: '70%',
    backgroundColor: colors.accent, transform: 'rotate(-12deg)'
  }} />
  <div className="relative z-10">{/* 内容叠在色块上方 */}</div>
</div>
```

#### `card-mosaic` — 卡片马赛克（适合菜单/多商品/作品集）
```jsx
{/* 不等高卡片网格 */}
<div className="grid grid-cols-2 gap-4 px-6">
  <div className="row-span-2 rounded-2xl overflow-hidden">{/* 大卡片 */}</div>
  <div className="rounded-2xl overflow-hidden">{/* 小卡片 1 */}</div>
  <div className="rounded-2xl overflow-hidden">{/* 小卡片 2 */}</div>
</div>
```

---

### 七、统计数据（设计决策参考）

- 平均每个模板 **5 个内容区块**（中位数也是 5）
- 平均代码长度 **12,940 字符**
- **94.4%** 使用 `flex flex-col` 作为主布局（**注意：这是现状，不是目标。应积极尝试其他构图风格**）
- **86.7%** 使用阴影（shadow-md/lg/xl 最常见）
- **71.9%** 使用渐变背景
- **94.4%** 使用边框装饰
- **63.6%** 在代码顶部定义 `colors` 对象
- **58.3%** 使用 `.map()` 动态渲染列表
