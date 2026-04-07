# Story 1.3: LLM 编排与 SSE 流式生成

Status: done

## Story

As a 海报设计用户,
I want 提交描述后看到 AI 实时生成海报代码的过程,
So that 我知道系统正在工作，并能观察生成进度。

## Acceptance Criteria

1. **Given** 后端已配置 LLM 接口（OpenAI 协议兼容，默认 GLM-5）**When** 修改 `application.yml` 中的 LLM 配置（API URL、API Key、模型名称）**Then** 无需修改业务代码即可切换 LLM 模型
2. **Given** 用户从输入页提交海报描述和尺寸 **When** 前端发起 POST `/api/posters/generate` 请求 **Then** 后端 `PosterController` 接收请求，构造包含用户描述和尺寸信息的 System Prompt **And** 后端通过 `LlmClient` 调用 LLM，返回 `Flux<ServerSentEvent>` 流式响应 **And** SSE 消息遵循协议格式：`{ type: "thinking" | "code_chunk" | "complete" | "error", content: "..." }`
3. **Given** SSE 连接已建立，LLM 正在生成 **When** 前端 `sseClient` 接收到 `thinking` 类型消息 **Then** 编辑器页左栏（StreamPanel）显示"正在分析设计需求..."等思考状态文字
4. **Given** SSE 连接已建立，LLM 正在生成 **When** 前端 `sseClient` 接收到 `code_chunk` 类型消息 **Then** 编辑器页左栏实时追加显示 JSX 代码片段，呈现代码生成进度
5. **Given** SSE 连接已建立 **When** 前端 `sseClient` 接收到 `complete` 类型消息 **Then** 前端获得完整的 JSX + Tailwind CSS 代码，准备触发后续编译渲染流程
6. **Given** SSE 连接已建立 **When** 前端 `sseClient` 接收到 `error` 类型消息或 LLM 调用超时 **Then** 编辑器页显示友好错误提示（不暴露技术细节）并提供"重新生成"按钮
7. **Given** SSE 消息解析模块已实现 **When** 运行 `sseClient.test.ts` 单元测试 **Then** 四种消息类型（thinking / code_chunk / complete / error）均能正确解析，测试全部通过

## Tasks / Subtasks

