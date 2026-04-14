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

### 5. 模板推荐模块

**数据来源**：325 个真实生产模板（all_items.json），经质量评分筛选后保留 290 个合格模板。

**架构设计**：

```
all_items.json (325 模板, ~4MB)
       │
       ▼  启动时加载
┌─────────────────────────────┐
│     TemplateService          │
│  ┌────────────────────────┐ │
│  │ metadataList (290条)   │ │ ← template-metadata.json（轻量索引）
│  │ fullDataIndex (id→Node)│ │ ← all_items.json（完整数据按 id 索引）
│  │ categories (15类)      │ │
│  └────────────────────────┘ │
│  • listByCategory(cat, n)   │ → 分类筛选
│  • search(keyword, n)       │ → 关键词搜索（名称/描述/分类）
│  • recommend(n)             │ → 随机推荐（从 top 50% 中选）
│  • getDetail(id)            │ → 完整详情（含 sourceCode）
└─────────────────────────────┘
       │
       ▼
┌─────────────────────────────┐
│     TemplateController       │
│  GET /api/templates          │ → 列表（?category= &keyword= &limit=）
│  GET /api/templates/categories│ → 分类列表
│  GET /api/templates/recommend │ → 随机推荐
│  GET /api/templates/{id}     │ → 完整详情
└─────────────────────────────┘
```

**模板元数据字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 模板唯一标识 |
| name | string | 模板名称 |
| description | string | 模板描述 |
| category | string | 分类（15 类） |
| emotion | string | 情绪类型（8 种） |
| width / height | int | 画布尺寸 |
| colors | string[] | 主要色彩 HEX 值 |
| quality | int | 质量评分（0-9） |

**质量评分算法**：标准 React 格式(+2) + 色彩 Token 对象(+2) + 排版 Token 对象(+2) + 合理代码长度(+1) + 有意义名称(+1) + 有描述(+1)

**前端集成**：`PresetCases` 组件从硬编码 3 个预设 → 动态加载推荐模板 + 分类标签栏 + 换一批，后端不可用时回退到本地预设。

### 6. Design Token 与设计参考库模块

**问题**：LLM 每次生成时颜色、字体即兴决定，风格一致性全靠"自律"。

**方案**：通过 Prompt 工程强制 LLM 在代码开头定义结构化 Token 对象。

**Design Token 模式（注入到 poster-generate.md）：**

```jsx
function Poster() {
  const colors = {
    primary: '#006B3F',     // 主色
    accent: '#D4AF37',      // 强调色
    bg: '#FDFCF8',          // 背景色
    text: '#1A1A1A',        // 主文字色
    textMuted: '#6B7280',   // 弱化文字色
    border: 'rgba(0,0,0,0.08)',
  };
  const typography = {
    h1: { fontFamily: 'OPPO Sans 4.0', fontWeight: 900, lineHeight: 1.1 },
    h2: { fontFamily: 'OPPO Sans 4.0', fontWeight: 700, lineHeight: 1.2 },
    body: { fontFamily: 'Noto Sans', fontWeight: 400, lineHeight: 1.7 },
    numeric: { fontFamily: 'Inter', fontWeight: 800 },
  };
  // ... 后续通过 style={{ ...typography.h1, color: colors.primary }} 引用
}
```

**设计参考库（design-reference.md）**：
- 从 325 个模板中提炼的 5 种高频布局模式
- 6 种场景配色方案（电商/科技/健康/高端/文化/清新）
- 8 种字体组合推荐（按实际使用频率排序）
- 8 种情绪→设计参数映射表

**Gene 参数流水线打通**：

```
poster-analyze.md → gene JSON（含 HEX 色彩 + 字体推荐）
       │
       ▼ PosterGenerateService.buildEnrichedPrompt()
提取 gene.style（primaryColor/accentColor/bgColor/textColor...）
提取 gene.fonts（title/body/numeric）
注入区块高度 + 密度 + 焦点
       │
       ▼
poster-generate.md + design-reference.md → LLM 生成 JSX
```

### 7. Prompt 工程数据驱动优化

**方法论**：对 325 个真实模板进行全量代码分析，对比 prompt 规则与实际代码模式，反向优化规则。

**关键发现与调整**（详见 docs/design-data-analysis.md）：

| 规则 | 调整方向 | 数据依据 |
|------|---------|---------|
| 样式写法 | inline style 优先 | 82.1% 使用 inline style |
| 色彩管理 | Token 对象必须 | 63.6% 定义 colors 对象 |
| 图片 URL | placehold.co + prompt 属性 | 85% 用 placehold.co，80% 有 prompt 属性 |
| 字体推荐 | 8 种字体按频率推荐 | Noto Sans 606 次、Inter 237 次等 |
| CSS 效果 | 放宽 backdrop-blur 等 | 52.8% 使用 backdrop-blur |
| 列表渲染 | 推荐 .map() 模式 | 58.3% 使用 .map() |

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
