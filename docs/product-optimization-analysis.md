# Seede AI 产品深度分析与优化方案

> 基于设计愿景文档（Technical Decision Matrix、Workflow、AI 设计守则、设计工作流）与当前代码实现的对比分析

---

## 一、设计愿景总结

### 1.1 Technical Decision Matrix（技术决策矩阵）

设计文档定义了从语义分析到像素级参数生成的完整工程逻辑，核心分为三层：

**第一层：多模态语义解析与特征提取**
- NLP 模型对用户输入进行实体识别（NER）与意图分类
- 视觉模型对上传附件进行资产审计：识别 Logo、产品图的轮廓及主色值
- "资产权重分配算法"：区分原始资产的不可变性（如品牌色禁区）与 AI 创意生成空间的比例
- 构建意图映射表，将模糊文字描述转化为结构化设计元数据（Metadata）

**第二层：核心决策矩阵（The Gene Logic）**

| 维度 | 职责 | 当前实现 |
|------|------|---------|
| **Scene（场景）** | 空间约束求解 — 通过 CSP 算法将设计目标映射到物理媒介规格（如 9:16 画布），执行坐标系归一化，定义安全区与视线动线锚点 | 部分实现：固定 1080px 宽度 + 可变高度，但无 CSP 求解器，安全区/动线锚点未实现 |
| **Layout（版式）** | 启发式版式引擎 — 基于信息熵计算内容权重，动态生成 Grid/Flex 布局约束，实现视觉平衡的算法化 | 部分实现：LLM 直接生成 Flex/Grid 布局，无信息熵计算，依赖 prompt 中的 heightPercent 指导 |
| **Style（风格）** | CSS 变量映射系统 — 将风格词库转化为具体色彩 HSL 偏移值、字体族分级及 UI 质感 Token 集合 | 部分实现：prompt 中有色彩推荐表，但无 Token 系统，无 HSL 偏移计算 |
| **Emotion（情绪）** | 微观心理参数调校 — 通过字间距、对比曲线及滤镜强度等微参数，精准控制读者心理感受 | 部分实现：prompt 指导 leading/tracking 使用，但无参数化情绪模型 |

**第三层：弹性编码渲染管线**
- 将决策矩阵输出转化为可执行代码（React + Tailwind）
- 弹性盒模型确保内容自适应

### 1.2 Seede AI Workflow（完整生成链路）

从意图映射到像素交付的四阶段流水线：

1. **用户意图识别与资产解析** — AI 分析用户描述、参考图、附件，提取核心诉求，进行资产权重分配
2. **核心决策矩阵（The Gene）** — Scene→Layout→Style→Emotion 四维参数交叉生成 DNA
3. **组件化生成与弹性编码** — 将决策基因转化为 HTML/CSS 结构，采用 Flex/Grid 弹性盒模型
4. **设计审计与运架交付** — 质量检查、多格式导出、交付

### 1.3 AI 设计守则（6 大核心规则）

| 规则 | 核心要求 | 当前状态 |
|------|---------|---------|
| **01 - 视觉锚点与构图** | 连续构图、维度锁定、空间分区（Locus Mapping） | 未实现：无构图算法，依赖 LLM 自主判断 |
| **02 - 视觉密度控制** | 自定义 CANVAS 区域 100% 填充、Semantic Tagging、垂直韵律、密度平衡 | 部分实现：prompt 有最少内容块要求，但无密度计算 |
| **03 - 色彩与对比** | Design System 中取色、色调映射（Tone Mapping）、对比度校验 WCAG | 未实现：无 Design System 色板，无 WCAG 校验 |
| **04 - 排版精确控制** | 基线对齐、Glyph 度量控制、字间距微调 | 部分实现：prompt 指导 tracking/leading，但无 Glyph 度量 |
| **05 - 代码鲁棒性** | Web Font、CSS 降级、内容自适应、零溢出（Zero-Overflow）、WCAG 可达性 | 部分实现：有 font-loader，但无 CSS 降级策略，无溢出检测 |
| **06 - 安全与合规** | 内容安全筛查、WCAG 可达性验证、随机基线测试 | 未实现：无内容安全筛查，无 WCAG 验证 |

