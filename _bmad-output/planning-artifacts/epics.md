---
stepsCompleted:
  - step-01-validate-prerequisites
  - step-02-design-epics
  - step-03-create-stories
  - step-04-final-validation
status: complete
completedAt: '2026-04-02'
inputDocuments:
  - prd.md
  - architecture.md
---

# Seede AI - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for Seede AI, decomposing the requirements from the PRD, UX Design if it exists, and Architecture requirements into implementable stories.

## Requirements Inventory

### Functional Requirements

FR1: 用户可以通过自然语言描述输入海报需求（包括主题、内容、风格、配色等）
FR2: 系统可以将用户输入发送至 LLM 进行需求分析和代码生成
FR3: 系统可以通过 SSE 流式输出实时展示 LLM 生成过程
FR4: 系统可以将 LLM 生成的 JSX + Tailwind CSS 代码编译渲染为 DOM
FR5: 系统可以解析渲染后的 DOM 树，识别文本、形状、图片等元素节点
FR6: 系统可以将 DOM 元素转换为对应的 Fabric.js 画布对象（支持基础样式子集：纯色、文本、图片、简单边框）
FR7: 系统可以在画布上保持 DOM 渲染时的布局和层级关系
FR8: 用户可以在画布上选中任意元素
FR9: 用户可以拖拽元素调整位置
FR10: 用户可以缩放元素调整大小
FR11: 用户可以双击文字元素进行内容编辑
FR12: 用户可以修改文字的基础样式（颜色、字号）
FR13: 用户可以撤销和重做画布上的编辑操作
FR14: 用户可以选择或查看海报的尺寸规格
FR15: 用户可以删除画布上的选中元素
FR16: 用户可以在画布上添加新的文字元素
FR17: 用户可以对选中的单个元素触发 AI 重新生成（Roll），获得替代方案
FR18: 用户可以通过对话框向 AI 描述修改意图，AI 基于当前画布状态生成调整后的完整设计并替换画布
FR19: 系统可以将当前画布的结构化描述（元素类型、位置、内容、样式）序列化为 LLM 可理解的上下文格式
FR20: 用户可以将画布内容一键导出为 PNG 图片
FR21: 系统支持可配置的 LLM 接口（OpenAI 协议兼容），可切换不同模型

### NonFunctional Requirements

NFR1: LLM 生成过程采用 SSE 流式输出，用户在流式输出期间不视为等待，无响应时间硬性要求
NFR2: 画布编辑操作（拖拽、缩放、选中、文字编辑）应尽量流畅，无明显卡顿
NFR3: 撤销/重做操作应即时响应
NFR4: 导出的 PNG 图片与画布上所见一致（所见即所得），分辨率不低于 1080px 宽度
NFR5: 导出图片色彩、文字、布局不应与画布显示存在偏差
NFR6: 后端通过 OpenAI 协议兼容接口与 LLM（GLM-5）集成
NFR7: LLM 接口配置可切换，支持后续更换模型而无需修改业务代码
NFR8: SSE 作为前后端流式通信协议
NFR9: Fabric.js 画布上中文文字显示正常，无乱码
NFR10: 中文文本换行、字间距渲染正确
NFR11: 需确保中文字体正确加载到 Canvas 环境

### Additional Requirements

- 架构指定 Starter 模板：前端 Vite + React + TypeScript（`npm create vite@latest`），后端 Spring Initializr（Spring Boot 3.5.12，web + webflux）
- 前端状态管理使用 Zustand v5，画布操作采用命令模式（Command Pattern）实现撤销/重做，命令栈最大深度 50
- JSX 运行时编译使用 @babel/standalone v7.29.x，需延迟加载（~700KB gzip），用户提交生成请求后才加载
- UI 组件库使用 shadcn/ui（基于 Radix UI + Tailwind CSS）
- MVP 路由采用条件渲染（仅两个页面：输入页 + 编辑器页），不引入 React Router
- Tailwind CSS 选用 v3.4.x（非 v4），需定义 LLM 可使用的类名白名单，同时约束 DOM→Fabric.js 转换器
- 数据库选型 MongoDB，但 MVP 第一版暂不接入，纯前端内存状态
- SSE 消息协议定义四种类型：thinking / code_chunk / complete / error
- 错误处理分层策略：管线前段（LLM 超时/异常）友好提示 + 重试按钮；管线后段（JSX 编译/DOM 渲染/Fabric.js 转换失败）提示重新生成 + 保留原始输出
- 中文字体文件打包到项目（AlibabaPuHuiTi + NotoSansSC），不依赖 CDN
- 大文件延迟加载：@babel/standalone 用户提交后加载，中文字体进入编辑器页后异步加载
- 部署平台 K8s，MVP 不搞 CI/CD
- MVP 不实现认证授权和 LLM 代码沙箱
- engine/ 模块对外仅暴露 `convertDomToCanvas()` 单一入口
- 前端按功能（features）组织代码，禁止跨 feature import 组件
- TypeScript strict mode，禁止 any 类型
- API 响应统一包装格式：`{ code, data, message }`
- 核心管线（engine/、SSE 消息解析、命令模式 undo/redo）必须有测试覆盖

