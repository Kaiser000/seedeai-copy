---
stepsCompleted:
  - 1
  - 2
  - 3
  - 4
  - 5
  - 6
  - 7
  - 8
status: 'complete'
completedAt: '2026-04-02'
inputDocuments:
  - prd.md
  - product-brief-seede-ai.md
  - product-brief-seede-ai-distillate.md
  - docs/product-analysis.md
  - docs/workflow-analysis.md
  - docs/tech-plan.md
  - docs/implementation-guide.md
workflowType: 'architecture'
project_name: 'seede-ai'
user_name: 'Tfzhang11'
date: '2026-04-02'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## 项目上下文分析

### 需求概览

**功能需求（21项，6个领域）：**

| 领域 | 需求编号 | 架构含义 |
|---|---|---|
| 海报生成 | FR1-FR4 | LLM 编排层 + SSE 流式通信 + 前端 JSX 编译渲染 |
| DOM到画布转换 | FR5-FR7 | DOM 解析引擎 + Fabric.js 对象映射 + 层级/布局保持 |
| 画布编辑 | FR8-FR16 | Fabric.js 交互层 + 状态管理 + 撤销/重做栈 |
| AI交互优化 | FR17-FR19 | 画布状态序列化 + LLM 上下文构造 + 局部/全局替换机制 |
| 导出 | FR20 | Fabric.js Canvas 导出 + 分辨率控制 |
| LLM配置 | FR21 | OpenAI 协议兼容抽象层 |

**AI 交互优化的两条架构路径（FR17 vs FR18）：**

- **FR17 Roll 单元素**：选中元素 → 序列化该元素描述 → LLM 生成替代方案 → 转换为 Fabric.js 对象 → 替换原对象。数据流局部且清晰。
- **FR18 对话优化**：用户描述修改意图 → 序列化整个画布状态（含用户手动编辑结果）→ LLM 生成调整后的完整设计 → 重新渲染并替换整个画布。数据流全局且复杂。
- **FR19 画布序列化**：需同时服务 FR17 和 FR18，且必须捕捉用户手动编辑后的实时状态，而非仅初始生成结果。

**非功能需求：**

- **性能**：SSE 流式无硬性延迟要求；画布编辑操作需流畅无卡顿；撤销/重做即时响应
- **导出质量**：PNG 所见即所得，宽度 ≥ 1080px，色彩/文字/布局无偏差
- **集成**：OpenAI 协议兼容 LLM 接口（GLM-5），可配置切换模型
- **中文支持**：Canvas 中文字体正确加载、无乱码、换行和字间距渲染正确

**规模与复杂度：**

- 技术领域：全栈 Web App + AI Pipeline
- 复杂度等级：中高
- 预估架构组件：~8 个核心模块

### 技术约束与依赖

| 约束 | 来源 | 影响 |
|---|---|---|
| React MPA（非 SPA/SSR） | PRD 决策 | 页面间通过路由切换，无需 Next.js 等 SSR 框架 |
| Spring Boot 后端 | 用户偏好 | 后端仅负责 LLM 调用编排和 SSE 推送，不参与渲染 |
| Fabric.js 画布引擎 | PRD 决策 | DOM→Fabric.js 转换是核心技术难点 |
| 浏览器端渲染（非 Puppeteer） | PRD 决策 | 架构更简单，但需在浏览器环境解决字体加载和 JSX 编译 |
| GLM-5 + OpenAI 协议 | PRD 决策 | 需设计模型无关的接口抽象 |
| Tailwind CSS 样式子集 | 技术现实 | MVP 仅支持有限样式映射（纯色、文本、图片、简单边框） |
| DOM flow → Fabric.js absolute positioning | 布局模型差异 | 转换时需通过 getBoundingClientRect() 获取精确坐标，本质是布局模型转换而非仅样式转换 |
| 单人全栈开发 | 资源约束 | 架构选型必须偏向简单、成熟方案，避免过度工程化 |

### 跨切面关注点