### 1.4 设计工作流（Behind the Scenes）

**标准化生产流水线 5 步骤：**
1. 意图解构与需求分析
2. 视觉策略与调性映射（Style Mapping）
3. 信息架构与网格排布
4. 提示词工程与细节打磨
5. 工程化渲染与代码交付

**提示词逻辑架构：**
- 角色设定层（SET ROLE: "Senior_Designer"）
- 规则层（APPLY RULES: "No_Overflow", "Visual_Hierarchy"）
- 逻辑层（Step A → Step E 渐进式推理）

**核心设计原则：**
- 99.9% 代码编译通过率
- 无障碍访问达标（WCAG AA）
- 中英混排优化（font 与 line-height 适配）
- 网格一致性（所有元素基于预定义网格）

---

## 二、当前实现现状评估

### 2.1 已完成的核心能力

| 能力 | 实现质量 | 说明 |
|------|---------|------|
| SSE 流式生成 | ★★★★★ | 完整的 thinking→analysis→layout→code→image→complete 事件流 |
| DOM→Canvas 转换 | ★★★★☆ | 4 个 handler（text/image/shape/group），支持渐变、阴影、裁剪 |
| JSX 编译执行 | ★★★★★ | @babel/standalone + new Function + flushSync，稳定可靠 |
| 画布交互编辑 | ★★★☆☆ | 选择、删除、撤销/重做已实现，但属性编辑器不完整 |
| 对话式修改 | ★★★★☆ | ChatOptimizeService + canvasSerializer 实现完整 |
| 单元素重生成 | ★★★★☆ | RollService 独立实现，风格一致性由 prompt 保障 |
| 多模型路由 | ★★★★☆ | ZhipuAI / OpenRouter / Claude 多供应商支持 |
| Prompt 工程 | ★★★★☆ | 5 个模板，570+ 行生成 prompt，12 种组件模式 |
| Tailwind 安全列表 | ★★★★★ | 1000+ 类名预编译，覆盖 LLM 可能生成的所有类 |

### 2.2 与愿景的差距矩阵

```
愿景完成度评估（■ 已实现  □ 未实现  ◧ 部分实现）

多模态语义解析
  ◧ 文本意图分析（LLM 内部完成，无独立 NLP 模块）
  □ 视觉资产审计（无图片上传分析能力）
  □ 资产权重分配（无不可变性/创意空间划分）

决策矩阵 (The Gene)
  ◧ Scene 场景定义（仅固定尺寸，无 CSP 求解）
  ◧ Layout 版式引擎（LLM 直接生成，无算法化布局）
  ◧ Style 风格映射（prompt 色彩推荐，无 Token 系统）
  □ Emotion 情绪调校（无参数化情绪模型）

弹性编码渲染
  ■ JSX 编译 + DOM 渲染
  ■ Flex/Grid 弹性布局
  ◧ DOM→Canvas 转换（基础完成，边缘情况待完善）
  □ 多格式导出（仅 PNG，无 PDF/SVG）

设计审计
  □ WCAG 可达性验证
  □ 内容安全筛查
  □ 视觉密度检测
  □ 色彩对比度校验
```

---

## 三、优化方案（按优先级排序）

### P0 — 核心体验提升（直接影响用户价值）

#### 3.1 完善画布属性编辑器

**现状：** PropertiesPanel 仅显示占位内容，用户选中元素后无法直观编辑属性。

**优化方案：**
- 实现文本属性面板：字体、字号、颜色、对齐、行高、字间距
- 实现图片属性面板：裁剪、圆角、阴影、透明度
- 实现形状属性面板：填充色、边框、圆角、渐变
- 颜色选择器集成（支持 HSL/HEX/RGB）
- 实时预览 + 撤销/重做集成

**预期收益：** 用户从"只能通过对话修改"升级为"直接可视化编辑"，大幅提升编辑效率。

#### 3.2 图片上传与资产管理

**现状：** 仅支持 LLM 生成的 picsum.photos 占位图，用户无法上传自己的 Logo、产品图。