### UX Design Requirements

无 UX 设计文档——本项目 UI 交互模式已在 PRD 中充分描述（输入页 + 编辑器页左右分栏布局），无独立 UX 设计需求。

### FR Coverage Map

FR1: Epic 1 - 自然语言输入海报需求
FR2: Epic 1 - 发送至 LLM 进行生成
FR3: Epic 1 - SSE 流式展示生成过程
FR4: Epic 1 - JSX + Tailwind CSS 编译渲染为 DOM
FR5: Epic 1 - 解析 DOM 树识别元素节点
FR6: Epic 1 - DOM 元素转换为 Fabric.js 对象
FR7: Epic 1 - 保持布局和层级关系
FR8: Epic 2 - 画布上选中元素
FR9: Epic 2 - 拖拽调整位置
FR10: Epic 2 - 缩放调整大小
FR11: Epic 2 - 双击编辑文字内容
FR12: Epic 2 - 修改文字样式（颜色、字号）
FR13: Epic 2 - 撤销和重做
FR14: Epic 1 - 海报尺寸选择
FR15: Epic 2 - 删除选中元素
FR16: Epic 2 - 添加新文字元素
FR17: Epic 3 - 单元素 Roll 重新生成
FR18: Epic 3 - 对话式 AI 优化设计
FR19: Epic 3 - 画布状态序列化
FR20: Epic 2 - 一键导出 PNG
FR21: Epic 1 - 可配置 LLM 接口

## Epic List

### Epic 1: 海报生成——从自然语言到画布呈现

用户输入一段自然语言描述，实时看到 AI 流式生成过程，最终在画布上看到一张完整海报。这是核心技术链路的端到端验证里程碑。
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR7, FR14, FR21

### Epic 2: 画布编辑与导出——像 PPT 一样精细控制

用户可以直接在画布上选中、拖拽、缩放、编辑文字、调整样式、删除/添加元素，支持撤销重做，最终一键导出高质量 PNG。编辑 + 导出 = 完整手动工作流闭环。
**FRs covered:** FR8, FR9, FR10, FR11, FR12, FR13, FR15, FR16, FR20

### Epic 3: AI 智能优化——Roll 与对话式调整

用户可以对单个元素触发 AI 重新生成（Roll）获得替代方案，也可以通过对话描述修改意图让 AI 整体优化设计。补齐 PRD 旅程 2 的恢复路径。
**FRs covered:** FR17, FR18, FR19

---

## Epic 1: 海报生成——从自然语言到画布呈现

用户输入一段自然语言描述，实时看到 AI 流式生成过程，最终在画布上看到一张完整海报。这是核心技术链路的端到端验证里程碑。

### Story 1.1: 项目脚手架与基础架构搭建

As a 开发者,
I want 使用架构文档指定的技术栈初始化前后端项目并配置好基础开发环境,
So that 后续所有功能开发都有一致的项目结构和工具链基础。

**Acceptance Criteria:**

