# 分阶段实现指南

## MVP 路线图

```
Week 1-2: 核心引擎（LLM → JSX → 截图）
Week 3-4: Web UI（输入 + 预览 + 导出）
Week 5-6: 用户系统 + 历史记录
Week 7+:  品牌配置 + 辅助工具（背景移除等）
```

---

## 第一阶段：核心引擎

### 1.1 System Prompt

见 `src/prompts/design-system.md`，核心要素：
- 画布规格约束
- 字体/图标资源白名单
- 配色决策规则
- 代码格式要求

### 1.2 LLM 调用

```typescript
// src/lib/llm/generate.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function generateDesignJSX(
  prompt: string,
  onChunk: (text: string) => void
): Promise<string> {
  const systemPrompt = await loadSystemPrompt();
  let fullContent = '';

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: systemPrompt,
    messages: [{ role: 'user', content: prompt }],
  });

  for await (const chunk of stream) {
    if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
      fullContent += chunk.delta.text;
      onChunk(chunk.delta.text);
    }
  }

  // 从返回内容中提取 JSX 代码块
  const jsxMatch = fullContent.match(/```jsx\n([\s\S]+?)\n```/);
  return jsxMatch ? jsxMatch[1] : fullContent;
}
```

### 1.3 Puppeteer 渲染引擎

```typescript
// src/lib/renderer/screenshot.ts
import puppeteer from 'puppeteer';
import * as esbuild from 'esbuild';

const HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;700;900&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <style>* { box-sizing: border-box; } body { margin: 0; padding: 0; }</style>
</head>
<body>
  <div id="root"></div>
  <script>COMPILED_JS_PLACEHOLDER</script>
</body>
</html>`;

export async function renderJSXToImage(jsx: string): Promise<Buffer> {
  // 1. 编译 JSX
  const compiled = await esbuild.transform(jsx, {
    loader: 'jsx',
    target: 'es2020',
    globalName: 'AppModule',
  });

  // 2. 拼装挂载代码
  const mountCode = `
    ${compiled.code}
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(AppModule.default || AppModule.App));
  `;

  const html = HTML_TEMPLATE.replace('COMPILED_JS_PLACEHOLDER', mountCode);

  // 3. Puppeteer 截图
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 800, deviceScaleFactor: 2 }); // 2x 清晰度
  await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });

  // 等待字体渲染完成
  await page.evaluateHandle('document.fonts.ready');

  const screenshot = await page.screenshot({
    fullPage: true,
    type: 'png',
  }) as Buffer;

  await browser.close();
  return screenshot;
}
```

### 1.4 图像后处理

```typescript
// src/lib/processor/image.ts
import sharp from 'sharp';

export async function processDesignImage(buffer: Buffer): Promise<{
  full: Buffer;
  preview: Buffer;
}> {
  const full = await sharp(buffer)
    .png({ quality: 90, compressionLevel: 6 })
    .toBuffer();

  // 生成预览图（宽度缩小到 540px）
  const preview = await sharp(buffer)
    .resize(540, null, { fit: 'inside' })
    .jpeg({ quality: 85 })
    .toBuffer();

  return { full, preview };
}
```

---

## 第二阶段：API Route

```typescript
// src/app/api/generate/route.ts
import { NextRequest } from 'next/server';
import { generateDesignJSX } from '@/lib/llm/generate';
import { renderJSXToImage } from '@/lib/renderer/screenshot';
import { processDesignImage } from '@/lib/processor/image';

export async function POST(req: NextRequest) {
  const { prompt } = await req.json();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Stage 1: LLM 生成代码
        send({ stage: 'thinking', message: '正在分析设计需求...' });
        let jsx = '';
        jsx = await generateDesignJSX(prompt, (chunk) => {
          send({ stage: 'coding', chunk });
        });

        // Stage 2: 渲染
        send({ stage: 'rendering', message: '正在渲染设计图...' });
        const screenshot = await renderJSXToImage(jsx);

        // Stage 3: 后处理
        const { full, preview } = await processDesignImage(screenshot);

        // 实际项目中上传到 R2，此处返回 base64
        const imageBase64 = full.toString('base64');
        const previewBase64 = preview.toString('base64');

        send({
          stage: 'done',
          imageUrl: `data:image/png;base64,${imageBase64}`,
          previewUrl: `data:image/jpeg;base64,${previewBase64}`,
          jsx,
        });
      } catch (err) {
        send({ stage: 'error', message: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
```

---

## 第三阶段：前端 UI

核心交互流程：
1. 用户在文本框输入描述
2. 点击生成，前端通过 SSE 接收进度
3. 代码生成阶段：实时在代码预览区显示 JSX
4. 渲染完成：在右侧展示设计图
5. 用户可点击"下载 PNG"导出

---

## 关键依赖

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "@anthropic-ai/sdk": "^0.20.0",
    "puppeteer": "^21.0.0",
    "esbuild": "^0.20.0",
    "sharp": "^0.33.0",
    "tailwindcss": "^3.4.0",
    "@aws-sdk/client-s3": "^3.0.0"
  }
}
```

## 部署注意事项

- Puppeteer 需要在 Linux 环境运行（Fly.io / Railway 推荐）
- Vercel Serverless 函数有执行时间限制（10s），**Puppeteer 不适合直接部署到 Vercel**
- 推荐架构：Next.js 部署到 Vercel，Puppeteer 服务单独部署到 Fly.io，通过内部 API 调用
- 或使用 `@sparticuz/chromium` + Vercel Edge Runtime（有限制，需测试）