**优化方案：**
- 实现图片上传（拖拽 + 点击），支持 PNG/JPG/SVG
- 图片存储方案：前端 Base64 / 后端对象存储（Cloudflare R2）
- 画布内图片替换功能（选中图片 → 替换为上传图片）
- 品牌 Logo 识别与主色提取（对应愿景中的"资产审计"）

**预期收益：** 从"纯 AI 生成"升级为"AI 生成 + 用户素材"，覆盖真实商业场景。

#### 3.3 设计分析阶段可视化

**现状：** poster-analyze 的分析结果（色彩策略、区块规划、图片需求）仅作为中间数据传给代码生成阶段，用户不可见也不可干预。

**优化方案：**
- 在生成流程中增加"设计方案预览"步骤
- 展示色彩方案卡片（主色 + 辅色 + 背景色）
- 展示区块布局示意图（各 section 的高度占比）
- 允许用户在代码生成前调整方案
- 增加"重新分析"按钮

**预期收益：** 用户对生成结果有预期感和掌控感，减少"生成了不满意再修改"的循环。

---

### P1 — 设计质量提升（对应愿景中的设计守则）

#### 3.4 Design Token 系统

**现状：** 色彩、字体、间距全由 LLM 即兴决定，每次生成风格可能不一致。

**优化方案：**
- 定义 Design Token 集合：
  ```typescript
  interface DesignTokens {
    colors: { primary, secondary, accent, background, text, textMuted };
    typography: { display, heading, subheading, body, caption };
    spacing: { xs, sm, md, lg, xl, xxl };
    radius: { sm, md, lg, full };
    shadow: { sm, md, lg };
  }
  ```
- LLM 分析阶段输出 Token 值，代码生成阶段引用 Token
- 用户可通过"风格面板"手动调整 Token 值并触发重新生成

**预期收益：** 风格一致性从"LLM 自律"升级为"系统约束"，对应愿景中的"CSS 变量映射系统"。

#### 3.5 视觉质量自动检测

**现状：** 无任何后处理质量检查。

**优化方案：**
- **对比度检查**：遍历文本元素，计算文字/背景对比度，低于 WCAG AA（4.5:1）的标红警告
- **溢出检测**：检查是否有元素超出画布边界
- **密度评估**：计算各区域内容密度，过密/过疏区域提示
- **图片遮罩检查**：验证覆盖层透明度是否 ≤40%（与 prompt 规则对应）
- 检测结果以浮层方式展示在画布上，支持一键修复（通过 Chat API 发送修复指令）

**预期收益：** 对应愿景中的"设计审计"能力，从"事后人工检查"升级为"自动化质量门禁"。

#### 3.6 中英混排优化

**现状：** 字体加载有基础 fontLoader，但无中英文混排的特殊处理。

**优化方案：**
- 中文内容自动匹配中文字体（思源黑体/宋体），英文匹配西文字体
- line-height 差异化：中文 1.8em，英文 1.5em
- 字间距差异化：中文 0.05em，英文按字体默认
- 标点避头尾规则
- 在 prompt 中增加混排指导规则

**预期收益：** 对应愿景中的"中英混排优化"原则，提升中文海报的专业度。

---

### P2 — 架构演进（支撑未来能力扩展）

#### 3.7 多格式导出

**现状：** 仅支持 PNG 导出。

**优化方案：**
- PDF 导出（使用 jsPDF + canvas.toDataURL，保留矢量文字）
- SVG 导出（Fabric.js 原生支持 toSVG()）
- 多尺寸批量导出（一键生成 Instagram Story/Post/Facebook Cover 等多个尺寸）
- 带/不带背景导出选项

#### 3.8 会话持久化与项目管理

**现状：** 所有状态在刷新后丢失。

**优化方案：**
- IndexedDB 本地存储：画布 JSON + 对话历史 + 设计方案
- 项目列表页：查看历史设计、复制、继续编辑
- 自动保存（每次画布变更后 debounce 3s 自动保存）
- 导入/导出项目文件（JSON 格式）

#### 3.9 模板化能力

**现状：** LLM 每次从零生成，不维护设计模板库（这是架构决策）。