**Given** 一台全新的开发环境
**When** 按照本故事完成所有初始化步骤
**Then** 前端项目（Vite + React + TypeScript）可以通过 `npm run dev` 启动并显示默认页面
**And** Tailwind CSS v3.4.x 已配置，自定义类名白名单已定义
**And** shadcn/ui 已初始化，至少一个组件（Button）可正常使用
**And** Zustand v5 已安装，基础 store 结构（`useEditorStore`）已创建
**And** 前端项目结构按架构文档组织（`features/input/`、`features/editor/`、`features/generation/`、`engine/`、`shared/`）
**And** 后端项目（Spring Boot 3.5.12，web + webflux）可以通过 Maven 启动并响应健康检查请求
**And** 后端项目结构按架构文档组织（`controller/`、`service/`、`llm/`、`config/`、`model/`）
**And** 前端 Vite 开发代理已配置，`/api` 请求代理到 Spring Boot 后端
**And** TypeScript strict mode 已启用，ESLint 已配置
**And** App.tsx 实现条件渲染路由（输入页 / 编辑器页），默认显示输入页
**And** API 响应统一包装类 `ApiResponse<T>` 已创建（`{ code, data, message }` 格式）

### Story 1.2: 输入页——用户描述海报需求

As a 海报设计用户,
I want 在输入页通过自然语言描述我想要的海报内容，并选择海报尺寸,
So that 系统能理解我的设计意图并据此生成海报。

**Acceptance Criteria:**

**Given** 用户访问应用首页（输入页）
**When** 页面加载完成
**Then** 显示一个多行文本输入区域，placeholder 提示用户输入海报描述（如"五一劳动节促销海报，主标题..."）
**And** 显示海报尺寸选择下拉组件，包含至少 3 种预设尺寸（如 1080×1920 竖版海报、1080×1080 方形、1920×1080 横版）
**And** 显示预设案例入口，点击可将预设描述填充到输入框中

**Given** 用户已输入海报描述并选择尺寸
**When** 用户点击"生成"按钮
**Then** 页面切换到编辑器页，传递用户输入的描述文本和选择的尺寸参数

**Given** 用户未输入任何描述
**When** 用户点击"生成"按钮
**Then** 显示提示信息，要求用户输入海报描述，不触发页面切换

### Story 1.3: LLM 编排与 SSE 流式生成

As a 海报设计用户,
I want 提交描述后看到 AI 实时生成海报代码的过程,
So that 我知道系统正在工作，并能观察生成进度。

**Acceptance Criteria:**

**Given** 后端已配置 LLM 接口（OpenAI 协议兼容，默认 GLM-5）
**When** 修改 `application.yml` 中的 LLM 配置（API URL、API Key、模型名称）
**Then** 无需修改业务代码即可切换 LLM 模型

**Given** 用户从输入页提交海报描述和尺寸
**When** 前端发起 POST `/api/posters/generate` 请求
**Then** 后端 `PosterController` 接收请求，构造包含用户描述和尺寸信息的 System Prompt
**And** 后端通过 `LlmClient` 调用 LLM，返回 `Flux<ServerSentEvent>` 流式响应
**And** SSE 消息遵循协议格式：`{ type: "thinking" | "code_chunk" | "complete" | "error", content: "..." }`

**Given** SSE 连接已建立，LLM 正在生成
**When** 前端 `sseClient` 接收到 `thinking` 类型消息
**Then** 编辑器页左栏（StreamPanel）显示"正在分析设计需求..."等思考状态文字

**Given** SSE 连接已建立，LLM 正在生成
**When** 前端 `sseClient` 接收到 `code_chunk` 类型消息
**Then** 编辑器页左栏实时追加显示 JSX 代码片段，呈现代码生成进度

**Given** SSE 连接已建立
**When** 前端 `sseClient` 接收到 `complete` 类型消息
**Then** 前端获得完整的 JSX + Tailwind CSS 代码，准备触发后续编译渲染流程

**Given** SSE 连接已建立
**When** 前端 `sseClient` 接收到 `error` 类型消息或 LLM 调用超时
**Then** 编辑器页显示友好错误提示（不暴露技术细节）并提供"重新生成"按钮

**Given** SSE 消息解析模块已实现
**When** 运行 `sseClient.test.ts` 单元测试
**Then** 四种消息类型（thinking / code_chunk / complete / error）均能正确解析，测试全部通过

### Story 1.4: JSX 运行时编译与 DOM 渲染

As a 海报设计用户,
I want AI 生成的代码能自动编译并渲染出可视化的海报预览,
So that 我无需理解代码就能看到 AI 的设计成果。

**Acceptance Criteria:**

**Given** 前端收到 `complete` 类型的 SSE 消息，包含完整 JSX + Tailwind CSS 代码
**When** 触发 JSX 编译流程
**Then** `jsxCompiler` 通过动态导入加载 `@babel/standalone`（延迟加载，不阻塞首屏）
**And** Babel 将 JSX 代码转换为可执行的 JavaScript

