# Story 2.2: 文字编辑——内容修改与样式调整

Status: done

## Story

As a 海报设计用户,
I want 双击文字直接修改内容，并能调整颜色和字号,
So that 我能精确控制海报上的文字信息和视觉效果。

## Acceptance Criteria

1. **Given** 画布上有一个文字元素（fabric.Textbox）**When** 用户双击该文字元素 **Then** 进入文字编辑模式，光标出现在点击位置 **And** 用户可以直接输入、删除、修改文字内容 **And** 中文输入法正常工作
2. **Given** 用户正在编辑文字 **When** 用户点击画布其他区域或按 Escape 键 **Then** 退出文字编辑模式，保留修改后的内容
3. **Given** 用户选中一个文字元素（非编辑模式）**When** 用户通过工具栏修改颜色 **Then** 文字颜色立即更新为选择的颜色
4. **Given** 用户选中一个文字元素（非编辑模式）**When** 用户通过工具栏修改字号 **Then** 文字字号立即更新，元素大小相应调整

## Tasks / Subtasks

- [x] Task 1: 文字双击编辑 (AC: #1)
  - [x] 在 `useFabricCanvas` hook 中配置 fabric.Textbox 的双击进入编辑模式
  - [x] Fabric.js 原生支持 Textbox 双击编辑，确保 `editable: true`
  - [x] 验证中文输入法（IME）在编辑模式下正常工作
- [x] Task 2: 退出编辑模式 (AC: #2)
  - [x] 监听 `mouse:down` 事件，点击非当前编辑元素时退出编辑模式
  - [x] 监听键盘 Escape 事件退出编辑模式
  - [x] 退出时保留修改后的文字内容
- [x] Task 3: Toolbar 组件——颜色选择 (AC: #3)
  - [x] 在 `features/editor/components/Toolbar.tsx` 添加颜色选择功能
  - [x] 使用 shadcn/ui 的 Input（type="color"）或自定义颜色选择器
  - [x] 选中文字元素后可用，修改 `fabric.Textbox.fill` 属性
  - [x] 颜色修改立即生效，canvas.renderAll() 刷新显示
- [x] Task 4: Toolbar 组件——字号修改 (AC: #4)
  - [x] 在 Toolbar 添加字号输入/选择功能
  - [x] 修改 `fabric.Textbox.fontSize` 属性
  - [x] 字号修改后元素大小自动调整
- [x] Task 5: Toolbar 状态联动 (AC: #3, #4)
  - [x] Toolbar 根据 `useEditorStore.selectedElementId` 显示/隐藏样式编辑功能
  - [x] 仅当选中的是文字元素时才显示颜色和字号编辑
  - [x] 选中时回显当前文字的颜色和字号

## Dev Notes

### 架构约束
- Toolbar 组件位于 `features/editor/components/Toolbar.tsx`
- 样式修改通过 Fabric.js API 直接操作，之后调用 `canvas.renderAll()`
- 所有编辑操作最终需要记录为 Command（Story 2.4 实现），本 Story 先实现交互逻辑
- 使用 shadcn/ui 组件构建 Toolbar UI
- 禁止在组件中直接操作 canvas（通过 useFabricCanvas hook 或 store action）

### Fabric.js 文字编辑
- `fabric.Textbox` 内置双击编辑支持，设置 `editable: true` 即可
- 编辑模式事件：`editing:entered`、`editing:exited`
- 中文 IME 在 Fabric.js Textbox 中可能需要特殊处理——注意测试

### 依赖 Story 2.1 产物
- 元素选中机制（selectedElementId）
- useFabricCanvas hook 事件监听基础

### Project Structure Notes
```
features/editor/
├── components/Toolbar.tsx        # 添加颜色选择器和字号修改
└── hooks/useFabricCanvas.ts      # 添加文字编辑事件处理
```

### References
- [Source: architecture.md#完整项目目录结构] — Toolbar.tsx 位置
- [Source: architecture.md#AI Agent强制规则] — 不在组件中直接操作 canvas
- [Source: epics.md#Story 2.2] — 完整验收标准

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)
### Debug Log References
### Completion Notes List
- Story 2.2 implemented: Double-click text editing with IME support, Toolbar with color picker and font size controls, and toolbar state linked to selected element.
### File List
- src/features/editor/hooks/useFabricCanvas.ts
- src/features/editor/components/Toolbar.tsx
