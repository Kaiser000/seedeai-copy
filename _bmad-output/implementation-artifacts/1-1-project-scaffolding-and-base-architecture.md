# Story 1.1: 项目脚手架与基础架构搭建

Status: done

## Story

As a 开发者,
I want 使用架构文档指定的技术栈初始化前后端项目并配置好基础开发环境,
So that 后续所有功能开发都有一致的项目结构和工具链基础。

## Acceptance Criteria

1. **Given** 一台全新的开发环境 **When** 按照本故事完成所有初始化步骤 **Then** 前端项目（Vite + React + TypeScript）可以通过 `npm run dev` 启动并显示默认页面
2. **And** Tailwind CSS v3.4.x 已配置，自定义类名白名单已定义
3. **And** shadcn/ui 已初始化，至少一个组件（Button）可正常使用
4. **And** Zustand v5 已安装，基础 store 结构（`useEditorStore`）已创建
5. **And** 前端项目结构按架构文档组织（`features/input/`、`features/editor/`、`features/generation/`、`engine/`、`shared/`）
6. **And** 后端项目（Spring Boot 3.5.12，web + webflux）可以通过 Maven 启动并响应健康检查请求
7. **And** 后端项目结构按架构文档组织（`controller/`、`service/`、`llm/`、`config/`、`model/`）
8. **And** 前端 Vite 开发代理已配置，`/api` 请求代理到 Spring Boot 后端
9. **And** TypeScript strict mode 已启用，ESLint 已配置
10. **And** App.tsx 实现条件渲染路由（输入页 / 编辑器页），默认显示输入页
11. **And** API 响应统一包装类 `ApiResponse<T>` 已创建（`{ code, data, message }` 格式）

## Tasks / Subtasks

