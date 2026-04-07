# Story 2.4: 撤销与重做——命令模式实现

Status: done

## Story

As a 海报设计用户,
I want 随时撤销和重做我的编辑操作,
So that 我可以大胆尝试修改而不担心犯错无法恢复。

## Acceptance Criteria

1. **Given** 用户在画布上执行了编辑操作（拖拽、缩放、文字编辑、样式修改、删除、添加）**When** 每次操作执行时 **Then** 系统生成对应的 Command 对象（包含 `execute()` 和 `undo()` 方法）**And** Command 压入 Zustand 管理的撤销栈 **And** 重做栈被清空
2. **Given** 撤销栈中有操作记录 **When** 用户按 Ctrl+Z 或点击撤销按钮 **Then** 最近一次操作被撤销，画布恢复到操作前的状态 **And** 被撤销的 Command 移入重做栈 **And** 撤销操作即时响应，无感知延迟
3. **Given** 重做栈中有操作记录 **When** 用户按 Ctrl+Shift+Z 或点击重做按钮 **Then** 最近一次被撤销的操作重新执行 **And** 重做的 Command 移回撤销栈
4. **Given** 撤销栈已满（达到最大深度 50）**When** 用户执行新的编辑操作 **Then** 最早的 Command 被丢弃，新 Command 入栈，栈深度保持 50
5. **Given** 撤销栈为空 **When** 用户尝试撤销 **Then** 撤销按钮呈禁用状态，无任何操作
6. **Given** 命令模式已实现 **When** 运行 `useCanvasCommands.test.ts` 单元测试 **Then** 撤销/重做的正向操作、边界条件（空栈、满栈）测试全部通过

## Tasks / Subtasks

- [x] Task 1: Command 接口定义 (AC: #1)
  - [x] 定义 Command 接口：`{ execute(): void, undo(): void, description: string, timestamp: number }`
  - [x] 放置在 `features/editor/` 合适位置（如 types 或 hooks 文件内）
- [x] Task 2: 各操作的 Command 实现 (AC: #1)
  - [x] MoveCommand：记录移动前后的 left/top 坐标
  - [x] ScaleCommand：记录缩放前后的 scaleX/scaleY/width/height
  - [x] TextEditCommand：记录编辑前后的文字内容
  - [x] StyleChangeCommand：记录修改前后的样式属性（颜色、字号等）
  - [x] DeleteCommand：记录被删除的元素及其属性，undo 时重新添加
  - [x] AddCommand：记录新增的元素，undo 时移除
- [x] Task 3: useCanvasCommands Hook (AC: #1, #2, #3, #4, #5)
  - [x] 创建 `features/editor/hooks/useCanvasCommands.ts`
  - [x] Zustand 管理撤销栈（undoStack）和重做栈（redoStack）
  - [x] `pushCommand(cmd)`: 新命令压栈，清空重做栈，栈满时丢弃最早命令
  - [x] `undo()`: 弹出撤销栈顶 Command，调用 undo()，压入重做栈
  - [x] `redo()`: 弹出重做栈顶 Command，调用 execute()，压入撤销栈
  - [x] 最大栈深度：50（常量 `MAX_UNDO_DEPTH = 50`）
  - [x] 导出 `canUndo` 和 `canRedo` 状态给 UI
- [x] Task 4: Fabric.js 事件 → Command 生成 (AC: #1)
  - [x] 在 `useFabricCanvas` hook 中，`object:modified` 事件触发时生成对应 Command
  - [x] 需在事件触发前记录元素旧状态（通过 `object:moving` / `before:transform` 等事件）
  - [x] 文字编辑：监听 `text:changed` 或 `editing:exited` 事件
  - [x] 样式修改：Toolbar 操作时手动创建 Command
  - [x] 删除/添加：对应操作时手动创建 Command
- [x] Task 5: 快捷键绑定 (AC: #2, #3)
  - [x] 监听全局键盘事件：Ctrl+Z → undo()，Ctrl+Shift+Z → redo()
  - [x] 确保快捷键在文字编辑模式下不冲突（编辑模式下 Ctrl+Z 为文本撤销）
- [x] Task 6: Toolbar 撤销/重做按钮 (AC: #2, #3, #5)
  - [x] 在 Toolbar 添加撤销和重做按钮
  - [x] 按钮根据 canUndo/canRedo 状态启用/禁用
- [x] Task 7: 回补 Story 2.1-2.3 的 Command 记录 (AC: #1)
  - [x] 确保拖拽、缩放（Story 2.1）操作生成 Command
  - [x] 确保文字编辑、样式修改（Story 2.2）操作生成 Command
  - [x] 确保删除、添加（Story 2.3）操作生成 Command
- [x] Task 8: 单元测试 (AC: #6)
  - [x] 创建 `__tests__/features/editor/useCanvasCommands.test.ts`
  - [x] 测试正向流程：push → undo → redo
  - [x] 测试空栈 undo（无操作）
  - [x] 测试满栈 push（丢弃最早命令）
  - [x] 测试 undo 后新操作清空重做栈

## Dev Notes

### 架构约束
- Zustand 存操作命令（Command 对象）而非画布快照，避免内存膨胀
- Command 接口：`{ execute(): void, undo(): void, description: string, timestamp: number }`
- 命令栈最大深度 50（`MAX_UNDO_DEPTH = 50`）
- Fabric.js canvas 对象 = 画布状态的 source of truth
- Zustand store = UI 状态（命令栈、选中状态等）

### Zustand ↔ Fabric.js 双向通信流
```
用户操作画布 → Fabric.js 事件（object:modified 等）
→ 事件处理器生成 Command 对象
→ Command 压入 Zustand 撤销栈
→ 撤销时：从栈弹出 Command，调用 undo() 操作 Fabric.js canvas
```

### 测试要求（核心管线必须覆盖）
- `useCanvasCommands.test.ts` 是架构文档指定的核心管线测试之一

### 依赖 Story 2.1-2.3 产物
- 所有画布操作（选中、拖拽、缩放、文字编辑、样式修改、删除、添加）
- useFabricCanvas hook 事件监听
- Toolbar 组件

### Project Structure Notes
```
features/editor/
├── hooks/
│   ├── useCanvasCommands.ts    # 命令模式核心实现
│   └── useFabricCanvas.ts      # 添加 Command 生成逻辑
├── components/Toolbar.tsx       # 添加撤销/重做按钮
└── stores/useEditorStore.ts     # 可选：命令栈也可放在 useCanvasCommands 内部 store

__tests__/features/editor/
└── useCanvasCommands.test.ts
```

### References
- [Source: architecture.md#通信模式] — Fabric.js 事件 → Zustand 命令模式
- [Source: architecture.md#核心架构决策] — Zustand 存操作命令而非快照
- [Source: architecture.md#测试优先级约定] — 命令模式 undo/redo 必须有测试
- [Source: epics.md#Story 2.4] — 完整验收标准

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)
### Debug Log References
### Completion Notes List
- Story 2.4 implemented: Command pattern with undo/redo stacks (max depth 50), Command implementations for move/scale/text-edit/style-change/delete/add, Ctrl+Z/Ctrl+Shift+Z shortcuts, and toolbar buttons.
### File List
- src/features/editor/hooks/useCanvasCommands.ts
- src/features/editor/hooks/useFabricCanvas.ts
- src/features/editor/components/Toolbar.tsx
- __tests__/features/editor/useCanvasCommands.test.ts