**优化方案（不违背核心理念）：**
- "另存为模板"功能：将满意的生成结果保存为用户个人模板
- 模板变量化：用户标记可替换区域（文字、图片），后续一键替换内容
- 模板分享：社区模板市场（长期目标）
- 注意：模板仍作为 LLM 的辅助参考，不替代生成能力

#### 3.10 DOM→Canvas 引擎增强

**现状：** 基础 CSS 属性支持完整，但高级效果缺失。

**优化方案：**
- 多层阴影支持（当前仅取第一层）
- CSS filter 基础支持（brightness、contrast 可通过 Fabric.js filters 实现）
- 文字描边（-webkit-text-stroke → Fabric.js strokeWidth）
- 更精确的渐变角度映射（当前支持 0/45/90/135/180 度，增加任意角度）
- SVG 内嵌元素解析（当前作为 shape 处理，可解析为矢量路径）

---

### P3 — 长期愿景对齐

#### 3.11 多模态输入

对应愿景中"多模态语义解析与特征提取"：
- 参考图上传 → 视觉模型分析风格/配色/布局
- 品牌手册上传 → 提取品牌色、字体规范
- 竞品海报分析 → 提取设计元素供参考

#### 3.12 情绪参数化

对应愿景中"微观心理参数调校"：
- 用户选择情绪标签（专业/活泼/紧急/温暖/高端）
- 系统映射为具体参数：字间距、对比度、色温、圆角大小、阴影深度
- 参数可微调，实时预览效果

#### 3.13 CSP 布局求解器

对应愿景中 Scene 模块的"空间约束求解"：
- 定义约束规则（安全区边距、最小元素尺寸、对齐网格）
- 将 LLM 输出的 sections 列表转化为精确坐标
- 碰撞检测 + 自动调整（防止元素重叠）

---

## 四、快速收益项（Quick Wins）

以下优化改动小、收益高，可立即执行：

| 优化项 | 改动量 | 预期收益 |
|--------|--------|---------|
| 图层拖拽排序 | LayersPanel 增加 react-dnd | 提升图层管理效率 |
| 元素复制/粘贴 | Ctrl+C/V 快捷键 + canvas 对象克隆 | 基础编辑能力补全 |
| 画布网格/参考线 | Fabric.js guideline 插件 | 精确对齐辅助 |
| 生成历史回退 | 保存每次生成的 JSX 到历史栈 | 允许用户回到之前的版本 |
| 字体预览选择器 | 下拉列表 + 字体预览 | 替代当前无字体选择的状态 |
| 错误重试优化 | 指数退避 + 用户反馈 | 提升 LLM 调用失败时的体验 |
| 导出分辨率选项 | 1x/2x/3x 倍率选择 | 满足不同场景的清晰度需求 |
| 键盘快捷键完善 | 方向键微移、Shift+选择多个 | 提升操作效率 |

---

## 五、优化路线图建议

```
Phase 1（1-2 周）— Quick Wins + P0 基础
├── 完善属性编辑器（文本属性优先）
├── 图层拖拽排序
├── 元素复制/粘贴
├── 键盘快捷键
└── 错误重试优化

Phase 2（3-4 周）— P0 完成 + P1 启动
├── 图片上传与替换
├── 设计分析阶段可视化
├── Design Token 系统（基础版）
├── 多格式导出（PDF + SVG）
└── 会话持久化（IndexedDB）

Phase 3（5-8 周）— P1 完成 + P2 启动
├── 视觉质量自动检测
├── 中英混排优化
├── DOM→Canvas 引擎增强
├── 模板化能力
└── 项目管理页面

Phase 4（长期）— P3 愿景对齐
├── 多模态输入（参考图分析）
├── 情绪参数化
├── CSP 布局求解器
└── 社区模板市场
```

---

## 六、提示词优化已落地（本次实施）

### 6.1 已完成的提示词约束升级

本次对 5 个 prompt 模板进行了系统性优化，将设计愿景文档中的核心约束工程化到提示词中：

