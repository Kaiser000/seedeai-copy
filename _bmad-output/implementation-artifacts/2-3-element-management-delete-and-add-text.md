# Story 2.3: 元素管理——删除与添加文字

Status: done

## Story

As a 海报设计用户,
I want 删除不需要的元素并添加新的文字,
So that 我能自由组合海报内容，不受 AI 生成结果的限制。

## Acceptance Criteria

1. **Given** 用户已选中画布上的一个元素 **When** 用户按 Delete 键或点击工具栏删除按钮 **Then** 选中的元素从画布上移除 **And** 画布上其他元素不受影响
2. **Given** 用户在编辑器页面 **When** 用户点击工具栏的"添加文字"按钮 **Then** 画布中央添加一个新的默认文字元素（如"双击编辑文字"）**And** 新元素使用当前画布的中文字体 **And** 新元素自动被选中，用户可立即拖拽或双击编辑

## Tasks / Subtasks

- [x] Task 1: 删除元素——键盘 Delete (AC: #1)
  - [x] 在 `useFabricCanvas` hook 中监听键盘 Delete / Backspace 事件
  - [x] 检查当前是否有选中元素且不在文字编辑模式（编辑模式下 Delete 用于删字符）
  - [x] 调用 `canvas.remove(activeObject)` 移除选中元素
  - [x] 清除 `useEditorStore.selectedElementId`
- [x] Task 2: 删除元素——工具栏按钮 (AC: #1)
  - [x] 在 `Toolbar.tsx` 添加删除按钮（shadcn/ui Button + Trash 图标）
  - [x] 仅当有元素选中时按钮可用
  - [x] 点击后执行与 Delete 键相同的删除逻辑
- [x] Task 3: 添加文字元素 (AC: #2)
  - [x] 在 `Toolbar.tsx` 添加"添加文字"按钮
  - [x] 点击后在画布中央创建新的 `fabric.Textbox`
  - [x] 默认文字内容："双击编辑文字"
  - [x] 使用中文字体（AlibabaPuHuiTi 或 NotoSansSC，取决于 fontLoader 已加载的字体）
  - [x] 新元素默认样式：合理的字号（如 24）、黑色文字
- [x] Task 4: 新元素自动选中 (AC: #2)
  - [x] 创建新文字元素后，调用 `canvas.setActiveObject(newTextbox)` 自动选中
  - [x] 更新 `useEditorStore.selectedElementId`
  - [x] 用户可立即拖拽或双击编辑

## Dev Notes

### 架构约束
- 删除和添加操作都需要在 Story 2.4 中记录为 Command（可撤销）。本 Story 先实现功能逻辑，Command 记录在 2.4 中补充
- 键盘事件需区分：文字编辑模式下 Delete 删字符，非编辑模式下 Delete 删元素
- 新增文字元素的字体必须使用已加载的中文字体（Story 1.5 fontLoader 加载的字体）

### 依赖 Story 2.1/2.2 产物
- 元素选中机制
- Toolbar 组件基础结构
- useFabricCanvas hook

### Project Structure Notes
```
features/editor/
├── components/Toolbar.tsx        # 添加删除按钮和"添加文字"按钮
└── hooks/useFabricCanvas.ts      # 添加 Delete 键盘事件监听
```

### References
- [Source: architecture.md#完整项目目录结构] — Toolbar.tsx
- [Source: architecture.md#AI Agent强制规则] — 画布操作必须通过命令模式确保可撤销
- [Source: epics.md#Story 2.3] — 完整验收标准

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)
### Debug Log References
### Completion Notes List
- Story 2.3 implemented: Delete element via keyboard Delete key and toolbar button, add new text element with Chinese font support and auto-selection.
### File List
- src/features/editor/hooks/useFabricCanvas.ts
- src/features/editor/components/Toolbar.tsx
