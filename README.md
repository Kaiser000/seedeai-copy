# Seede AI 逆向分析与复现方案

> 基于对 seede.ai 产品的调研与实例分析，整理的技术复现方案。

## 目录

- [产品分析](./docs/product-analysis.md) — Seede AI 功能、定位、竞品对比
- [工作流程分析](./docs/workflow-analysis.md) — 4阶段流水线逆向分析
- [技术方案](./docs/tech-plan.md) — 完整复现技术栈与架构设计
- [实现指南](./docs/implementation-guide.md) — 分阶段开发路线图与代码示例

## 核心结论

Seede AI 的本质是：

```
用户输入 → LLM 生成 React+Tailwind JSX → Puppeteer 无头渲染截图 → 图像后处理 → PNG 输出
```

**最关键的发现**：它不维护设计模板库，LLM 直接充当模板引擎，每次生成完整的 JSX 代码。

## 快速开始

```bash
# 克隆后安装依赖
npm install

# 启动开发服务
npm run dev
```

## 项目结构（规划）

```
seede-ai/
├── docs/               # 分析文档
├── src/
│   ├── api/            # Next.js API Routes
│   ├── app/            # Next.js App Router 页面
│   ├── components/     # UI 组件（Canvas 编辑器等）
│   ├── lib/
│   │   ├── llm/        # LLM 调用（生成 JSX）
│   │   ├── renderer/   # Puppeteer 渲染引擎
│   │   └── processor/  # 图像后处理（sharp）
│   └── prompts/        # System Prompt 模板
├── package.json
└── README.md
```