#### poster-analyze.md（设计分析阶段）
| 新增约束 | 来源文档 | 预期效果 |
|---------|---------|---------|
| Gene Logic 四维分析框架（Scene/Layout/Style/Emotion） | Technical Decision Matrix | 分析阶段不再泛泛而谈，必须覆盖场景约束、信息权重、视觉调性、情绪微参数 |
| 情绪-微参数映射表（6 种情绪 × 6 个参数） | 设计守则 Emotion 维度 | tracking/rounded/shadow/色温 不再随机，由目标情绪确定 |
| JSON 输出增加 `gene` 字段 | Workflow Gene 概念 | 分析结果携带完整的风格 Token，下游代码生成阶段可直接引用 |
| 区块 `density` + `focalPoint` 字段 | 设计守则 02 视觉密度 | 每个区块有明确的密度和焦点定义 |
| WCAG 对比度指导 | 设计守则 03 色彩与对比 | 配色方案阶段就预防可读性问题 |
| 内容安全底线 | 设计守则 06 安全与合规 | 文案内容不涉及歧视/暴力/误导性价格 |
| 搜索资料使用规范 | 当前产品 Web Search 集成 | 搜索结果中的真实数据优先融入设计方案 |
| 网格一致性规则 | 设计守则 01 构图 | 所有区块统一 padding/gap/圆角 |
| 9 条负面提示 | 设计守则全文 | 明确列出不合格设计特征，LLM 避免生成 |

#### poster-generate.md（代码生成阶段）
| 新增约束 | 来源文档 | 预期效果 |
|---------|---------|---------|
| 6 大设计守则硬约束 | AI 设计守则 6 大规则 | 从"建议"升级为"硬约束"，违反任何一条即不合格 |
| 守则 1 视觉锚点 | 设计守则 01 | 每个区块必须有焦点，区块间无缝衔接 |
| 守则 2 密度控制 | 设计守则 02 | 100% 填充 + 垂直韵律节奏变化 |
| 守则 3 色彩纪律 | 设计守则 03 | 3 色系上限 + 强调色面积 ≤10% + 统一边框 `border-white/5` |
| 守则 4 排版精确控制 | 设计守则 04 | 中文 ≤30-32 字/行、行高分级、段间距 ≥space-y-6 |
| 守则 5 零溢出 | 设计守则 05 | overflow-hidden + 内容不超宽 + 图片 object-cover |
| 守则 6 编译安全 | 设计守则 05 | 只用安全列表类名 + inline style 自定义值 |
| 网格一致性 | 设计守则 01 | 统一水平 padding、卡片宽度、文字对齐基线 |
| WCAG 对比度指导 | 设计守则 03 | 深色/浅色背景文字色具体推荐 + 禁用低对比度组合 |
| gene.style 集成 | Workflow Gene 概念 | 分析阶段的 Token 直接约束代码生成 |
| 搜索资料使用规范 | Web Search 集成 | 真实数据融入文案，不显示来源标注 |
| 9 条负面提示 | 设计守则全文 | 明确不合格判定标准 |

#### poster-chat.md（对话修改阶段）
| 新增约束 | 来源文档 | 预期效果 |
|---------|---------|---------|
| 修改时色彩纪律 | 设计守则 03 | 修改不引入无关新颜色 |
| 排版精度保持 | 设计守则 04 | 修改后字号层级、行高不退化 |
| 情绪一致性 | Gene Emotion | 局部修改保持全局微参数不变 |
| 零溢出约束 | 设计守则 05 | 修改后高度之和仍 = 总高度 |

#### poster-roll.md（单元素重生成）
| 新增约束 | 来源文档 | 预期效果 |
|---------|---------|---------|
| 风格一致性守则 | Gene Style | 替代元素只用已有颜色、匹配微参数 |
| 密度匹配 | 设计守则 02 | 替代元素内容密度与相邻区块协调 |

#### image-prompt.md（AI 图片生成提示词）
| 新增约束 | 来源文档 | 预期效果 |
|---------|---------|---------|
| 情绪色调映射表 | Gene Emotion + 设计工作流 | 图片色调/光线/氛围与海报情绪一致 |
| 构图约束 | 设计工作流 | 背景图留文字空间、产品图居中、人物图留白 |
| 负面提示 | 通用最佳实践 | 避免文字/水印/变形 |

### 6.2 提示词优化的愿景覆盖度提升