**Given** JSX 代码已编译为 JavaScript
**When** 执行渲染流程
**Then** 系统创建隐藏的 DOM 容器，注入 Tailwind CSS 样式环境
**And** 编译后的 JavaScript 渲染为真实 DOM 结构
**And** DOM 元素正确应用 Tailwind CSS 样式（纯色背景、文本样式、边框、布局）

**Given** LLM 生成的 JSX 代码存在语法错误
**When** Babel 编译失败
**Then** 系统显示"生成结果有问题，要重新生成吗？"的友好提示
**And** 保留 LLM 原始输出（在左栏 StreamPanel 中可见）供调试参考
**And** 提供"重新生成"按钮

**Given** 用户首次进入编辑器页
**When** 尚未触发过生成请求
**Then** `@babel/standalone` 未被加载（验证延迟加载策略生效）

### Story 1.5: DOM → Fabric.js 画布转换与中文字体

As a 海报设计用户,
I want 预览的海报自动转换到可交互的画布上，中文文字显示正常,
So that 我能在画布上看到完整的海报效果，为后续编辑做好准备。

**Acceptance Criteria:**

**Given** JSX 已成功编译并渲染为 DOM 结构
**When** 调用 `engine/convertDomToCanvas()` 函数
**Then** 系统解析 DOM 树，通过 `getBoundingClientRect()` 获取每个元素的精确坐标和尺寸
**And** 文本节点转换为 `fabric.Textbox` 对象，保持字体、颜色、字号
**And** 纯色背景/形状转换为 `fabric.Rect` 对象，保持颜色和尺寸
**And** 图片元素转换为 `fabric.Image` 对象
**And** DOM 的层级关系在 Fabric.js 画布中正确保持（z-index 顺序一致）
**And** 函数返回结构化结果 `ConversionResult { canvas, elements, warnings }`
**And** 不支持的样式记录在 `warnings` 数组中（不中断转换流程）

**Given** 编辑器页加载
**When** 进入编辑器页面
**Then** 中文字体文件（AlibabaPuHuiTi、NotoSansSC）异步加载
**And** 加载完成前显示 loading 状态

**Given** 中文字体已加载完成，DOM → Fabric.js 转换完成
**When** 画布渲染展示
**Then** Fabric.js 画布上中文文字显示正常，无乱码
**And** 中文文本换行和字间距渲染正确
**And** 画布尺寸与用户选择的海报尺寸一致

**Given** DOM 渲染异常或 Fabric.js 转换失败
**When** `convertDomToCanvas()` 抛出异常
**Then** 系统显示"生成结果有问题，要重新生成吗？"的友好提示并提供重新生成按钮

**Given** engine/ 模块已实现
**When** 运行 `convertDomToCanvas.test.ts` 和 `textHandler.test.ts` 单元测试
**Then** 文本、形状、图片的转换逻辑正确，布局坐标解析正确，测试全部通过

---

## Epic 2: 画布编辑与导出——像 PPT 一样精细控制

用户可以直接在画布上选中、拖拽、缩放、编辑文字、调整样式、删除/添加元素，支持撤销重做，最终一键导出高质量 PNG。

### Story 2.1: 画布基础交互——选中、拖拽与缩放

As a 海报设计用户,
I want 在画布上自由选中、拖拽和缩放任意元素,
So that 我能像使用 PPT 一样直观地调整海报布局。

**Acceptance Criteria:**

**Given** Fabric.js 画布上已渲染海报元素
**When** 用户点击画布上的某个元素
**Then** 该元素被选中，显示选中框（selection handles）
**And** 其他已选中元素取消选中

**Given** 用户已选中一个元素
**When** 用户按住鼠标拖拽该元素
**Then** 元素跟随鼠标移动，实时更新位置
**And** 拖拽过程流畅，无明显卡顿

**Given** 用户已选中一个元素
**When** 用户通过选中框角点拖拽缩放
**Then** 元素按比例缩放大小
**And** 缩放过程流畅，无明显卡顿

**Given** 用户点击画布空白区域
**When** 当前有元素被选中
**Then** 取消所有元素选中状态

### Story 2.2: 文字编辑——内容修改与样式调整

