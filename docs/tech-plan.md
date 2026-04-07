# 技术复现方案

## 整体架构

```
┌─────────────────────────────────────────────────────┐
│                    用户浏览器                          │
│  ┌───────────┐    ┌──────────────┐    ┌──────────┐  │
│  │ 输入面板   │───▶│ 实时预览窗口  │◀───│ 编辑工具栏│  │
│  └───────────┘    └──────────────┘    └──────────┘  │
└─────────────────────────┬───────────────────────────┘
                          │ HTTP
┌─────────────────────────▼───────────────────────────┐
│                  Next.js 服务端                        │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────┐ │
│  │ LLM 模块  │  │ 渲染引擎模块  │  │ 图像处理模块    │ │
│  │(代码生成) │  │(Puppeteer)   │  │(sharp/ESRGAN)  │ │
│  └──────────┘  └──────────────┘  └────────────────┘ │
└─────────────────────────────────────────────────────┘
```

## 技术栈选型

### 前端
| 模块 | 技术 | 理由 |
|---|---|---|
| 框架 | Next.js 14 (App Router) | SSR + API Routes 一体化 |
| 样式 | Tailwind CSS | 与生成代码风格一致 |
| UI 组件 | shadcn/ui | 高质量无样式组件 |
| 预览渲染 | iframe 沙箱 | 安全隔离生成的代码 |

### 核心引擎
| 模块 | 技术 | 理由 |
|---|---|---|
| LLM | Claude claude-sonnet-4-6 / GPT-4o | 代码生成质量最佳 |
| JSX 编译 | esbuild (WASM) | 浏览器端编译，速度快 |
| 无头渲染 | Puppeteer | 业界标准，CSS 支持完整 |
| 图像处理 | sharp | Node.js 最快的图像库 |
| 超分（可选） | Replicate (Real-ESRGAN) | 无需自建 GPU |

### 后端 & 基础设施
| 模块 | 技术 |
|---|---|
| 数据库 | Supabase (PostgreSQL) |
| 文件存储 | Cloudflare R2 |
| 认证 | Clerk |
| 部署 | Vercel (前端) + Fly.io (Puppeteer 服务) |
| 队列 | Upstash QStash |

## 模块详细设计

### 1. LLM 代码生成模块

**输入**：用户自然语言描述 + 可选的品牌配置
**输出**：完整的 React + Tailwind JSX 字符串

System Prompt 核心要素：
- 固定画布宽度 1080px
- 指定可用字体列表（中英文）
- 指定可用图标库（FontAwesome）
- 配色规范（如何根据内容选色）
- 禁止使用的 CSS 特性（避免渲染不兼容）
- 输出格式要求（纯 JSX，不含 import 语句）

**流式输出**：使用 SSE 实时推送生成进度到前端。

### 2. Puppeteer 渲染引擎

```
JSX String
  → esbuild.transform() 编译为 JS
  → 注入 HTML 模板（含 Tailwind CDN、字体 CDN）
  → page.setContent(html)
  → page.waitForNetworkIdle()       ← 等待字体/图片加载
  → page.screenshot({ fullPage: true, type: 'png' })
  → Buffer → 上传 R2 → 返回 URL
```

HTML 模板结构：
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.x/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700;900&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
</head>
<body style="margin:0;padding:0;background:#fff">
  <div id="root"></div>
  <script>
    /* esbuild 编译后的组件代码 */
    {{COMPILED_JS}}
  </script>
</body>
</html>
```

### 3. 图像处理模块

```javascript
// sharp 基础处理流程
sharp(screenshotBuffer)
  .png({ quality: 90, compressionLevel: 6 })
  .toBuffer()
```

可选超分（异步队列处理）：
- 调用 Replicate API（Real-ESRGAN 模型）
- 2x 或 4x 放大
- 回调写入存储并通知前端

### 4. 品牌一致性模块

存储结构（Supabase）：
```sql
CREATE TABLE brand_configs (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users,
  primary_color TEXT,
  secondary_color TEXT,
  font_family TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ
);
```

注入方式：将品牌配置序列化后追加到 System Prompt，
要求 LLM 在生成代码时优先使用这些颜色和字体。

## API 设计

```
POST /api/generate
  Body: { prompt: string, brandConfig?: BrandConfig, format?: 'square'|'portrait'|'landscape' }
  Response: SSE stream → { stage: 'thinking'|'coding'|'rendering'|'done', data: any }

POST /api/render
  Body: { jsx: string, width?: number }
  Response: { imageUrl: string, previewUrl: string }

GET /api/history
  Response: { items: DesignItem[] }

DELETE /api/designs/:id
```

## 安全考量

- JSX 代码在 Puppeteer 沙箱中执行，与主进程隔离
- 禁止 LLM 生成包含 `fetch`、`XMLHttpRequest`、`eval` 的代码（System Prompt 约束）
- Puppeteer 禁用网络请求（除白名单 CDN 外）：`page.setRequestInterception(true)`
- 用户上传图片经过内容审核后再注入到生成流程