- [x] Task 1: 前端项目初始化 (AC: #1)
  - [x] 运行 `npm create vite@latest seede-ai-frontend -- --template react-ts` 创建项目
  - [x] 验证 `npm run dev` 启动成功
- [x] Task 2: Tailwind CSS v3.4.x 配置 (AC: #2)
  - [x] 安装 tailwindcss@3.4.x postcss autoprefixer
  - [x] 创建 `tailwind.config.js`，定义 LLM 可使用的 Tailwind 类名白名单（safelist）
  - [x] 配置 `postcss.config.js`
  - [x] 在 `index.css` 添加 Tailwind directives（@tailwind base/components/utilities）
- [x] Task 3: shadcn/ui 初始化 (AC: #3)
  - [x] 运行 `npx shadcn-ui@latest init` 初始化
  - [x] 创建 `components.json` 配置
  - [x] 安装 Button 组件验证可用：`npx shadcn-ui@latest add button`
  - [x] 创建 `shared/utils/cn.ts`（className 合并工具函数）
- [x] Task 4: Zustand v5 安装与基础 Store (AC: #4)
  - [x] `npm install zustand@5`
  - [x] 创建 `features/editor/stores/useEditorStore.ts`
  - [x] Store 包含基础状态：currentPage、isGenerating、sseMessages
- [x] Task 5: 前端项目结构搭建 (AC: #5)
  - [x] 创建 `src/features/input/`（InputPage.tsx + components/）
  - [x] 创建 `src/features/editor/`（EditorPage.tsx + components/ + hooks/ + stores/）
  - [x] 创建 `src/features/generation/`（services/ + hooks/ + types/）
  - [x] 创建 `src/engine/`（index.ts + types.ts + handlers/ + parsers/ + utils/）
  - [x] 创建 `src/shared/`（components/ui/ + utils/ + types/）
  - [x] 创建 `src/__tests__/`（镜像 src/ 结构）
- [x] Task 6: 后端项目初始化 (AC: #6)
  - [x] 通过 Spring Initializr 生成 Spring Boot 3.5.12 项目（spring-boot-starter-web + spring-boot-starter-webflux）
  - [x] Maven 构建工具，Java 语言
  - [x] 验证 Maven 启动成功，健康检查端点响应正常（使用 sdkman Java 21.0.2 验证通过）
- [x] Task 7: 后端项目结构搭建 (AC: #7)
  - [x] 创建包结构：`com.seede.controller/`、`com.seede.service/`、`com.seede.llm/`、`com.seede.config/`、`com.seede.model/`（含 dto/ 子包）
  - [x] 创建 `SeedeApplication.java` 主入口
- [x] Task 8: Vite 开发代理配置 (AC: #8)
  - [x] 在 `vite.config.ts` 配置 `/api` 代理到 `http://localhost:8080`
- [x] Task 9: TypeScript strict mode + ESLint (AC: #9)
  - [x] `tsconfig.json` 启用 strict mode
  - [x] 配置 ESLint（禁止 any 类型规则）
- [x] Task 10: App.tsx 条件渲染路由 (AC: #10)
  - [x] App.tsx 根据 `useEditorStore.currentPage` 条件渲染 InputPage / EditorPage
  - [x] 默认显示 InputPage
  - [x] 不引入 React Router
- [x] Task 11: API 响应统一包装 (AC: #11)
  - [x] 后端创建 `model/dto/ApiResponse.java`：`{ code, data, message }`
  - [x] 前端创建 `shared/types/api.ts`：`ApiResponse<T>` 类型定义
  - [x] 前端创建 `shared/utils/request.ts`：统一 API 请求封装（自动处理 code !== 200）

## Dev Notes

### 架构约束
- 前端 Vite 8.0.3（基于 Rolldown），`npm create vite@latest` 使用 react-ts 模板
- Tailwind CSS 必须用 v3.4.x（非 v4），因为 LLM 训练数据覆盖 v3 更充分，`tailwind.config.js` 可定义类名白名单
- shadcn/ui 基于 Radix UI + Tailwind CSS
- Zustand v5.0.x，Store 命名以 `use` 前缀、camelCase
- 后端 Spring Boot 3.5.12，Maven 构建，web + webflux 共存（Tomcat 容器）
- TypeScript strict mode，禁止 any 类型
- MVP 路由采用条件渲染（仅输入页 + 编辑器页），不引入 React Router

### 命名规范
- React 组件：PascalCase 文件 + 导出（如 `EditorCanvas.tsx`）
- Hooks：camelCase，use 前缀（如 `useCanvasStore.ts`）
- 工具函数：camelCase（如 `parseDomToFabric.ts`）
- 常量：UPPER_SNAKE_CASE
- 类型/接口：PascalCase，无 I 前缀
- 后端包名：小写点分隔（`com.seede.api.controller`）
- REST 端点：小写复数 + 短横线

### 反模式（禁止）
- 跨 features/ import 组件（类型和服务允许）
- API 响应不包装直接返回
- 硬编码 LLM 配置

### Project Structure Notes
- 前端按功能（features）组织，非按类型
- `engine/` 模块为独立目录，不在 features 下
- `shared/` 存放跨 feature 共享的组件和工具
- `__tests__/` 集中式测试目录，镜像 src/ 结构
- 后端按层组织：controller → service → llm → config → model

### References
- [Source: architecture.md#Starter模板评估] — Vite + React + TypeScript 初始化命令、Spring Initializr 配置
- [Source: architecture.md#核心架构决策] — 技术栈版本选型
- [Source: architecture.md#实现模式与一致性规则] — 命名规范、结构模式
- [Source: architecture.md#完整项目目录结构] — 完整文件结构参考
- [Source: architecture.md#AI Agent强制规则] — 9条强制规则 + 4条反模式
- [Source: epics.md#Story 1.1] — 完整验收标准

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### Debug Log References
- 初始系统默认 Java 8，通过 sdkman 切换到 Java 21.0.2 后 Maven 构建和 Spring Boot 启动均验证通过
- pom.xml 中 java.version=21，需使用 `sdk use java 21.0.2` 或设置 `sdk default java 21.0.2`

### Completion Notes List
- ✅ Task 1: 前端使用 `npm create vite@latest frontend -- --template react-ts` 创建，Vite 8.0.3 + React + TypeScript，dev server 启动验证通过
- ✅ Task 2: Tailwind CSS 3.4.x 安装配置，定义了全面的 LLM 可用类名白名单（safelist），包括布局、间距、文字、颜色、边框、阴影等模式
- ✅ Task 3: shadcn/ui 初始化完成，组件路径配置为 `@/shared/components/ui`，Button 组件已安装并可用，cn.ts 工具函数已创建
- ✅ Task 4: Zustand v5 已安装，useEditorStore 创建完成，包含 currentPage、isGenerating、sseMessages 状态及相关 actions
- ✅ Task 5: 前端完整目录结构已按架构文档搭建（features/input、features/editor、features/generation、engine、shared、__tests__）
- ✅ Task 6: 后端 Spring Boot 3.5.12 项目文件结构已创建（pom.xml + SeedeApplication + HealthController + application.yml）
- ✅ Task 7: 后端包结构已按架构文档创建（controller、service、llm、config、model/dto），含测试包结构
- ✅ Task 8: Vite 开发代理配置完成，/api 请求代理到 http://localhost:8080
- ✅ Task 9: TypeScript strict mode 已启用（Vite 模板默认），ESLint 已配置禁止 any 类型规则
- ✅ Task 10: App.tsx 基于 useEditorStore.currentPage 条件渲染 InputPage/EditorPage，默认 InputPage，未引入 React Router
- ✅ Task 11: 后端 ApiResponse<T> 泛型包装类已创建（含静态工厂方法），前端 ApiResponse<T> 类型定义和 request.ts 统一请求封装已创建
- ✅ 后端 Maven 构建 + Spring Boot 启动 + 健康检查端点验证通过（Java 21.0.2 via sdkman）

### File List
frontend/package.json
frontend/vite.config.ts
frontend/tsconfig.json
frontend/tsconfig.app.json
frontend/tailwind.config.js
frontend/postcss.config.js
frontend/components.json
frontend/eslint.config.js
frontend/src/index.css
frontend/src/App.tsx
frontend/src/main.tsx
frontend/src/features/input/InputPage.tsx
frontend/src/features/editor/EditorPage.tsx
frontend/src/features/editor/stores/useEditorStore.ts
frontend/src/engine/index.ts
frontend/src/engine/types.ts
frontend/src/shared/utils/cn.ts
frontend/src/shared/utils/index.ts
frontend/src/shared/utils/request.ts
frontend/src/shared/types/api.ts
frontend/src/shared/components/ui/button.tsx
backend/pom.xml
backend/.gitignore
backend/src/main/java/com/seede/SeedeApplication.java
backend/src/main/java/com/seede/controller/HealthController.java
backend/src/main/java/com/seede/model/dto/ApiResponse.java
backend/src/main/resources/application.yml
backend/src/main/resources/application-dev.yml

### Change Log
- 2026-04-03: 完成项目脚手架与基础架构搭建（Story 1.1 全部 11 个任务）
