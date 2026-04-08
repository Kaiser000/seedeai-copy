# Seede AI — AI 海报生成平台

LLM 驱动的海报生成与编辑平台。用户输入设计描述，AI 多阶段流水线生成 React+Tailwind JSX 代码，浏览器端实时编译渲染到 fabric.js 画布，支持交互式编辑与 PNG 导出。

```
用户输入 → 需求分析 LLM → 代码生成 LLM → AI 图片生成（可选）→ 浏览器编译 → fabric.js 画布 → PNG 导出
```

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 + Vite + TypeScript + Tailwind CSS 3.4 + Zustand + fabric.js |
| 后端 | Spring Boot 3.5 + WebFlux（响应式）+ Java 21 |
| LLM | 智谱 GLM-4.7（默认，可配置） |
| 图片生成 | 火山引擎 Seedream（可选） |
| 通信 | SSE（Server-Sent Events）流式推送 |

## 快速开始

### 环境要求

- Node.js 18+
- Java 21+
- Maven 3.8+

### 后端

```bash
cd backend

# 设置环境变量（必填）
export LLM_API_KEY=your_zhipu_api_key

# 可选：启用 AI 图片生成
export IMAGE_GENERATE_API_KEY=your_volcengine_api_key

# 启动服务（端口 8080）
mvn spring-boot:run
```

### 前端

```bash
cd frontend
npm install
npm run dev    # Vite 开发服务器，端口 5173，/api 自动代理到 :8080
```

浏览器访问 `http://localhost:5173`。

## 项目结构

```
seede-ai/
├── frontend/                        # React 前端
│   └── src/
│       ├── engine/                  # DOM→Canvas 转换引擎
│       │   ├── handlers/            #   text / image / shape / group handler
│       │   ├── parsers/             #   Tailwind 类名 & CSS 解析
│       │   └── utils/               #   字体加载等工具
│       ├── features/
│       │   ├── input/               # 输入页：提示词、尺寸选择、预设案例
│       │   ├── editor/              # 编辑器页：画布、工具栏、图层、属性面板、对话
│       │   │   ├── stores/          #   Zustand store（生成状态、工作流阶段）
│       │   │   └── hooks/           #   fabric.js 画布、撤销/重做、PNG 导出
│       │   └── generation/          # 生成流程：SSE 客户端、JSX 编译、序列化
│       └── shared/                  # 共享 UI 组件（shadcn/ui）、类型、工具
├── backend/                         # Spring Boot 后端
│   └── src/main/java/com/seede/
│       ├── controller/              # REST 端点（generate / chat / roll / health）
│       ├── service/                 # 生成、对话、元素重生成、图片生成
│       ├── llm/                     # LLM 客户端、响应解析、提示词模板管理
│       ├── model/                   # SSE 消息 DTO、请求/响应模型
│       └── config/                  # LLM、图片生成、CORS 配置
│   └── src/main/resources/
│       └── prompts/                 # 提示词模板（Markdown + {{变量}} 语法）
└── docs/                            # 产品分析、技术方案等文档
```

## 核心功能

### 1. 多阶段海报生成

生成流程分为 4 个阶段，每个阶段实时推送 SSE 事件：

| 阶段 | 说明 | SSE 事件 |
| --- | --- | --- |
| 需求分析 | LLM 分析设计意图，输出配色、排版、内容区块方案 | `thinking → analysis_chunk* → analysis_complete → layout_complete` |
| 代码生成 | LLM 基于分析结果生成完整 React/Tailwind JSX | `code_chunk* → code_complete` |
| 图片生成 | 检测占位图 URL，调用 Seedream API 生成真实图片 | `image_analyzing → image_generating* → image_complete*` |
| 设计合成 | 组装最终代码，推送完成事件 | `complete` |

### 2. 交互式画布编辑

- **fabric.js 画布**：JSX 在浏览器端编译执行，DOM 递归转换为 fabric.js 对象
- **图层面板**：查看和选择画布元素层级
- **属性面板**：编辑选中元素的文字、颜色、位置等属性
- **撤销/重做**：命令栈支持操作回退

### 3. AI 对话修改

选择画布元素或直接输入修改意图，AI 基于当前画布状态生成修改后的完整代码，保留未修改的部分。

### 4. 元素重生成（Roll）

对不满意的单个元素，发送元素描述 + 画布上下文给 LLM，生成替换片段。

### 5. PNG 导出

fabric.js 画布直接导出为 PNG 图片下载。

## API 端点

| 端点 | 方法 | 响应类型 | 说明 |
| --- | --- | --- | --- |
| `/api/posters/generate` | POST | SSE | 多阶段海报生成 |
| `/api/posters/chat` | POST | SSE | 对话式海报修改 |
| `/api/posters/roll` | POST | SSE | 单元素重新生成 |
| `/health` | GET | JSON | 健康检查 |

## 环境变量

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `LLM_API_KEY` | 是 | — | 智谱 AI API 密钥 |
| `LLM_API_URL` | 否 | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | LLM API 地址 |
| `LLM_MODEL` | 否 | `glm-4.7` | LLM 模型名称 |
| `IMAGE_GENERATE_ENABLED` | 否 | `true` | 是否启用 AI 图片生成 |
| `IMAGE_GENERATE_API_KEY` | 否 | — | 火山引擎 API 密钥 |
| `IMAGE_GENERATE_API_URL` | 否 | `https://ark.cn-beijing.volces.com/api/v3/images/generations` | 图片生成 API 地址 |
| `IMAGE_GENERATE_MODEL` | 否 | `doubao-seedream-4-0-250828` | 图片生成模型 |
| `CORS_ALLOWED_ORIGINS` | 否 | `http://localhost:5173` | CORS 允许的前端源 |

## 开发命令

```bash
# 前端（在 frontend/ 下）
npm run dev          # 开发服务器
npm run build        # 生产构建（含类型检查）
npm run lint         # ESLint
npm test             # Vitest 单次运行

# 后端（在 backend/ 下）
mvn spring-boot:run  # 启动开发服务
mvn clean package    # 打包 JAR
```
