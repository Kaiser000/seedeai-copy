---
project_name: 'seede-ai'
user_name: 'Tfzhang11'
date: '2026-04-03'
sections_completed:
  - technology_stack
  - language_rules
  - framework_rules
  - testing_rules
  - code_quality
  - workflow_rules
  - anti_patterns
status: 'complete'
rule_count: 42
optimized_for_llm: true
---

# AI Agent 实现指南 — seede-ai

本文件为 AI Agent 在本项目中生成代码时必须遵守的规则。**重点记录非显而易见的细节**，避免 Agent 犯常见错误。

---

## 技术栈与版本

### 前端
| 技术 | 版本 | 备注 |
|---|---|---|
| React | ^19.2.4 | React 19，非 React 18 |
| Vite | ^8.0.1 | 构建与 dev server |
| TypeScript | ~5.9.3 | strict 全量启用 |
| Tailwind CSS | **3.4**（非 4.x） | 使用 `tailwind.config.js`，非 CSS-first |
| Zustand | ^5.0.12 | 全局状态管理 |
| Fabric.js | ^7.2.0 | 画布引擎 |
| @babel/standalone | ^7.29.2 | 浏览器端 JSX 编译 |
| Vitest | ^4.1.2 | 测试，环境为 jsdom |
| lucide-react | ^1.7.0 | 图标库 |

### 后端
| 技术 | 版本 | 备注 |
|---|---|---|
| Java | 21 | |
| Spring Boot | 3.5.12 | **纯 WebFlux**，无 MVC |
| spring-boot-starter-webflux | （随 Boot） | 唯一 web 依赖 |
| spring-boot-starter-validation | （随 Boot） | Bean 校验 |
| LLM | GLM-4.7（ZhipuAI） | OpenAI 协议兼容 |

---

## TypeScript 规则

### tsconfig 关键配置（全部已启用，不可降级）
```
strict: true
noUnusedLocals: true
noUnusedParameters: true
verbatimModuleSyntax: true   // import type 必须用 import type，不可混用
erasableSyntaxOnly: true
noUncheckedSideEffectImports: true
moduleResolution: bundler
```

### Import 约定
- **路径别名**：`@/` 映射 `./src/`，始终用 `@/` 而非相对路径跨目录引用
- **类型导入**：必须用 `import type { Foo }` 而非 `import { Foo }`（verbatimModuleSyntax 强制要求）
- **文件扩展名**：不加 `.ts`/`.tsx`，bundler 模式自动解析

### 错误处理
- catch 块必须命名参数：`catch (err)`，类型断言用 `(err as Error).message`
- **不允许空 catch**：`catch { }` 或 `catch (_) { }` 均违反 noUnusedParameters，至少打 console.warn/error

---

## React 规则

### 组件结构
- 文件命名：PascalCase（`CanvasPanel.tsx`）；hooks 用 camelCase + use 前缀（`useRoll.ts`）
- 功能目录结构：`features/{feature}/components/`、`features/{feature}/hooks/`、`features/{feature}/services/`
- 共享工具：`shared/utils/`、`shared/components/ui/`、`shared/types/`
- 引擎层独立：`engine/` 与 features 完全解耦，不依赖 React 之外的任何 feature 层代码

### 状态管理（Zustand）
- **全局状态**：`useEditorStore`（生成流程 + 画布选中 + 对话历史）
- **命令栈**：`useCanvasCommands`（独立 Zustand store，撤销/重做）
- **本地 UI 状态**：用 `useState`（Tab 切换、表单输入等）
- Zustand store 状态重置：直接 `useXxxStore.setState({ ... })`，测试时在 `beforeEach` 中调用

### 画布访问模式（⚠️ 关键）
- **全局单例注册表**：`canvasRegistry.ts` 提供 `getGlobalCanvas()` / `setGlobalCanvas()`
- `useFabricCanvas` hook 在 mount 时 set，unmount 时 clear + dispose
- 需要 canvas 的组件（Toolbar、ChatDialog、useRoll 等）调用 `getGlobalCanvas()` 而非 prop drilling
- **假设单 canvas**：同时只有一个 `CanvasPanel` 挂载

### Hooks 依赖数组
- `CanvasPanel` 和 `EditorPage` 的某些 `useEffect` 故意设空依赖（`// eslint-disable-line react-hooks/exhaustive-deps`），这是已知且有意的设计，**不要修改**

---