1. **LLM 输出约束与质量**：System Prompt 设计决定生成的 JSX 结构可解析性，贯穿海报生成、Roll、对话优化全部 AI 功能。System Prompt 是系统的"灵魂"，需要版本化管理和独立模块化。
2. **Tailwind CSS 样式边界**：需明确定义 LLM 可使用的 Tailwind 类名白名单，同时 DOM→Fabric.js 转换器仅处理该白名单内的样式。
3. **画布状态模型**：Fabric.js 对象树是编辑、撤销/重做、序列化（供 LLM 上下文）、导出的共同数据源。
4. **前后端 SSE 消息协议**：SSE 传输的是 LLM 流式生成的 JSX 代码，需定义清晰的消息类型（thinking / code_chunk / complete / error），前端据此处理不同状态。JSX 代码块的完整性检测是关键——流式 token 不能直接编译，需等待完整代码块。
5. **错误恢复**：LLM 生成的 JSX 可能无法编译或渲染，需在管线各环节设计降级策略。

## Starter 模板评估

### 技术领域

全栈 Web App + AI Pipeline，前后端分离架构（React + Spring Boot）。

### 前端 Starter：Vite + React + TypeScript

**初始化命令：**

```bash
npm create vite@latest seede-ai-frontend -- --template react-ts
```

**选择理由：**
- Vite 8.0.3（基于 Rolldown），React 非 SSR 项目的标准答案
- 零配置开箱即用，符合单人开发最低认知负担原则
- 不选 Next.js：不需要 SSR/SSG，引入不必要的复杂度
- 不选 CRA：已停止维护

**Starter 提供的架构决策：**
- TypeScript 配置
- HMR 热更新
- ESLint 基础配置
- Rolldown 构建优化

**核心依赖（需额外安装）：**

| 依赖 | 版本 | 用途 | 备注 |
|---|---|---|---|
| Tailwind CSS | v3.4.x | UI 样式 + LLM 生成代码样式方案 | 选 v3 而非 v4：LLM 训练数据覆盖 v3 更充分，`tailwind.config.js` 可定义类名白名单，避免动态类名兼容问题 |
| Fabric.js | v7.2.x | 画布引擎 | 最新版，TypeScript 支持好。LLM 不直接生成 Fabric.js 代码，版本兼容性不受 LLM 训练数据影响 |
| React Router | v7.13.x | MPA 路由 | **可选**：MVP 仅两个页面（输入页 + 编辑器页），条件渲染即可实现，后续扩展时再引入 |

**关键依赖（第一性原理分析发现）：**

| 依赖 | 候选方案 | 用途 |
|---|---|---|
| JSX 运行时编译器 | Babel standalone / Sucrase / 手动预处理 | LLM 生成的 JSX 代码需在浏览器运行时编译为可执行 JS 后渲染为 DOM。这不是 Vite 构建时处理的——是运行时行为，直接影响核心管线可行性 |

### 后端 Starter：Spring Initializr