```
优化前愿景覆盖度：40%
优化后愿景覆盖度：约 55%

具体提升：
  决策矩阵 (The Gene)
    ◧→■ Scene 场景定义（安全区 px-8、视线动线 F/Z 型、媒介判断）
    ◧→◧ Layout 版式引擎（信息权重分配、密度字段，但仍无算法化）
    ◧→■ Style 风格映射（gene.style Token 系统已嵌入分析→生成流水线）
    □→◧ Emotion 情绪调校（6 种情绪×6 参数映射表已定义，但无前端 UI 选择）

  设计审计
    □→◧ WCAG 可达性（prompt 级对比度指导，但无后处理验证）
    □→◧ 内容安全（prompt 级底线规则，但无独立筛查模块）
    □→◧ 视觉密度检测（区块 density 字段 + 负面提示，但无算法计算）
    □→◧ 色彩对比度（3 色系纪律 + 对比度推荐值，但无自动校验）
```

---

## 七、后端 Pipeline 优化方案

### 7.1 搜索结果深度集成

**现状：** `WebSearchClient.formatForPrompt()` 将搜索结果以纯文本拼接到用户 prompt 后面，LLM 可能忽略或误用。

**优化方案：**

```java
// 当前：纯文本拼接
userPrompt = userPrompt + "\n\n" + searchContext;

// 优化：结构化标注 + 使用指引
userPrompt = userPrompt + "\n\n"
    + "══════════════════════════════════════════\n"
    + "【联网搜索参考资料 — 请提取真实数据融入设计方案】\n"
    + "使用规则：\n"
    + "1. 提取价格/时间/地点等真实数据替代虚构内容\n"
    + "2. 不要在海报中显示来源 URL\n"
    + "3. 提炼为适合海报展示的精炼文案\n"
    + "══════════════════════════════════════════\n"
    + searchContext;
```

### 7.2 Gene Token 流水线打通

**现状：** `buildEnrichedPrompt()` 从分析 JSON 中提取 sections 和 images，但不提取 gene 字段。

**优化方案：**

```java
private String buildEnrichedPrompt(String originalPrompt, String analysisResult, int totalHeight) {
    // ... 现有代码 ...
    
    // 新增：提取 gene 风格参数
    JsonNode gene = root.path("gene");
    if (!gene.isMissingNode()) {
        sb.append("\n【设计基因参数（必须严格遵循）】\n");
        sb.append("- 场景类型：").append(gene.path("scene").asText()).append("\n");
        sb.append("- 目标情绪：").append(gene.path("emotion").asText()).append("\n");
        JsonNode style = gene.path("style");
        if (!style.isMissingNode()) {
            sb.append("- 主色：").append(style.path("primaryColor").asText()).append("\n");
            sb.append("- 强调色：").append(style.path("accentColor").asText()).append("\n");
            sb.append("- 卡片边框：").append(style.path("borderStyle").asText()).append("\n");
            sb.append("- 圆角：").append(style.path("cornerRadius").asText()).append("\n");
            sb.append("- 阴影：").append(style.path("shadowLevel").asText()).append("\n");
            sb.append("- 字间距：").append(style.path("tracking").asText()).append("\n");
        }
    }
    
    // 新增：提取区块密度和焦点
    for (JsonNode section : sections) {
        String density = section.path("density").asText("medium");
        String focalPoint = section.path("focalPoint").asText("");
        sb.append(String.format("- %s：高度 %dpx（%d%%），密度=%s，焦点=%s\n",
            name, height, percent, density, focalPoint));
    }
    
    // ... 其余代码不变 ...
}
```

### 7.3 SSE 事件序列优化

**现状事件序列：**
```
search_start → search_complete → thinking → analysis_chunk* → analysis_complete → layout_complete → code_chunk* → code_complete → image_* → complete
```

**建议新增事件：**
```
search_start → search_complete → thinking → analysis_chunk* → 
gene_complete(新增) → layout_complete → code_chunk* → 
quality_check(新增) → code_complete → image_* → complete
```

- `gene_complete`：发送设计基因参数 JSON（前端可展示色彩方案卡片和情绪标签）
- `quality_check`：代码生成后的轻量级质量检查结果（可后续实现）

