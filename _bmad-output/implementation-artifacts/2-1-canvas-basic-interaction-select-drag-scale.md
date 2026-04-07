# Story 2.1: 画布基础交互——选中、拖拽与缩放

Status: done

## Story

As a 海报设计用户,
I want 在画布上自由选中、拖拽和缩放任意元素,
So that 我能像使用 PPT 一样直观地调整海报布局。

## Acceptance Criteria

1. **Given** Fabric.js 画布上已渲染海报元素 **When** 用户点击画布上的某个元素 **Then** 该元素被选中，显示选中框（selection handles）**And** 其他已选中元素取消选中
2. **Given** 用户已选中一个元素 **When** 用户按住鼠标拖拽该元素 **Then** 元素跟随鼠标移动，实时更新位置 **And** 拖拽过程流畅，无明显卡顿
3. **Given** 用户已选中一个元素 **When** 用户通过选中框角点拖拽缩放 **Then** 元素按比例缩放大小 **And** 缩放过程流畅，无明显卡顿
4. **Given** 用户点击画布空白区域 **When** 当前有元素被选中 **Then** 取消所有元素选中状态

## Tasks / Subtasks

- [x] Task 1: Fabric.js 画布交互配置 (AC: #1, #2, #3, #4)
  - [x] 在 `useFabricCanvas` hook 中配置 Fabric.js canvas 的交互选项
  - [x] 启用元素选中（selection: true）
  - [x] 启用拖拽移动（object.set({ selectable: true, evented: true })）
  - [x] 启用角点缩放（Fabric.js 默认支持，确认配置正确）
  - [x] 配置选中框样式（selection handles）
- [x] Task 2: 选中事件处理 (AC: #1, #4)
  - [x] 在 `useFabricCanvas` hook 中监听 `selection:created`、`selection:updated`、`selection:cleared` 事件
  - [x] 选中时更新 `useEditorStore` 中的 `selectedElementId`
  - [x] 取消选中时清除 `selectedElementId`
- [x] Task 3: 拖拽事件处理 (AC: #2)
  - [x] 监听 `object:moving` 事件（可选，用于实时反馈）
  - [x] 监听 `object:modified` 事件（拖拽完成后，用于生成 Command 对象——Story 2.4 实现）
- [x] Task 4: 缩放事件处理 (AC: #3)
  - [x] 监听 `object:scaling` 事件
  - [x] 确保按比例缩放（lockUniScaling: true 或通过 corner 配置）
  - [x] 监听 `object:modified` 事件（缩放完成后记录）
- [x] Task 5: 更新 useEditorStore (AC: #1, #4)
  - [x] 添加状态：`selectedElementId: string | null`
  - [x] 添加 action：`selectElement(id)`、`clearSelection()`

## Dev Notes

### 架构约束
- Fabric.js 事件监听统一在 `useFabricCanvas` hook 的 `useEffect` 中注册
- 不在组件中直接操作 Fabric.js canvas（通过 hook 封装）
- 拖拽/缩放完成后的 `object:modified` 事件将在 Story 2.4（命令模式）中用于生成 Command，本 Story 先注册事件但暂不创建 Command
- 画布操作需流畅无卡顿（NFR2）

### Fabric.js v7.2.x 特性
- 选中、拖拽、缩放为 Fabric.js 内置能力，配置即可使用
- 核心事件：`selection:created`、`selection:updated`、`selection:cleared`、`object:moving`、`object:modified`、`object:scaling`
- 画布初始化已在 Story 1.5 的 `useFabricCanvas` hook 中完成

### 依赖 Story 1.5 产物
- Fabric.js canvas 实例（通过 useFabricCanvas hook）
- CanvasPanel 组件
- 画布上已渲染的海报元素

### Project Structure Notes
```
features/editor/
├── hooks/useFabricCanvas.ts    # 添加选中/拖拽/缩放事件监听
└── stores/useEditorStore.ts    # 添加 selectedElementId
```

### References
- [Source: architecture.md#通信模式] — Fabric.js 事件 → Zustand 命令模式
- [Source: architecture.md#AI Agent强制规则] — 不在组件中直接操作 canvas
- [Source: epics.md#Story 2.1] — 完整验收标准

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)
### Debug Log References
### Completion Notes List
- Story 2.1 implemented: Fabric.js canvas interaction configuration for select, drag, and scale with event handling and store integration for selectedElementId.
### File List
- src/features/editor/hooks/useFabricCanvas.ts
- src/stores/useEditorStore.ts