**初始化方式：** 通过 [start.spring.io](https://start.spring.io/) 生成

**项目配置：**
- Spring Boot：3.5.12（2026-03-19 发布，稳定且社区资源丰富）
- 构建工具：Maven
- 语言：Java
- 依赖：`spring-boot-starter-web` + `spring-boot-starter-webflux`

**架构决策：**
- `web` + `webflux` 共存，Tomcat 容器
- 常规 CRUD 接口用 Spring MVC 注解
- 流式 LLM 接口用 `Flux<ServerSentEvent>`
- 不选 Spring Boot 4.0.x：太新，社区资源少，MVP 不需要新特性
- 部署方案：K8s

**Starter 提供的架构决策：**
- Maven 项目结构
- Java 版本配置
- 内嵌 Tomcat
- Spring Web MVC + WebFlux
- 基础测试框架

### 项目结构

```
seede-ai/
├── frontend/              # Vite + React + TypeScript
│   ├── src/
│   │   ├── pages/         # 输入页、编辑器页
│   │   ├── components/    # 通用组件
│   │   ├── engine/        # DOM→Fabric.js 转换引擎
│   │   └── ...
│   └── package.json
├── backend/               # Spring Boot
│   ├── src/main/java/
│   └── pom.xml
└── README.md
```

**部署考量：** 开发阶段前后端分离（Vite dev server + Spring Boot），生产环境可考虑前端打包后由 Spring Boot 静态资源托管，减少部署复杂度。

### 不采用的方案

| 方案 | 排除理由 |
|---|---|---|
| Next.js | 不需要 SSR/SSG，引入不必要的复杂度和部署约束 |
| Create React App | 已停止维护 |
| Tailwind CSS v4 | LLM 训练数据覆盖不足，CSS-first 配置不利于定义类名白名单，动态类名处理复杂 |
| Spring Boot 4.0.x | 太新，社区资源少，MVP 不需要新特性 |
| 纯 WebFlux（Netty） | 项目会有常规 CRUD 业务，web + webflux 共存更务实 |
| Monorepo | 单人开发，前后端语言不同，管理增加无谓复杂度 |

**Note:** 项目初始化（前端脚手架 + Spring Initializr 生成）应作为第一个实现 Story。

## 核心架构决策

### 决策优先级分析

**关键决策（阻塞实现）：**
- 前端状态管理：Zustand
- JSX 运行时编译：Babel standalone
- 数据持久化：MongoDB（MVP 第一版暂不接入）

**重要决策（塑造架构）：**
- API 设计：RESTful
- UI 组件库：shadcn/ui
- 错误处理：显式报错（分层策略）
- 中文字体：打包到项目

**延迟决策（MVP 后处理）：**
- LLM 生成代码的安全沙箱
- CI/CD 流水线（先本地部署）

### 前端架构

| 决策 | 选择 | 版本 | 理由 |
|---|---|---|---|
| 状态管理 | Zustand | v5.0.x | 轻量（~1KB），API 简洁，适合画布状态跨组件读写，无需 Provider 包裹 |
| JSX 运行时编译 | @babel/standalone | v7.29.x | 最成熟的浏览器端 JSX 转换方案，完整支持各种 JSX 结构 |
| UI 组件库 | shadcn/ui | latest | 基于 Radix UI + Tailwind CSS，风格干净现代，匹配 Seede AI UI 风格，组件源码可控 |
| 路由 | 条件渲染（MVP） | - | 仅两个页面，条件渲染足够，后续按需引入 React Router |

**Zustand ↔ Fabric.js 双向通信（命令模式）：**

```
用户操作画布 → Fabric.js 事件（object:modified / object:added 等）
→ 事件处理器生成 Command 对象（包含 execute 和 undo 方法）
→ Command 压入 Zustand 撤销栈
→ 撤销时：从栈弹出 Command，调用 undo 方法操作 Fabric.js canvas
```

- Fabric.js canvas 对象 = 画布状态的 source of truth
- Zustand store = UI 状态（当前页面、SSE 连接状态、对话历史、撤销/重做命令栈）
- Zustand 存操作命令而非画布快照，避免内存膨胀

**大文件延迟加载策略：**
- @babel/standalone（~700KB gzip）：dynamic import，用户提交生成请求后加载，不阻塞首屏
- 中文字体文件（5-20MB）：进入编辑器页后异步加载

**输入页信息架构（MVP）：**
- 文本输入区（核心）
- 尺寸选择下拉（FR14）
- 预设案例入口（预填充输入框，低成本引导零经验用户）

### 数据架构

| 决策 | 选择 | 版本 | 理由 |
|---|---|---|---|
| 数据库 | MongoDB | - | 文档型数据库，适合存储非结构化的画布状态和对话历史 |
| MVP 策略 | 暂不接入 | - | MVP 第一版纯前端内存状态，刷新即丢，验证核心管线优先 |
| Spring 集成 | spring-boot-starter-data-mongodb | 随 Spring Boot 3.5.x | MongoDB 上线时引入 |

### API 与通信

| 决策 | 选择 | 理由 |
|---|---|---|
| API 风格 | RESTful | 标准方案，Spring MVC 原生支持，接口简单无需 GraphQL |
| 流式通信 | SSE（Flux&lt;ServerSentEvent&gt;） | WebFlux 响应式流，支持背压、取消、超时 |

**错误处理分层策略：**
- **管线前段（LLM 超时/返回异常）**：友好提示 + 自动重试按钮
- **管线后段（JSX 编译失败/DOM 渲染异常/Fabric.js 转换失败）**：提示"生成结果有问题，要重新生成吗？" + 保留 LLM 原始输出供调试
- **原则**：不暴露技术堆栈信息给用户

### 安全

| 决策 | 选择 | 理由 |
|---|---|---|
| 认证授权 | MVP 不实现 | PRD MVP 范围无用户系统 |
| LLM 代码沙箱 | MVP 不处理 | 当前自用，LLM 输出可控，后续迭代加安全层 |

### 基础设施与部署

| 决策 | 选择 | 理由 |
|---|---|---|
| 部署平台 | K8s | 用户确认 |
| CI/CD | MVP 不搞 | 先本地开发部署，后续按需引入 |
| 中文字体 | 字体文件打包到项目 | 不依赖网络 CDN，Canvas 渲染可靠性优先，接受包体积增大 |

### 决策影响分析

**实现顺序：**
1. 项目脚手架初始化（Vite + Spring Initializr）
2. shadcn/ui + Tailwind v3.4 配置
3. Zustand store 基础结构
4. SSE 通信层（Spring WebFlux → React）
5. LLM 编排层 + System Prompt
6. Babel standalone 运行时编译 + 延迟加载
7. DOM → Fabric.js 转换引擎
8. 画布编辑交互 + 命令模式撤销/重做
9. 导出功能
10. MongoDB 持久化（后续版本）

**跨组件依赖：**
- Tailwind v3.4 类名白名单 → 同时约束 System Prompt 设计和 DOM→Fabric.js 转换器
- Zustand store → 连接 SSE 状态、画布命令栈、对话历史
- Babel standalone → 核心管线必经节点，编译失败触发管线后段错误处理
- 中文字体文件 → 需同时在前端 UI 和 Fabric.js Canvas 中加载，延迟加载策略需统一

## 实现模式与一致性规则

### 命名模式

**前端代码（TypeScript/React）：**

| 场景 | 规则 | 示例 |
|---|---|---|
| React 组件 | PascalCase 文件 + 导出 | `EditorCanvas.tsx` → `export function EditorCanvas()` |
| Hooks | camelCase，use 前缀 | `useCanvasStore.ts` |
| 工具函数 | camelCase | `parseDomToFabric.ts` |
| 常量 | UPPER_SNAKE_CASE | `MAX_CANVAS_WIDTH = 1080` |
| Zustand Store | camelCase，use 前缀 | `useEditorStore.ts` |
| 类型/接口 | PascalCase，无 I 前缀 | `CanvasElement`, `SseMessage` |

**后端代码（Java/Spring Boot）：**

| 场景 | 规则 | 示例 |
|---|---|---|
| 包名 | 小写点分隔 | `com.seede.api.controller` |
| 类名 | PascalCase | `PosterGenerateController` |
| 方法/变量 | camelCase | `generatePoster()` |
| 常量 | UPPER_SNAKE_CASE | `DEFAULT_CANVAS_WIDTH` |
| REST 端点 | 小写复数 + 短横线 | `/api/posters`, `/api/poster-generations` |
| MongoDB 集合 | 小写复数 | `posters`, `conversations` |

**数据交换：**

| 场景 | 规则 | 示例 |
|---|---|---|
| JSON 字段 | camelCase | `posterTitle`, `canvasWidth` |
| 日期格式 | ISO 8601 | `2026-04-02T08:00:00Z` |

### 结构模式

**前端项目组织（按功能）：**

```text
src/
├── features/
│   ├── input/               # 输入页
│   │   ├── InputPage.tsx
│   │   └── components/
│   ├── editor/              # 编辑器页
│   │   ├── EditorPage.tsx
│   │   ├── components/      # 画布、工具栏、左栏等
│   │   ├── hooks/
│   │   └── stores/          # Zustand stores
│   └── generation/          # AI 生成管线
│       ├── services/        # SSE 连接、Babel 编译
│       └── hooks/
├── engine/                  # DOM → Fabric.js 转换引擎
├── shared/                  # 共享组件、工具函数
│   ├── components/          # shadcn/ui 组件
│   └── utils/
├── __tests__/               # 集中式测试目录（镜像 src/ 结构）
│   ├── features/
│   │   ├── input/
│   │   ├── editor/
│   │   └── generation/
│   ├── engine/
│   └── shared/
├── App.tsx
└── main.tsx
```

**后端项目组织：**

```text
src/main/java/com/seede/
├── controller/              # REST Controller
├── service/                 # 业务逻辑
├── llm/                     # LLM 调用编排、System Prompt
├── config/                  # Spring 配置
└── model/                   # 数据模型（DTO / Entity）
```

**features 间 import 规则：**
- 允许跨 feature import 类型定义和服务
- 禁止跨 feature import 组件（组件跨 feature 说明功能边界划错）
- 需要跨 feature 共享的组件提升到 shared/

**测试命名规范：**
- 单元测试：`xxx.test.ts`
- 集成测试：`xxx.integration.test.ts`

### 格式模式

**API 响应统一包装：**

```json
{ "code": 200, "data": { ... }, "message": "success" }
{ "code": 400, "data": null, "message": "输入描述不能为空" }
{ "code": 500, "data": null, "message": "服务暂时不可用" }
```

**SSE 消息协议：**

```json
{ "type": "thinking", "content": "正在分析设计需求..." }
{ "type": "code_chunk", "content": "const colors = {..." }
{ "type": "complete", "content": "<完整JSX代码>" }
{ "type": "error", "content": "生成失败", "retryable": true }
```

### 通信模式

**Zustand Store 规范：**
- 每个 feature 可有独立 store，放在 `features/xxx/stores/`
- Store 命名：`useXxxStore`
- 状态更新：immutable（Zustand 默认行为）
- Action 命名：动词开头（`addElement`, `removeElement`, `undoLastAction`）

**Fabric.js 事件 → Zustand 命令模式：**
- 事件监听统一在 `EditorCanvas` 组件的 `useEffect` 中注册
- Command 接口：`{ execute(): void, undo(): void, description: string, timestamp: number }`
- 命令栈最大深度：50（防止内存膨胀）

**engine/ 模块接口规范：**

```typescript
interface ConversionResult {
  canvas: fabric.Canvas
  elements: CanvasElement[]
  warnings: string[]  // 转换中跳过的不支持样式
}

// 单一入口函数
function convertDomToCanvas(
  domRoot: HTMLElement,
  canvasConfig: CanvasConfig
): ConversionResult
```

- 对外统一单一入口 + 结构化返回
- 内部按元素类型或样式类型拆分为独立 handler（实现细节）
- warnings 记录不支持的样式，供用户提示和后续扩展参考

### 流程模式

**错误处理规范：**
- 前端：所有 API 调用通过统一的 `request` 工具函数，自动处理 code !== 200
- 后端：全局异常处理器（`@ControllerAdvice`），统一包装为响应格式
- 管线错误：按分层策略处理（前段友好提示+重试，后段重新生成提示）
- 日志：后端用 SLF4J，前端用 `console.error`（MVP 不引入日志库）

**加载状态规范：**
- 全局加载状态放 Zustand
- 命名：`isXxxLoading`（如 `isGenerating`, `isExporting`）
- 骨架屏/loading 动画：shadcn/ui Skeleton 组件

### 测试优先级约定

**必须有测试（核心管线）：**
- `engine/`（DOM → Fabric.js 转换）：输入 DOM 结构 → 验证输出 Fabric.js 对象
- SSE 消息解析：验证各种 type 的消息能正确解析
- 命令模式的 undo/redo：验证操作可逆

**可以后补（UI 交互）：**
- 组件渲染测试
- 页面集成测试

**不需要（MVP）：**
- E2E 测试
- 性能测试

### AI Agent 强制规则

**所有 AI Agent 必须遵守：**
1. 前端文件命名与导出名一致，组件 PascalCase，其余 camelCase
2. API 端点一律小写复数 + 短横线，响应使用统一包装格式
3. JSON 字段一律 camelCase，日期 ISO 8601
4. 前端按功能组织代码，不按类型
5. 新增 Zustand store 必须放在对应 feature 的 stores/ 下
6. 画布操作必须通过命令模式，确保可撤销
7. 不引入未在架构文档中列出的依赖，需要时先讨论
8. engine/ 对外只暴露 `convertDomToCanvas` 单一入口
9. TypeScript strict mode，禁止 any 类型

**反模式（禁止）：**
- 在组件中直接操作 Fabric.js canvas（必须通过 hook/store）
- API 响应不包装直接返回
- 跨 features/ import 组件（类型和服务允许）
- 硬编码 LLM 相关配置（必须通过后端配置）

## 项目结构与边界

### 需求到架构映射

| FR 领域 | 前端位置 | 后端位置 |
|---|---|---|
| FR1-FR4 海报生成 | `features/input/` + `features/generation/` | `controller/` + `service/` + `llm/` |
| FR5-FR7 DOM→画布转换 | `engine/` | — |
| FR8-FR16 画布编辑 | `features/editor/` | — |
| FR17-FR19 AI交互优化 | `features/editor/` + `features/generation/` | `controller/` + `service/` |
| FR20 导出 | `features/editor/` | — |
| FR21 LLM配置 | — | `config/` + `llm/` |

### 完整项目目录结构

```text
seede-ai/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js              # Tailwind v3.4 + LLM 类名白名单
│   ├── postcss.config.js
│   ├── index.html
│   ├── .env.example                    # VITE_API_BASE_URL 等
│   ├── .gitignore
│   ├── components.json                 # shadcn/ui 配置
│   ├── public/
│   │   └── fonts/                      # 中文字体文件
│   │       ├── AlibabaPuHuiTi-Regular.woff2
│   │       ├── AlibabaPuHuiTi-Bold.woff2
│   │       └── NotoSansSC-Regular.woff2
│   └── src/
│       ├── main.tsx                    # 应用入口
│       ├── App.tsx                     # 根组件（条件渲染路由）
│       ├── index.css                   # Tailwind directives + 字体声明
│       ├── vite-env.d.ts
│       ├── features/
│       │   ├── input/                  # 输入页 ← FR1, FR14
│       │   │   ├── InputPage.tsx
│       │   │   └── components/
│       │   │       ├── PromptInput.tsx  # 文本输入区
│       │   │       ├── SizeSelector.tsx # 尺寸选择
│       │   │       └── PresetCases.tsx  # 预设案例入口
│       │   ├── editor/                 # 编辑器页 ← FR8-FR16, FR17-FR18, FR20
│       │   │   ├── EditorPage.tsx      # 左右分栏主组件
│       │   │   ├── components/
│       │   │   │   ├── CanvasPanel.tsx  # Fabric.js 画布容器
│       │   │   │   ├── StreamPanel.tsx  # SSE 流式输出展示
│       │   │   │   ├── Toolbar.tsx      # 工具栏
│       │   │   │   ├── ChatDialog.tsx   # 对话优化 ← FR18
│       │   │   │   └── RollButton.tsx   # 单元素 Roll ← FR17
│       │   │   ├── hooks/
│       │   │   │   ├── useFabricCanvas.ts    # Fabric.js 初始化与事件绑定
│       │   │   │   ├── useCanvasCommands.ts  # 命令模式撤销/重做
│       │   │   │   └── useExport.ts          # PNG 导出 ← FR20
│       │   │   └── stores/
│       │   │       └── useEditorStore.ts     # 编辑器状态
│       │   └── generation/             # AI 生成管线 ← FR2-FR4, FR17-FR19
│       │       ├── services/
│       │       │   ├── sseClient.ts    # SSE 连接 + 消息解析
│       │       │   ├── jsxCompiler.ts  # Babel standalone（延迟加载）
│       │       │   └── canvasSerializer.ts  # 画布序列化 ← FR19
│       │       ├── hooks/
│       │       │   ├── useGenerate.ts  # 海报生成 hook
│       │       │   └── useRoll.ts      # Roll hook ← FR17
│       │       └── types/
│       │           └── sseMessages.ts  # SSE 消息类型
│       ├── engine/                     # DOM → Fabric.js 转换引擎 ← FR5-FR7
│       │   ├── index.ts               # 单一入口：convertDomToCanvas()
│       │   ├── types.ts               # ConversionResult, CanvasConfig, CanvasElement
│       │   ├── handlers/
│       │   │   ├── textHandler.ts     # 文本 → fabric.Textbox
│       │   │   ├── shapeHandler.ts    # 形状 → fabric.Rect
│       │   │   ├── imageHandler.ts    # 图片 → fabric.Image
│       │   │   └── groupHandler.ts    # 嵌套容器 → fabric.Group
│       │   ├── parsers/
│       │   │   ├── layoutParser.ts    # getBoundingClientRect → 绝对坐标
│       │   │   └── styleParser.ts     # 计算样式 → Fabric.js 属性
│       │   └── utils/
│       │       └── fontLoader.ts      # 字体异步加载
│       ├── shared/
│       │   ├── components/
│       │   │   └── ui/                # shadcn/ui 组件
│       │   ├── utils/
│       │   │   ├── request.ts         # 统一 API 请求封装
│       │   │   └── cn.ts             # className 合并
│       │   └── types/
│       │       └── api.ts            # ApiResponse<T> 类型
│       └── __tests__/                 # 集中式测试（镜像 src/）
│           ├── engine/
│           │   ├── convertDomToCanvas.test.ts
│           │   ├── textHandler.test.ts
│           │   └── layoutParser.test.ts
│           ├── features/
│           │   ├── generation/
│           │   │   ├── sseClient.test.ts
│           │   │   └── canvasSerializer.test.ts
│           │   └── editor/
│           │       └── useCanvasCommands.test.ts
│           └── shared/
│               └── request.test.ts
├── backend/
│   ├── pom.xml
│   ├── .gitignore
│   └── src/
│       ├── main/
│       │   ├── java/com/seede/
│       │   │   ├── SeedeApplication.java
│       │   │   ├── controller/
│       │   │   │   ├── PosterController.java       # POST /api/posters/generate
│       │   │   │   ├── RollController.java         # POST /api/posters/roll
│       │   │   │   └── ChatController.java         # POST /api/posters/chat
│       │   │   ├── service/
│       │   │   │   ├── PosterGenerateService.java
│       │   │   │   ├── RollService.java
│       │   │   │   └── ChatOptimizeService.java
│       │   │   ├── llm/
│       │   │   │   ├── LlmClient.java              # OpenAI 协议兼容客户端
│       │   │   │   ├── SystemPromptManager.java    # Prompt 版本化管理
│       │   │   │   └── LlmResponseParser.java
│       │   │   ├── config/
│       │   │   │   ├── LlmConfig.java              # LLM 配置
│       │   │   │   ├── WebConfig.java              # CORS 配置
│       │   │   │   └── SseConfig.java
│       │   │   └── model/
│       │   │       ├── dto/
│       │   │       │   ├── GenerateRequest.java
│       │   │       │   ├── RollRequest.java
│       │   │       │   ├── ChatRequest.java
│       │   │       │   └── ApiResponse.java        # 统一响应包装
│       │   │       └── SseMessage.java
│       │   └── resources/
│       │       ├── application.yml
│       │       ├── application-dev.yml
│       │       └── prompts/                        # System Prompt 文件
│       │           ├── poster-generate.md
│       │           ├── poster-roll.md
│       │           └── poster-chat.md
│       └── test/java/com/seede/
│           ├── controller/
│           ├── service/
│           └── llm/
└── README.md
```

### 架构边界

**API 边界：**

| 端点 | 方法 | 通信方式 | 前端调用方 |
|---|---|---|---|
| `/api/posters/generate` | POST | SSE（Flux） | `useGenerate` hook |
| `/api/posters/roll` | POST | SSE（Flux） | `useRoll` hook |
| `/api/posters/chat` | POST | SSE（Flux） | `ChatDialog` 组件 |

**前端组件通信边界：**

```text
InputPage ──提交──→ App（切换页面 + 传递 prompt）──→ EditorPage
                                                        │
EditorPage ─── StreamPanel（左栏，只读展示）
    │
    ├── CanvasPanel ←→ useFabricCanvas（Fabric.js 事件）
    │       ↕
    │   useCanvasCommands（命令栈 ←→ Zustand）
    │
    ├── Toolbar → 调用 store actions
    ├── RollButton → useRoll → sseClient → engine
    └── ChatDialog → generation/services → sseClient → engine
```

**核心数据流：**

```text
用户输入 prompt
  → POST /api/posters/generate
  → Spring Boot: LlmClient 调用 GLM-5
  → SSE 流式返回 { type: "code_chunk" / "complete" }
  → 前端 sseClient 接收 + 拼接
  → jsxCompiler（Babel standalone）编译 JSX → JS
  → 创建隐藏 DOM 容器渲染组件
  → engine/convertDomToCanvas() 解析 DOM → Fabric.js 对象
  → Fabric.js canvas 展示
  → 用户编辑 → 命令模式记录 → 导出 PNG
```

## 架构验证结果

### 一致性验证 ✅

**技术兼容性：** 无冲突。Vite 8 + React + TypeScript + Tailwind v3.4 + Fabric.js v7 + Zustand v5 + shadcn/ui + Babel standalone 全部兼容。Spring Boot 3.5.12（web + webflux 共存 Tomcat）已验证可行。

**模式一致性：** 无矛盾。命名规范两端一致，功能组织与 Zustand store 位置对齐，API 包装与错误处理前后端协议一致。

**结构对齐：** 决策与结构完全匹配。engine/ 单一入口、System Prompt 版本化管理、集中式测试镜像结构均已落实。

### 需求覆盖验证 ✅

**功能需求：21/21 全覆盖**

| FR | 描述 | 架构支撑 |
|---|---|---|
| FR1 | 自然语言输入 | `InputPage` + `PromptInput` |
| FR2 | 发送至 LLM | `useGenerate` → `sseClient` → `PosterController` → `LlmClient` |
| FR3 | SSE 流式展示 | `StreamPanel` + `sseClient` ← `Flux<ServerSentEvent>` |
| FR4 | JSX 渲染为 DOM | `jsxCompiler`（Babel standalone） |
| FR5-FR7 | DOM→Fabric.js 转换 | `engine/` 模块（parsers + handlers） |
| FR8-FR12 | 画布编辑 | `useFabricCanvas` + Fabric.js 原生能力 |
| FR13 | 撤销/重做 | `useCanvasCommands`（命令模式） |
| FR14 | 尺寸选择 | `SizeSelector` |
| FR15-FR16 | 删除/添加元素 | `Toolbar` actions |
| FR17 | Roll 单元素 | `RollButton` + `useRoll` + `RollController` |
| FR18 | 对话优化 | `ChatDialog` + `ChatController` |
| FR19 | 画布序列化 | `canvasSerializer` |
| FR20 | PNG 导出 | `useExport` |
| FR21 | LLM 可配置 | `LlmConfig` + `LlmClient` |

**非功能需求：全覆盖**
- 性能（SSE 流式 + 画布流畅）：WebFlux + Fabric.js 原生交互
- 导出质量（≥1080px）：CanvasConfig 配置
- 集成（OpenAI 协议）：LlmClient 抽象层
- 中文支持：`public/fonts/` + `fontLoader.ts`

### 缺口分析

**无关键缺口。** 次要项（不阻塞实现）：

| 级别 | 缺口 | 处理方式 |
|---|---|---|
| 次要 | 导出分辨率常量未显式定义 | engine/types.ts 的 CanvasConfig 中定义 `MIN_EXPORT_WIDTH = 1080` |
| 次要 | Vite 开发代理配置未提及 | vite.config.ts 配置 `/api` 代理到 Spring Boot |
| 次要 | JSX 渲染隐藏 DOM 容器 | 作为 jsxCompiler.ts 内部实现 |

### 架构完备性检查清单

**✅ 需求分析**
- [x] 项目上下文彻底分析
- [x] 规模和复杂度评估
- [x] 技术约束识别
- [x] 跨切面关注点映射

**✅ 架构决策**
- [x] 关键决策文档化（含版本）
- [x] 技术栈完整指定
- [x] 集成模式定义
- [x] 性能考量

**✅ 实现模式**
- [x] 命名规范建立
- [x] 结构模式定义
- [x] 通信模式指定
- [x] 流程模式文档化

**✅ 项目结构**
- [x] 完整目录结构定义
- [x] 组件边界建立
- [x] 集成点映射
- [x] 需求到结构映射完成

### 架构就绪评估

**整体状态：** 准备就绪，可进入实现阶段

**信心等级：** 高

**关键优势：**
- 核心管线数据流清晰（用户输入 → LLM → JSX → DOM → Fabric.js → 编辑 → 导出）
- 技术选型务实，符合单人开发资源约束
- engine/ 模块接口明确，最大风险点有清晰架构支撑
- 命令模式确保画布操作可撤销
- 错误处理分层策略完善

**后续增强方向：**
- MongoDB 持久化层（MVP 第二版）
- LLM 代码执行安全沙箱
- CI/CD 流水线
- E2E 测试覆盖

### 实现交接

**AI Agent 指引：**
- 严格遵循本文档的所有架构决策
- 在所有组件中一致使用实现模式
- 尊重项目结构和边界
- 架构问题以本文档为准

**首要实现优先级：**
1. 前端：`npm create vite@latest seede-ai-frontend -- --template react-ts`
2. 后端：通过 start.spring.io 生成 Spring Boot 项目（web + webflux）
3. 配置 Tailwind v3.4 + shadcn/ui + Zustand
4. 搭建 SSE 通信层验证前后端连通