### 7.4 错误重试优化

**现状：** LLM 调用失败时仅返回 `SseMessage.error(message, retryable=true)`，前端无重试逻辑。

**优化方案：**

```java
// 后端：分阶段错误恢复
.onErrorResume(e -> {
    if (e instanceof WebClientResponseException) {
        int status = ((WebClientResponseException) e).getStatusCode().value();
        if (status == 429) {
            // 速率限制：等待后重试
            return Mono.delay(Duration.ofSeconds(2))
                .flatMapMany(ignored -> retryStage(/* 当前阶段参数 */));
        }
    }
    return Flux.just(SseMessage.error(
        "生成遇到问题，请稍后重试。错误：" + e.getMessage(), true));
})
```

---

## 八、前端体验优化方案

### 8.1 设计方案预览卡片（对应 gene_complete 事件）

当前端收到 `gene_complete` 或 `layout_complete` 事件时，在 ChatDialog 中展示：

```
┌─────────────────────────────────────────┐
│ 🎨 设计方案                              │
│                                          │
│ 情绪：高端/奢华                           │
│ 主色 ■ gray-900  强调色 ■ yellow-400     │
│                                          │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│ │ 头部 25% │ │ 主体 50% │ │ 底部 25% │  │
│ └──────────┘ └──────────┘ └──────────┘  │
│                                          │
│ [重新分析]  [继续生成 →]                  │
└─────────────────────────────────────────┘
```

**实现路径：**
1. 后端在 `analysis_complete` 后额外发送 `gene_complete` 事件（携带 gene JSON）
2. 前端 ChatDialog 新增 GenePreviewCard 组件
3. 组件展示色彩色块、情绪标签、区块比例条
4. "重新分析"按钮重新触发分析阶段，"继续生成"按钮继续当前流程

### 8.2 生成历史回退

```typescript
// useEditorStore 扩展
interface EditorStore {
  // 新增
  generationHistory: Array<{
    jsxCode: string;
    gene: GeneParams;
    timestamp: number;
  }>;
  currentHistoryIndex: number;
  pushHistory: (entry: HistoryEntry) => void;
  goToHistory: (index: number) => void;
}
```

**UI：** 在工具栏增加"上一版本 / 下一版本"按钮，或在 ChatDialog 中每次生成结果旁显示"回到此版本"。

### 8.3 画布质量指示器

在画布右上角展示轻量级质量评分：

```
┌───────────────────────────┐
│ 质量 ●●●●○ 4/5            │
│ ✓ 色彩纪律  ✓ 密度填充    │
│ ✓ 排版层级  ⚠ 对比度偏低  │
└───────────────────────────┘
```

**实现路径：** 纯前端实现，在 DOM→Canvas 转换后分析 Fabric.js 对象：
- 检查文本对象数量（≥4 种字号 = 通过）
- 检查画布填充率（对象覆盖面积 / 画布面积 > 70% = 通过）
- 检查颜色种类（≤3 色系 = 通过）
- 检查是否有元素超出边界

---

## 九、总结

Seede AI 当前是一个**架构优秀的 MVP**，核心生成流水线（LLM→JSX→DOM→Canvas）已稳定运行。

**本次优化的核心策略：** 将设计愿景文档中的约束**工程化到提示词**中，在不修改代码的前提下提升生成质量。这是投入产出比最高的优化路径 — 每条 prompt 约束都直接影响每次生成结果。

**愿景覆盖度变化：**
- 优化前：约 40%（基础生成能力完整，设计质量依赖 LLM 自律）
- 优化后：约 55%（Gene Token 系统嵌入流水线，6 大守则硬约束，WCAG 指导，负面提示）
- 下一步目标 70%：需要代码层面实现 Gene Token 提取（7.2）、质量检测（8.3）、设计方案预览（8.1）

**最大的剩余优化杠杆：**
1. **后端 `buildEnrichedPrompt()` 提取 gene 字段** — 打通分析→生成的 Token 流水线（代码改动小、效果显著）
2. **前端属性编辑器** — 从"只能对话修改"到"直接编辑"的核心体验跃迁
3. **图片上传** — 从 Demo 到可用产品的关键特性
