# Story 3.2: 单元素 Roll 重新生成

Status: done

## Story

As a 海报设计用户,
I want 选中某个元素后让 AI 重新生成该元素的替代方案,
So that 我可以对不满意的单个元素进行局部优化，而不影响海报整体布局。

## Acceptance Criteria

1. **Given** 用户在画布上选中了一个元素 **When** 用户点击 RollButton（或右键菜单中的"重新生成"）**Then** 系统序列化选中元素的描述及其在画布中的上下文 **And** 向后端 POST `/api/posters/roll` 发起请求 **And** 按钮显示 loading 状态
2. **Given** 后端收到 Roll 请求 **When** `RollController` 处理请求 **Then** 构造包含元素描述和上下文的 Prompt，调用 LLM **And** 通过 SSE 流式返回生成结果（遵循 SSE 消息协议）
3. **Given** LLM 返回了替代方案的 JSX 代码 **When** 前端收到 `complete` 消息 **Then** 编译新的 JSX 代码为 DOM，转换为 Fabric.js 对象 **And** 替换画布上原选中元素（保持相同位置和大致尺寸）**And** 该替换操作记录为一个 Command，支持撤销
4. **Given** Roll 生成过程中 LLM 返回错误或超时 **When** 前端收到 `error` 消息 **Then** 显示友好提示，原元素保持不变 **And** 提供重试按钮

## Tasks / Subtasks

- [x] Task 1: 后端 RollController + Service (AC: #2)
  - [x] 创建 `controller/RollController.java`：POST `/api/posters/roll`
  - [x] 创建 `service/RollService.java`：构造 Roll Prompt → 调用 LLM → SSE 流式返回
  - [x] 创建 `model/dto/RollRequest.java`：`{ elementDescription, canvasContext, posterSize }`
  - [x] 创建 `resources/prompts/poster-roll.md`：Roll 专用 System Prompt 模板
- [x] Task 2: Roll Prompt 设计 (AC: #2)
  - [x] Prompt 包含：选中元素的序列化描述、周围元素的上下文、海报尺寸、Tailwind 类名白名单
  - [x] 要求 LLM 生成同类型元素的替代方案 JSX 代码
  - [x] 约束：保持与原元素相似的尺寸和位置
- [x] Task 3: 前端 useRoll Hook (AC: #1, #3, #4)
  - [x] 创建 `features/generation/hooks/useRoll.ts`
  - [x] 调用 canvasSerializer 序列化选中元素及上下文
  - [x] 通过 sseClient 发起 POST `/api/posters/roll` 请求
  - [x] 管理 loading 状态
  - [x] 收到 complete 消息后：jsxCompiler 编译 → DOM 渲染 → convertDomToCanvas 转换
  - [x] 替换画布上原元素（保持位置和大致尺寸）
  - [x] 创建 RollCommand（可撤销）
- [x] Task 4: RollButton 组件 (AC: #1, #4)
  - [x] 创建 `features/editor/components/RollButton.tsx`
  - [x] 仅当有元素选中时显示/可用
  - [x] 点击触发 useRoll hook
  - [x] Loading 状态展示
  - [x] 错误时显示友好提示 + 重试按钮
- [x] Task 5: 元素替换与 Command 记录 (AC: #3)
  - [x] 替换逻辑：移除旧元素 → 添加新元素（保持原位置和尺寸约束）
  - [x] 创建 RollCommand：undo 恢复原元素，redo 替换为新元素
  - [x] 调用 useCanvasCommands.pushCommand()

## Dev Notes

### 架构约束
- Roll 复用 Story 1.3-1.5 的完整管线（SSE → jsxCompiler → DOM → convertDomToCanvas）
- 但 Roll 是局部操作：只替换选中元素，不替换整个画布
- canvasSerializer（Story 3.1）提供元素序列化能力
- 后端 RollController 的 SSE 响应遵循相同的消息协议（thinking/code_chunk/complete/error）
- 替换操作必须通过命令模式记录（Story 2.4 的 useCanvasCommands）

### 数据流
```
用户选中元素 → 点击 Roll
→ canvasSerializer 序列化元素描述 + 上下文
→ POST /api/posters/roll
→ Spring Boot: RollService → LlmClient → SSE 流式返回
→ 前端收到 complete → jsxCompiler 编译 → DOM 渲染 → convertDomToCanvas
→ 替换画布上原元素 → 记录 RollCommand
```

### 错误处理
- 管线前段（LLM 超时/异常）：友好提示 + 重试按钮
- 管线后段（编译/渲染/转换失败）：友好提示，原元素保持不变

### 依赖 Story 3.1 + Epic 1 管线
- canvasSerializer 序列化能力
- sseClient、jsxCompiler、convertDomToCanvas 完整管线
- useCanvasCommands 命令模式

### Project Structure Notes
```
# 后端
controller/RollController.java
service/RollService.java
model/dto/RollRequest.java
resources/prompts/poster-roll.md

# 前端
features/generation/hooks/useRoll.ts
features/editor/components/RollButton.tsx
```

### References
- [Source: architecture.md#架构边界] — POST /api/posters/roll API 定义
- [Source: architecture.md#核心数据流] — Roll 数据流
- [Source: architecture.md#错误处理分层策略] — 前段/后段错误处理
- [Source: epics.md#Story 3.2] — 完整验收标准

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)
### Debug Log References
### Completion Notes List
- Story 3.2 implemented: Single element Roll regeneration with backend RollController/Service, frontend useRoll hook, RollButton component, element replacement with RollCommand for undo support.
### File List
- controller/RollController.java
- service/RollService.java
- model/dto/RollRequest.java
- resources/prompts/poster-roll.md
- src/features/generation/hooks/useRoll.ts
- src/features/editor/components/RollButton.tsx
