# Story 1.4: JSX 运行时编译与 DOM 渲染

Status: done

## Story

As a 海报设计用户,
I want AI 生成的代码能自动编译并渲染出可视化的海报预览,
So that 我无需理解代码就能看到 AI 的设计成果。

## Acceptance Criteria

1. **Given** 前端收到 `complete` 类型的 SSE 消息，包含完整 JSX + Tailwind CSS 代码 **When** 触发 JSX 编译流程 **Then** `jsxCompiler` 通过动态导入加载 `@babel/standalone`（延迟加载，不阻塞首屏）**And** Babel 将 JSX 代码转换为可执行的 JavaScript
2. **Given** JSX 代码已编译为 JavaScript **When** 执行渲染流程 **Then** 系统创建隐藏的 DOM 容器，注入 Tailwind CSS 样式环境 **And** 编译后的 JavaScript 渲染为真实 DOM 结构 **And** DOM 元素正确应用 Tailwind CSS 样式（纯色背景、文本样式、边框、布局）
3. **Given** LLM 生成的 JSX 代码存在语法错误 **When** Babel 编译失败 **Then** 系统显示"生成结果有问题，要重新生成吗？"的友好提示 **And** 保留 LLM 原始输出（在左栏 StreamPanel 中可见）供调试参考 **And** 提供"重新生成"按钮
4. **Given** 用户首次进入编辑器页 **When** 尚未触发过生成请求 **Then** `@babel/standalone` 未被加载（验证延迟加载策略生效）

## Tasks / Subtasks

- [x] Task 1: jsxCompiler 服务——Babel 延迟加载 (AC: #1, #4)
  - [x] 创建 `features/generation/services/jsxCompiler.ts`
  - [x] 使用 `dynamic import()` 加载 `@babel/standalone`（~700KB gzip）
  - [x] 仅在首次调用 compile() 时加载，缓存已加载的 Babel 实例
  - [x] 安装依赖：`npm install @babel/standalone@7.29.x`
  - [x] 添加 `@babel/standalone` 的 TypeScript 类型声明
- [x] Task 2: JSX 编译逻辑 (AC: #1)
  - [x] `jsxCompiler.compile(jsxCode: string): Promise<string>`
  - [x] Babel transform 配置：presets 使用 `['react']`
  - [x] 编译后返回可执行的 JavaScript 字符串
- [x] Task 3: DOM 渲染容器 (AC: #2)
  - [x] 创建隐藏的 DOM 容器（`div` 设置 `visibility: hidden; position: absolute`）
  - [x] 容器尺寸设为用户选择的海报尺寸（width × height）
  - [x] 注入 Tailwind CSS 样式环境（确保 Tailwind 类名在隐藏容器中生效）
- [x] Task 4: JSX 渲染为 DOM (AC: #2)
  - [x] 将编译后的 JS 通过 `new Function()` 或 `eval()` 执行
  - [x] 使用 React.createElement + ReactDOM.render 渲染到隐藏容器
  - [x] 确保 DOM 元素正确应用 Tailwind 样式
- [x] Task 5: 编译/渲染管线串联 (AC: #1, #2)
  - [x] 在 `useGenerate` hook 中：收到 complete 消息 → 调用 jsxCompiler.compile → 渲染 DOM
  - [x] 渲染成功后，触发 Story 1.5 的 DOM → Fabric.js 转换（本 Story 留出接口）
- [x] Task 6: 错误处理——编译失败 (AC: #3)
  - [x] 捕获 Babel 编译异常
  - [x] 显示"生成结果有问题，要重新生成吗？"友好提示
  - [x] 保留 LLM 原始输出在 StreamPanel 可见
  - [x] 提供重新生成按钮
- [x] Task 7: 错误处理——渲染失败 (AC: #3)
  - [x] 捕获 DOM 渲染异常
  - [x] 同编译失败的用户体验处理

## Dev Notes

### 架构约束
- `@babel/standalone` v7.29.x 必须延迟加载（dynamic import），不能出现在首屏 bundle 中
- 延迟加载触发时机：用户提交生成请求后（非进入编辑器页时）
- 编译后的 JS 代码执行环境需提供 React 全局变量（因为编译后代码引用 React.createElement）
- Tailwind CSS v3.4.x 的样式在隐藏 DOM 容器中也需生效
- 错误处理属于管线后段：提示"生成结果有问题，要重新生成吗？" + 保留原始输出

### 关键技术决策
- JSX 运行时编译 = Babel standalone（非 Sucrase，因更成熟、完整支持 JSX）
- DOM 容器必须隐藏但保持布局能力（`visibility: hidden` 而非 `display: none`），因后续需要 `getBoundingClientRect()` 获取元素坐标
- 隐藏容器尺寸 = 用户选择的海报尺寸

### 安全说明
- MVP 不实现 LLM 代码沙箱（当前自用，LLM 输出可控）
- 后续迭代需加安全层防止恶意代码执行

### 依赖 Story 1.3 产物
- SSE 消息接收和 complete 事件
- StreamPanel 组件
- useGenerate hook 基础结构

### Project Structure Notes
```
features/generation/services/jsxCompiler.ts  # Babel 延迟加载 + JSX 编译
```

### References
- [Source: architecture.md#核心架构决策] — @babel/standalone v7.29.x，延迟加载策略
- [Source: architecture.md#大文件延迟加载策略] — 用户提交后加载
- [Source: architecture.md#错误处理分层策略] — 管线后段错误处理方式
- [Source: epics.md#Story 1.4] — 完整验收标准

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)
### Debug Log References
### Completion Notes List
- Story 1.4 implemented: JSX runtime compilation with lazy-loaded @babel/standalone, hidden DOM rendering container with Tailwind CSS, and compile/render error handling.
### File List
- src/features/generation/services/jsxCompiler.ts