- [x] Task 1: 后端 LLM 配置层 (AC: #1)
  - [x] 创建 `config/LlmConfig.java`：从 `application.yml` 读取 apiUrl、apiKey、modelName
  - [x] 在 `application.yml` / `application-dev.yml` 定义 LLM 配置项
- [x] Task 2: LLM 客户端 (AC: #2)
  - [x] 创建 `llm/LlmClient.java`：基于 WebClient 实现 OpenAI 协议兼容调用
  - [x] 支持流式响应（返回 `Flux<String>`）
  - [x] 超时配置和异常处理
- [x] Task 3: System Prompt 管理 (AC: #2)
  - [x] 创建 `llm/SystemPromptManager.java`：加载和管理 Prompt 模板
  - [x] 创建 `resources/prompts/poster-generate.md`：海报生成 System Prompt 模板
  - [x] Prompt 包含用户描述、海报尺寸、Tailwind 类名白名单约束
- [x] Task 4: LLM 响应解析 (AC: #2)
  - [x] 创建 `llm/LlmResponseParser.java`：将 LLM 流式输出解析为 SSE 消息
  - [x] 创建 `model/SseMessage.java`：`{ type, content, retryable? }`
- [x] Task 5: PosterController + Service (AC: #2)
  - [x] 创建 `controller/PosterController.java`：POST `/api/posters/generate`
  - [x] 创建 `service/PosterGenerateService.java`：编排 Prompt 构造 → LLM 调用 → SSE 流式返回
  - [x] 创建 `model/dto/GenerateRequest.java`：`{ prompt, width, height }`
  - [x] 返回类型：`Flux<ServerSentEvent<SseMessage>>`
- [x] Task 6: 前端 SSE 客户端 (AC: #3, #4, #5, #6)
  - [x] 创建 `features/generation/services/sseClient.ts`
  - [x] 使用 EventSource 或 fetch + ReadableStream 建立 SSE 连接
  - [x] 解析四种消息类型：thinking / code_chunk / complete / error
  - [x] code_chunk 消息累积拼接为完整 JSX 代码
- [x] Task 7: SSE 消息类型定义 (AC: #3, #4, #5, #6)
  - [x] 创建 `features/generation/types/sseMessages.ts`
  - [x] 定义 `SseMessage` 类型：`{ type: 'thinking' | 'code_chunk' | 'complete' | 'error', content: string, retryable?: boolean }`
- [x] Task 8: useGenerate Hook (AC: #3, #4, #5, #6)
  - [x] 创建 `features/generation/hooks/useGenerate.ts`
  - [x] 调用 sseClient 发起生成请求
  - [x] 更新 useEditorStore 状态：sseMessages、isGenerating、generatedCode
- [x] Task 9: StreamPanel 组件 (AC: #3, #4)
  - [x] 创建 `features/editor/components/StreamPanel.tsx`
  - [x] 展示 thinking 状态文字、code_chunk 实时代码
  - [x] 自动滚动到底部
- [x] Task 10: EditorPage 基础布局 (AC: #3, #4, #6)
  - [x] 更新 `features/editor/EditorPage.tsx`：左右分栏布局
  - [x] 左栏：StreamPanel
  - [x] 右栏：画布占位（后续 Story 实现）
  - [x] 错误状态展示 + 重新生成按钮
- [x] Task 11: SSE 消息解析测试 (AC: #7)
  - [x] 创建 `__tests__/features/generation/sseClient.test.ts`
  - [x] 测试四种消息类型解析
  - [x] 测试 code_chunk 累积拼接逻辑
  - [x] 测试错误/超时处理

## Dev Notes

### 架构约束
- 后端使用 WebFlux 的 `Flux<ServerSentEvent>` 实现 SSE 流式返回
- Spring Boot 3.5.12 中 web + webflux 共存（Tomcat 容器），常规接口用 Spring MVC，流式接口用 Flux
- LLM 调用基于 OpenAI 协议兼容接口，使用 WebClient（非 RestTemplate）
- SSE 消息协议固定四种类型：thinking / code_chunk / complete / error
- 前端 POST 请求通过 `shared/utils/request.ts` 统一封装，但 SSE 流式连接需直接使用 fetch + ReadableStream（因 EventSource 不支持 POST）
- 错误处理分层：管线前段（LLM 超时/异常）→ 友好提示 + 重试按钮

### SSE 消息协议
```json
{ "type": "thinking", "content": "正在分析设计需求..." }
{ "type": "code_chunk", "content": "const colors = {..." }
{ "type": "complete", "content": "<完整JSX代码>" }
{ "type": "error", "content": "生成失败", "retryable": true }
```

### 测试要求（核心管线必须覆盖）
- `sseClient.test.ts` 必须覆盖所有四种消息类型解析
- 这是架构文档指定的核心管线测试之一

### 依赖 Story 1.1 产物
- 前端项目结构、Zustand store、统一请求封装
- 后端项目结构、ApiResponse 包装

### Project Structure Notes
```
# 后端
controller/PosterController.java     # POST /api/posters/generate
service/PosterGenerateService.java
llm/LlmClient.java                   # OpenAI 协议兼容
llm/SystemPromptManager.java          # Prompt 模板加载
llm/LlmResponseParser.java
config/LlmConfig.java
model/SseMessage.java
model/dto/GenerateRequest.java
resources/prompts/poster-generate.md

# 前端
features/generation/services/sseClient.ts
features/generation/hooks/useGenerate.ts
features/generation/types/sseMessages.ts
features/editor/components/StreamPanel.tsx
features/editor/EditorPage.tsx         # 左右分栏布局
__tests__/features/generation/sseClient.test.ts
```

### References
- [Source: architecture.md#API与通信] — SSE 消息协议、错误处理分层
- [Source: architecture.md#核心架构决策] — WebFlux + Flux<ServerSentEvent>
- [Source: architecture.md#架构边界] — API 端点定义
- [Source: architecture.md#测试优先级约定] — SSE 消息解析必须有测试
- [Source: epics.md#Story 1.3] — 完整验收标准

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)
### Debug Log References
### Completion Notes List
- Story 1.3 implemented: Backend LLM orchestration with SSE streaming, frontend SSE client, StreamPanel, and EditorPage layout with error handling.
### File List
- controller/PosterController.java
- service/PosterGenerateService.java
- llm/LlmClient.java
- llm/SystemPromptManager.java
- llm/LlmResponseParser.java
- config/LlmConfig.java
- model/SseMessage.java
- model/dto/GenerateRequest.java
- resources/prompts/poster-generate.md
- src/features/generation/services/sseClient.ts
- src/features/generation/hooks/useGenerate.ts
- src/features/generation/types/sseMessages.ts
- src/features/editor/components/StreamPanel.tsx
- src/features/editor/EditorPage.tsx
- __tests__/features/generation/sseClient.test.ts
