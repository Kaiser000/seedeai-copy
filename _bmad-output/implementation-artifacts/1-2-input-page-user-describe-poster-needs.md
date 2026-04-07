# Story 1.2: 输入页——用户描述海报需求

Status: done

## Story

As a 海报设计用户,
I want 在输入页通过自然语言描述我想要的海报内容，并选择海报尺寸,
So that 系统能理解我的设计意图并据此生成海报。

## Acceptance Criteria

1. **Given** 用户访问应用首页（输入页）**When** 页面加载完成 **Then** 显示一个多行文本输入区域，placeholder 提示用户输入海报描述（如"五一劳动节促销海报，主标题..."）
2. **And** 显示海报尺寸选择下拉组件，包含至少 3 种预设尺寸（如 1080×1920 竖版海报、1080×1080 方形、1920×1080 横版）
3. **And** 显示预设案例入口，点击可将预设描述填充到输入框中
4. **Given** 用户已输入海报描述并选择尺寸 **When** 用户点击"生成"按钮 **Then** 页面切换到编辑器页，传递用户输入的描述文本和选择的尺寸参数
5. **Given** 用户未输入任何描述 **When** 用户点击"生成"按钮 **Then** 显示提示信息，要求用户输入海报描述，不触发页面切换

## Tasks / Subtasks

- [x] Task 1: InputPage 主组件 (AC: #1)
  - [x] 创建 `features/input/InputPage.tsx` 主布局组件
  - [x] 使用 shadcn/ui 组件构建界面
- [x] Task 2: PromptInput 组件 (AC: #1)
  - [x] 创建 `features/input/components/PromptInput.tsx`
  - [x] 多行文本输入区域（shadcn/ui Textarea）
  - [x] Placeholder 示例文本："五一劳动节促销海报，主标题..."
- [x] Task 3: SizeSelector 组件 (AC: #2)
  - [x] 创建 `features/input/components/SizeSelector.tsx`
  - [x] shadcn/ui Select 下拉组件
  - [x] 预设尺寸：1080×1920（竖版海报）、1080×1080（方形）、1920×1080（横版）
  - [x] 定义 `PosterSize` 类型：`{ width: number, height: number, label: string }`
- [x] Task 4: PresetCases 组件 (AC: #3)
  - [x] 创建 `features/input/components/PresetCases.tsx`
  - [x] 至少 2-3 个预设案例（促销海报、活动通知、品牌宣传等）
  - [x] 点击预设案例将描述填充到 PromptInput
- [x] Task 5: 生成按钮与页面切换 (AC: #4, #5)
  - [x] 生成按钮（shadcn/ui Button）
  - [x] 点击时校验输入不为空（AC #5）
  - [x] 通过 `useEditorStore` 的 action 切换到编辑器页
  - [x] 传递 prompt 文本和 posterSize 到 store
- [x] Task 6: 更新 useEditorStore (AC: #4)
  - [x] 添加状态：`prompt: string`、`posterSize: PosterSize`
  - [x] 添加 action：`startGeneration(prompt, posterSize)` — 设置 prompt/posterSize 并切换 currentPage 到 'editor'

## Dev Notes

### 架构约束
- 本组件属于 `features/input/` 功能模块
- 使用 shadcn/ui 组件库（基于 Radix UI + Tailwind CSS）
- 通过 Zustand store（`useEditorStore`）管理页面切换和数据传递，不用 props drilling
- 禁止从 `features/input/` import `features/editor/` 或 `features/generation/` 的组件（类型和 store 允许）

### UI 信息架构
- 文本输入区（核心交互）
- 尺寸选择下拉（FR14 海报尺寸）
- 预设案例入口（预填充输入框，引导零经验用户）
- 生成按钮

### 依赖 Story 1.1 产物
- `useEditorStore` 基础结构
- shadcn/ui 已初始化
- 项目结构已搭建

### Project Structure Notes
```
src/features/input/
├── InputPage.tsx          # 主组件
└── components/
    ├── PromptInput.tsx    # 文本输入
    ├── SizeSelector.tsx   # 尺寸选择
    └── PresetCases.tsx    # 预设案例
```

### References
- [Source: architecture.md#输入页信息架构] — 输入页组件清单
- [Source: architecture.md#完整项目目录结构] — features/input/ 结构
- [Source: epics.md#Story 1.2] — 完整验收标准
- [Source: prd.md#用户旅程] — 小美和小李的使用场景

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)
### Debug Log References
### Completion Notes List
- Story 1.2 implemented: InputPage with PromptInput, SizeSelector, PresetCases components, and generation button with validation and store integration.
### File List
- src/features/input/InputPage.tsx
- src/features/input/components/PromptInput.tsx
- src/features/input/components/SizeSelector.tsx
- src/features/input/components/PresetCases.tsx
- src/stores/useEditorStore.ts