## DOM→Canvas 转换流水线（⚠️ 核心复杂度）

JSX 字符串到 Fabric.js 画布的完整路径：

```
JSX string
  → compileJsx()        // @babel/standalone 编译，presets:['react']，filename:'poster.jsx'
  → renderToHiddenDom() // new Function() 执行，window.React 全局注入，ReactDOM.createRoot 渲染
  → 等待图片加载         // querySelectorAll('img') + onload Promise.all，无图片则 200ms 固定延迟
  → convertDomToCanvas() // getBoundingClientRect 坐标转换 → groupHandler 递归 → Fabric.js 对象
```

**关键约束：**
- `hiddenDiv` 必须用 `try/finally` 包裹确保 `document.body.removeChild(hiddenDiv)` 执行（即使异常）
- `renderToHiddenDom` 不存储 ReactRoot 引用，容器生命周期由调用方负责
- `convertDomToCanvas` 的 `targetCanvas` 参数：传入已有 canvas 时会 `clear()` 后重用（chat/roll 更新场景）；不传则创建 offscreen canvas（roll 新元素场景）
- fontFamily 解析：CSS font-family 是逗号分隔的降级列表，传给 Fabric.js 前必须取第一个并 strip 引号：`.split(',')[0].trim().replace(/^["']|["']$/g, '')`

---

## Spring Boot 后端规则

### WebFlux 架构（⚠️ 严格约束）
- **只有** `spring-boot-starter-webflux`，**绝对不能**添加 `spring-boot-starter-web`（MVC）
- CORS 配置使用 `WebFluxConfigurer`（不是 `WebMvcConfigurer`）
- Controller 返回类型：SSE 接口返回 `Flux<ServerSentEvent<SseMessage>>`，普通接口返回 `Mono<ApiResponse<T>>`
- 异常处理：`@RestControllerAdvice` + `WebExchangeBindException`（不是 `MethodArgumentNotValidException`）

### SSE 流式响应模式
```java
// 标准模式：thinking → code_chunk* → complete（或 error）
Flux.concat(thinkingMsg, llmStream)
    .map(msg -> ServerSentEvent.<SseMessage>builder().data(msg).build())
```
- 所有 SSE 端点加 `produces = MediaType.TEXT_EVENT_STREAM_VALUE`
- 错误降级：`.onErrorResume(e -> Flux.just(SseMessage.error("...", true)))`，`retryable=true` 表示前端可重试

### 请求校验
- DTO 字段：`@NotBlank`（字符串）、`@Positive`（数值），Controller 参数加 `@Valid`
- 可选字段（`canvasContext`、`canvasState`、`chatHistory`）**不加校验注解**，Service 层做 null 安全处理

### 提示词模板
- 位于 `resources/prompts/`，文件名白名单：`poster-generate.md`、`poster-chat.md`、`poster-roll.md`
- 变量语法：`{{variableName}}`
- 用户输入注入到模板前**必须转义** `{{` 和 `}}`（已在 `SystemPromptManager` 实现）
- 新增模板需同时更新 `ALLOWED_TEMPLATES` 白名单

### 安全规则
- **API key 绝对不能有默认值**：`${LLM_API_KEY}` 不加 `:fallback`，通过环境变量注入
- `@PostConstruct` 在 `LlmConfig` 中校验 key 非空，启动时 fail-fast
- `ChatOptimizeService` 的 `chatHistory.role` 字段通过 `ALLOWED_ROLES = Set.of("user", "assistant")` 白名单过滤，防止注入 system 角色

---

## 测试规则

### 测试框架与环境
- **Vitest** + **jsdom**（非 Jest，配置在 `vite.config.ts` 的 `test.environment`）
- 测试文件位于 `src/__tests__/{layer}/{feature}/`，命名与被测文件对应（`sseClient.test.ts`）
- Mock fabric.js：`vi.mock('fabric', () => { class MockTextbox {...} ... })`，必须在 import 前声明

### Mock 规范
- fabric.js 类必须完整 mock 被测代码读取的所有属性（canvasSerializer 读 `.type`、`.left`、`.top`、`.width` 等）
- `vi.fn()` 创建 mock 函数；抛异常测试：`.mockImplementation(() => { throw new Error(...) })`
- Zustand store 测试：在 `beforeEach` 中 `store.setState({ 重置状态 })`，**不要** `const state = xxx; void state` 这样的死代码

