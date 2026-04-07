# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 权限

Claude Code 拥有本项目所有文件的完全读写权限，包括创建、编辑、删除文件和执行命令，无需逐次确认。

## 编码规范

所有代码必须包含详细的注释和完善的日志输出，便于问题排查和代码理解。

## 项目概述

Seede AI 是一个 LLM 驱动的海报生成平台，核心流水线：
```
用户输入 → LLM 生成 React+Tailwind JSX → 浏览器端编译 → fabric.js 画布渲染 → PNG 导出
```

LLM 直接充当模板引擎，不维护设计模板库。

## 仓库结构

Monorepo，前后端独立构建：
- `frontend/` — React 19 + Vite + TypeScript（端口 5173）
- `backend/` — Spring Boot 3.5.12 + WebFlux（端口 8080，Java 21）
- `docs/` — 产品分析、工作流分析、技术方案、实现指南
- `_bmad-output/project-context.md` — AI Agent 详细规则（42 条，**实现代码前必读**）

## 构建与开发命令

### 前端（在 `frontend/` 目录下执行）
```bash
npm install          # 安装依赖
npm run dev          # Vite 开发服务器（端口 5173，/api 代理到 :8080）
npm run build        # TypeScript 类型检查 + Vite 生产构建
npm run lint         # ESLint 检查
npm test             # Vitest 单次运行
npm run test:watch   # Vitest 监听模式
```

### 后端（在 `backend/` 目录下执行）
```bash
mvn clean install        # 构建
mvn spring-boot:run      # 启动服务（端口 8080）
```

必填环境变量：`LLM_API_KEY`（智谱 AI 密钥，不允许设默认值，启动时 fail-fast 校验）。
可选：`LLM_API_URL`、`LLM_MODEL`（默认 glm-4.7）、`CORS_ALLOWED_ORIGINS`（默认 http://localhost:5173）。

## 架构

### 前端分层
- **`engine/`** — DOM 到 Canvas 的转换引擎，与 features 层完全解耦。每个 handler（text、image、shape、group）独立文件，由 `groupHandler.ts` 统一调度。
- **`features/editor/`** — 画布编辑器：组件、hooks、Zustand stores、画布注册表。
- **`features/generation/`** — JSX 编译（@babel/standalone）、SSE 客户端、序列化。
- **`features/input/`** — 用户输入表单（提示词、尺寸、预设）。
- **`shared/`** — 共享 UI 组件（shadcn/ui）、类型、工具函数。仅 `shared/utils/index.ts` 使用 barrel export。

### 状态管理（Zustand）
- `useEditorStore` — 生成流程状态、画布选中对象、对话历史。
- `useCanvasCommands` — 撤销/重做命令栈（独立 store）。
- 画布访问：`canvasRegistry.ts` 全局单例（`getGlobalCanvas()`），不通过 props 传递。假设同时只有一个 canvas。

### DOM→Canvas 流水线（核心复杂度）
```
JSX 字符串 → compileJsx()（@babel/standalone 编译）
  → renderToHiddenDom()（new Function + window.React 注入 + ReactDOM.createRoot 渲染）
  → 等待图片加载（Promise.all img.onload，无图片则 200ms 固定延迟）
  → convertDomToCanvas()（getBoundingClientRect 坐标转换 → 递归 handler → fabric.js 对象）
```

### 后端架构
- **纯 WebFlux** — 绝对不能添加 `spring-boot-starter-web`（会与 WebFlux 冲突）。
- SSE 流式响应：`Flux<ServerSentEvent<SseMessage>>`，事件序列：`thinking → code_chunk* → complete | error`。
- 提示词模板位于 `resources/prompts/`（poster-generate.md、poster-chat.md、poster-roll.md），使用 `{{variable}}` 语法。新增模板须同步更新 `SystemPromptManager` 的 `ALLOWED_TEMPLATES` 白名单。
- `chatHistory` 的 `role` 字段通过 `ALLOWED_ROLES` 白名单过滤，防止注入 system 角色。

### API 端点
| 端点 | 方法 | 响应 | 用途 |
|---|---|---|---|
| `/api/posters/generate` | POST | SSE | 初次生成海报 |
| `/api/posters/chat` | POST | SSE | 对话优化海报 |
| `/api/posters/roll` | POST | SSE | 单元素重新生成 |
| `/health` | GET | JSON | 健康检查 |

## 关键约束

### TypeScript（strict 模式，所有严格标志已启用）
- `verbatimModuleSyntax`：类型导入必须用 `import type { Foo }`，不可混用。
- 路径别名 `@/` 映射 `./src/`，跨目录引用始终用 `@/`，不用相对路径。
- catch 块必须命名参数：`catch (err)`，不允许空 catch。

### Tailwind
- 版本 **3.4**（非 4.x），使用 `tailwind.config.js` 配置，非 CSS-first。
- `tailwind.config.js` 中有大量 safelist，用于支持 LLM 生成的动态类名。

### React
- 版本 **19**（非 18）。
- `CanvasPanel` 和 `EditorPage` 中部分 `useEffect` 故意设空依赖并加了 eslint-disable 注释，**不要修改**。

### 必须避免的反模式
- 不要在 finally 块中省略 `document.body.removeChild(hiddenDiv)`。
- 不要对编译后的 JSX 使用 `eval()` — 必须用 `new Function('React', code)`。
- 不要在 WebFlux 响应式链中使用阻塞操作（`block()`、`Thread.sleep()`）。
- 不要在 application.yml 中为 `LLM_API_KEY` 设置默认值。

## 测试

- **前端**：Vitest + jsdom。测试文件位于 `src/__tests__/{layer}/{feature}/`。fabric.js 需在 import 前用 `vi.mock('fabric', ...)` mock。Zustand store 在 `beforeEach` 中重置状态。
- **后端**：Spring Boot Test（JUnit）。