As a 海报设计用户,
I want 双击文字直接修改内容，并能调整颜色和字号,
So that 我能精确控制海报上的文字信息和视觉效果。

**Acceptance Criteria:**

**Given** 画布上有一个文字元素（fabric.Textbox）
**When** 用户双击该文字元素
**Then** 进入文字编辑模式，光标出现在点击位置
**And** 用户可以直接输入、删除、修改文字内容
**And** 中文输入法正常工作

**Given** 用户正在编辑文字
**When** 用户点击画布其他区域或按 Escape 键
**Then** 退出文字编辑模式，保留修改后的内容

**Given** 用户选中一个文字元素（非编辑模式）
**When** 用户通过工具栏修改颜色
**Then** 文字颜色立即更新为选择的颜色

**Given** 用户选中一个文字元素（非编辑模式）
**When** 用户通过工具栏修改字号
**Then** 文字字号立即更新，元素大小相应调整

### Story 2.3: 元素管理——删除与添加文字

As a 海报设计用户,
I want 删除不需要的元素并添加新的文字,
So that 我能自由组合海报内容，不受 AI 生成结果的限制。

**Acceptance Criteria:**

**Given** 用户已选中画布上的一个元素
**When** 用户按 Delete 键或点击工具栏删除按钮
**Then** 选中的元素从画布上移除
**And** 画布上其他元素不受影响

**Given** 用户在编辑器页面
**When** 用户点击工具栏的"添加文字"按钮
**Then** 画布中央添加一个新的默认文字元素（如"双击编辑文字"）
**And** 新元素使用当前画布的中文字体
**And** 新元素自动被选中，用户可立即拖拽或双击编辑

### Story 2.4: 撤销与重做——命令模式实现

As a 海报设计用户,
I want 随时撤销和重做我的编辑操作,
So that 我可以大胆尝试修改而不担心犯错无法恢复。

**Acceptance Criteria:**

**Given** 用户在画布上执行了编辑操作（拖拽、缩放、文字编辑、样式修改、删除、添加）
**When** 每次操作执行时
**Then** 系统生成对应的 Command 对象（包含 `execute()` 和 `undo()` 方法）
**And** Command 压入 Zustand 管理的撤销栈
**And** 重做栈被清空

**Given** 撤销栈中有操作记录
**When** 用户按 Ctrl+Z 或点击撤销按钮
**Then** 最近一次操作被撤销，画布恢复到操作前的状态
**And** 被撤销的 Command 移入重做栈
**And** 撤销操作即时响应，无感知延迟

**Given** 重做栈中有操作记录
**When** 用户按 Ctrl+Shift+Z 或点击重做按钮
**Then** 最近一次被撤销的操作重新执行
**And** 重做的 Command 移回撤销栈

**Given** 撤销栈已满（达到最大深度 50）
**When** 用户执行新的编辑操作
**Then** 最早的 Command 被丢弃，新 Command 入栈，栈深度保持 50

**Given** 撤销栈为空
**When** 用户尝试撤销
**Then** 撤销按钮呈禁用状态，无任何操作

**Given** 命令模式已实现
**When** 运行 `useCanvasCommands.test.ts` 单元测试
**Then** 撤销/重做的正向操作、边界条件（空栈、满栈）测试全部通过

### Story 2.5: 一键导出 PNG

As a 海报设计用户,
I want 将编辑好的海报一键导出为高质量 PNG 图片,
So that 我能直接使用这张图片发布到社交媒体或发送给他人。

**Acceptance Criteria:**

**Given** 画布上有已编辑的海报内容
**When** 用户点击工具栏的"导出"按钮
**Then** 系统将 Fabric.js 画布导出为 PNG 图片
**And** 导出分辨率不低于 1080px 宽度
**And** 触发浏览器下载，文件名包含时间戳（如 `seede-poster-20260402.png`）

**Given** 画布上有已编辑的海报内容
**When** 导出 PNG 图片完成
**Then** 导出的图片与画布所见完全一致（所见即所得）
**And** 色彩、文字内容、字体、布局均无偏差
**And** 中文文字在导出图片中显示正常，无乱码

**Given** 画布为空或仅有背景
**When** 用户点击导出按钮
**Then** 仍然正常导出当前画布内容

---

## Epic 3: AI 智能优化——Roll 与对话式调整