### 必须测试的路径
- 命令执行抛异常时 undo/redo stack **不变**（已有测试示例）
- 边界条件：负数索引、空数组、null 返回值
- SSE 流：`connectSse` 的 HTTP 错误、无 complete 消息的 fallback、AbortSignal 取消

---

## 代码质量规则

### 日志规范（前端）
- 前缀格式：`[ModuleName] 动作描述:`，例如 `[SSE] HTTP error:`、`[Roll] Operation failed:`
- 级别选择：`console.error`（异常 + stack）、`console.warn`（可恢复问题）、`console.debug`（流程跟踪）
- **错误 catch 块必须打印 stack**：`{ error: (err as Error).message, stack: (err as Error).stack }`

### 日志规范（后端）
- 使用 SLF4J：`private static final Logger log = LoggerFactory.getLogger(XxxClass.class)`
- 入口 info，中间 debug，异常 error（带 `e` 参数）
- 不在日志中打印敏感信息（api-key、用户输入的完整内容只打长度）

### 注释规范
- 后端：公共方法 Javadoc（`/** ... */`），内联复杂逻辑注释
- 前端：复杂算法（0.999^deltaY、fontFamily 解析、200ms 延迟理由）必须注释；组件内非显而易见的 useEffect 加注释说明依赖策略

### 文件组织
- 前端不创建单独的 `index.ts` barrel 文件（`shared/utils/index.ts` 是唯一例外）
- 引擎层 handler 文件：一个 handler 一个文件，统一由 `groupHandler.ts` 调度

---

## 关键反模式（必须避免）

### 前端
1. **不要** 在 `finally` 里省略 `document.body.removeChild(hiddenDiv)`——必须用 `try/finally` 保证 DOM 清理
2. **不要** 在 `parseSseMessage` 用空 catch——必须 `catch (err)` 并 `console.warn`
3. **不要** 全局修改 `codeBuffer` 共享状态——SSE 解析必须用 `Flux.defer()` 隔离每次订阅（后端）或函数作用域变量（前端 `connectSse` 里的 `codeBuffer: string[]`）
4. **不要** 从 `@babel/standalone` 编译结果直接 `eval()`——必须用 `new Function('React', code + '\nreturn Poster;')` 的方式，并注入 `window.React`
5. **不要** 在 Fabric.js 类型不确定时用 `obj.type` 做字符串比较而不处理未知类型——用 `FABRIC_TYPE_MAP` + `console.warn` 跳过未知类型

### 后端
1. **不要**添加 `spring-boot-starter-web` 依赖——会与 WebFlux 冲突
2. **不要**在 `application.yml` 中为 `LLM_API_KEY` 设置默认值
3. **不要**在 `SystemPromptManager` 白名单之外加载任意文件名
4. **不要**在 `chatHistory` 中信任 `role` 字段——必须通过 `ALLOWED_ROLES` 白名单过滤
5. **不要**在响应式链中使用阻塞操作（`block()`、`Thread.sleep()`）

---

## API 端点速查

| 端点 | 方法 | 响应 | 用途 |
|---|---|---|---|
| `/api/posters/generate` | POST | SSE | 初次生成海报 |
| `/api/posters/chat` | POST | SSE | 对话优化海报 |
| `/api/posters/roll` | POST | SSE | 单元素重新生成 |
| `/health` | GET | JSON | 健康检查 |

所有 SSE 端点的响应事件类型：`thinking`、`code_chunk`、`complete`、`error`（见 `SseMessage.java`）

---

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `LLM_API_KEY` | ✅ 必填 | ZhipuAI API Key，启动时 fail-fast 校验 |
| `LLM_API_URL` | 可选 | 默认 `https://open.bigmodel.cn/api/paas/v4/chat/completions` |
| `LLM_MODEL` | 可选 | 默认 `glm-4.7` |
| `CORS_ALLOWED_ORIGINS` | 可选 | 默认 `http://localhost:5173` |

---

## 使用说明

**For AI Agents:**

- 实现任何代码前先读取本文件
- 严格遵守所有规则，不得降级配置（尤其是 TypeScript strict 选项）
- 遇到不确定时，选择更严格的方案
- 发现新的项目模式时更新本文件

**For Humans:**

- 保持本文件精简，聚焦 Agent 实际需要的内容
- 技术栈版本变更时同步更新
- 定期审查过时规则
- 删除随时间变得显而易见的规则

Last Updated: 2026-04-03
