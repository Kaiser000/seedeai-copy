# Story 3.3: 对话式 AI 优化设计

Status: done

## Story

As a 海报设计用户,
I want 通过对话告诉 AI 我的修改意图，让 AI 基于当前画布状态重新调整整体设计,
So that 我可以用自然语言指挥 AI 优化海报，不需要手动逐个修改元素。

## Acceptance Criteria

1. **Given** 编辑器页面底部有对话输入框（ChatDialog）**When** 用户在对话框中输入修改意图（如"文字间距大一点，背景换成浅粉色"）并提交 **Then** 系统调用 `canvasSerializer` 序列化当前画布完整状态 **And** 将画布状态 + 用户修改意图 + 对话历史发送到 POST `/api/posters/chat` **And** 对话框显示用户消息，并展示 AI 正在生成的 loading 状态
2. **Given** 后端收到对话优化请求 **When** `ChatController` 处理请求 **Then** 构造包含完整画布状态描述、用户修改意图和对话历史的 Prompt **And** 通过 SSE 流式返回调整后的完整设计 JSX 代码
3. **Given** LLM 返回了调整后的完整 JSX 代码 **When** 前端收到 `complete` 消息 **Then** 编译新的 JSX → DOM → Fabric.js 转换（复用 Story 1.3-1.5 的完整管线）**And** 新的画布内容替换当前画布 **And** 该整体替换操作记录为一个 Command，支持撤销回到替换前的状态
4. **Given** 用户进行了多轮对话优化 **When** 每次提交新的修改意图 **Then** 对话历史在左栏或对话框中累积显示 **And** 每次请求都携带完整对话历史，让 LLM 理解上下文
5. **Given** 对话优化过程中 LLM 返回错误 **When** 前端收到 `error` 消息 **Then** 显示友好提示，当前画布保持不变 **And** 用户可以继续输入新的修改意图重试

## Tasks / Subtasks

- [x] Task 1: 后端 ChatController + Service (AC: #2)
  - [x] 创建 `controller/ChatController.java`：POST `/api/posters/chat`
  - [x] 创建 `service/ChatOptimizeService.java`：构造 Chat Prompt → 调用 LLM → SSE 流式返回
  - [x] 创建 `model/dto/ChatRequest.java`：`{ canvasState, userMessage, chatHistory[], posterSize }`
  - [x] 创建 `resources/prompts/poster-chat.md`：对话优化 System Prompt 模板
- [x] Task 2: Chat Prompt 设计 (AC: #2)
  - [x] Prompt 包含：完整画布序列化状态、用户修改意图、对话历史、海报尺寸、Tailwind 类名白名单
  - [x] 要求 LLM 基于当前画布状态 + 修改意图生成调整后的完整 JSX 代码
  - [x] 对话历史传递让 LLM 理解多轮修改上下文
- [x] Task 3: ChatDialog 组件 (AC: #1, #4, #5)
  - [x] 创建 `features/editor/components/ChatDialog.tsx`
  - [x] 位于编辑器页面底部（或左栏底部）
  - [x] 包含文本输入框 + 发送按钮
  - [x] 显示对话历史（用户消息 + AI 状态）
  - [x] 发送时展示 loading 状态
  - [x] 错误时显示友好提示
- [x] Task 4: 对话状态管理 (AC: #4)
  - [x] 在 `useEditorStore` 中添加 `chatHistory: ChatMessage[]`
  - [x] `ChatMessage` 类型：`{ role: 'user' | 'assistant', content: string, timestamp: number }`
  - [x] 添加 action：`addChatMessage(msg)`、`clearChatHistory()`
- [x] Task 5: 对话生成逻辑 (AC: #1, #3)
  - [x] 在 ChatDialog 中或创建独立 hook
  - [x] 提交时：canvasSerializer 序列化画布 → 组装 ChatRequest → sseClient 发起 POST
  - [x] 收到 complete 消息后：jsxCompiler 编译 → DOM 渲染 → convertDomToCanvas 转换
  - [x] 替换整个画布内容
- [x] Task 6: 整体替换的 Command 记录 (AC: #3)
  - [x] 创建 ChatReplaceCommand
  - [x] undo：恢复替换前的完整画布状态（需在替换前保存旧画布对象快照）
  - [x] redo：重新应用新画布内容
  - [x] 调用 useCanvasCommands.pushCommand()
- [x] Task 7: 多轮对话历史 (AC: #4)
  - [x] 每次用户发送消息后添加到 chatHistory
  - [x] AI 生成成功后添加 assistant 消息
  - [x] 每次请求携带完整 chatHistory

## Dev Notes

### 架构约束
- Chat 对话复用 Story 1.3-1.5 的完整管线（SSE → jsxCompiler → DOM → convertDomToCanvas）
- Chat 是全局操作：替换整个画布内容（与 Roll 的局部替换不同）
- canvasSerializer（Story 3.1）提供画布状态序列化
- ChatDialog 组件位于 `features/editor/components/`
- 对话历史存储在 Zustand store（`useEditorStore.chatHistory`），MVP 纯前端内存状态
- 整体替换操作必须通过命令模式记录，支持撤销回到替换前状态

### 数据流
```
用户在 ChatDialog 输入修改意图 → 提交
→ canvasSerializer 序列化完整画布状态
→ POST /api/posters/chat { canvasState, userMessage, chatHistory, posterSize }
→ Spring Boot: ChatOptimizeService → LlmClient → SSE 流式返回
→ 前端收到 complete → jsxCompiler 编译 → DOM 渲染 → convertDomToCanvas
→ 替换整个画布 → 记录 ChatReplaceCommand
→ 添加 assistant 消息到 chatHistory
```

### 整体替换 vs 局部替换
- Story 3.2 Roll：替换单个选中元素
- Story 3.3 Chat：替换整个画布内容
- 两者都需要 Command 支持撤销，但 Chat 的 undo 需保存整个画布快照

### 错误处理
- 管线前段（LLM 超时/异常）：友好提示，画布不变，可继续输入重试
- 管线后段（编译/渲染/转换失败）：友好提示，画布不变

### 依赖 Story 3.1 + Epic 1 管线 + Story 2.4
- canvasSerializer 序列化能力
- sseClient、jsxCompiler、convertDomToCanvas 完整管线
- useCanvasCommands 命令模式

### Project Structure Notes
```
# 后端
controller/ChatController.java
service/ChatOptimizeService.java
model/dto/ChatRequest.java
resources/prompts/poster-chat.md

# 前端
features/editor/components/ChatDialog.tsx
features/editor/stores/useEditorStore.ts   # 添加 chatHistory
```

### References
- [Source: architecture.md#架构边界] — POST /api/posters/chat API 定义
- [Source: architecture.md#核心数据流] — 对话优化数据流
- [Source: architecture.md#前端组件通信边界] — ChatDialog → generation/services → sseClient → engine
- [Source: architecture.md#错误处理分层策略] — 前段/后段错误处理
- [Source: prd.md#用户旅程] — 旅程2：小李通过对话修正布局
- [Source: epics.md#Story 3.3] — 完整验收标准

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)
### Debug Log References
### Completion Notes List
- Story 3.3 implemented: Chat-based AI design optimization with backend ChatController/Service, ChatDialog component, multi-turn conversation history, full canvas replacement with ChatReplaceCommand for undo support.
### File List
- controller/ChatController.java
- service/ChatOptimizeService.java
- model/dto/ChatRequest.java
- resources/prompts/poster-chat.md
- src/features/editor/components/ChatDialog.tsx
- src/stores/useEditorStore.ts