用户可以对单个元素触发 AI 重新生成（Roll）获得替代方案，也可以通过对话描述修改意图让 AI 整体优化设计。补齐 PRD 旅程 2 的恢复路径。

### Story 3.1: 画布状态序列化

As a 系统,
I want 将当前画布的完整状态序列化为 LLM 可理解的结构化描述,
So that AI 能基于用户手动编辑后的实时状态进行智能优化。

**Acceptance Criteria:**

**Given** Fabric.js 画布上有若干元素（包含用户手动编辑后的状态）
**When** 调用 `canvasSerializer` 序列化当前画布
**Then** 输出包含每个元素的结构化描述：元素类型（text/shape/image）、位置（x, y）、尺寸（width, height）、内容（文字内容或图片 URL）、样式（颜色、字号、背景色等）
**And** 输出格式为 LLM 可直接作为上下文输入的文本格式
**And** 序列化结果反映用户手动编辑后的实时状态（非初始生成状态）

**Given** 画布上有嵌套的分组元素
**When** 序列化执行
**Then** 层级关系在输出中正确表达

**Given** canvasSerializer 模块已实现
**When** 运行 `canvasSerializer.test.ts` 单元测试
**Then** 各种元素类型和组合场景的序列化结果正确，测试全部通过

### Story 3.2: 单元素 Roll 重新生成

As a 海报设计用户,
I want 选中某个元素后让 AI 重新生成该元素的替代方案,
So that 我可以对不满意的单个元素进行局部优化，而不影响海报整体布局。

**Acceptance Criteria:**

**Given** 用户在画布上选中了一个元素
**When** 用户点击 RollButton（或右键菜单中的"重新生成"）
**Then** 系统序列化选中元素的描述及其在画布中的上下文
**And** 向后端 POST `/api/posters/roll` 发起请求
**And** 按钮显示 loading 状态

**Given** 后端收到 Roll 请求
**When** `RollController` 处理请求
**Then** 构造包含元素描述和上下文的 Prompt，调用 LLM
**And** 通过 SSE 流式返回生成结果（遵循 SSE 消息协议）

**Given** LLM 返回了替代方案的 JSX 代码
**When** 前端收到 `complete` 消息
**Then** 编译新的 JSX 代码为 DOM，转换为 Fabric.js 对象
**And** 替换画布上原选中元素（保持相同位置和大致尺寸）
**And** 该替换操作记录为一个 Command，支持撤销

**Given** Roll 生成过程中 LLM 返回错误或超时
**When** 前端收到 `error` 消息
**Then** 显示友好提示，原元素保持不变
**And** 提供重试按钮

### Story 3.3: 对话式 AI 优化设计

As a 海报设计用户,
I want 通过对话告诉 AI 我的修改意图，让 AI 基于当前画布状态重新调整整体设计,
So that 我可以用自然语言指挥 AI 优化海报，不需要手动逐个修改元素。

**Acceptance Criteria:**

**Given** 编辑器页面底部有对话输入框（ChatDialog）
**When** 用户在对话框中输入修改意图（如"文字间距大一点，背景换成浅粉色"）并提交
**Then** 系统调用 `canvasSerializer` 序列化当前画布完整状态
**And** 将画布状态 + 用户修改意图 + 对话历史发送到 POST `/api/posters/chat`
**And** 对话框显示用户消息，并展示 AI 正在生成的 loading 状态

**Given** 后端收到对话优化请求
**When** `ChatController` 处理请求
**Then** 构造包含完整画布状态描述、用户修改意图和对话历史的 Prompt
**And** 通过 SSE 流式返回调整后的完整设计 JSX 代码

**Given** LLM 返回了调整后的完整 JSX 代码
**When** 前端收到 `complete` 消息
**Then** 编译新的 JSX → DOM → Fabric.js 转换（复用 Story 1.3-1.5 的完整管线）
**And** 新的画布内容替换当前画布
**And** 该整体替换操作记录为一个 Command，支持撤销回到替换前的状态

**Given** 用户进行了多轮对话优化
**When** 每次提交新的修改意图
**Then** 对话历史在左栏或对话框中累积显示
**And** 每次请求都携带完整对话历史，让 LLM 理解上下文

**Given** 对话优化过程中 LLM 返回错误
**When** 前端收到 `error` 消息
**Then** 显示友好提示，当前画布保持不变
**And** 用户可以继续输入新的修改意图重试
