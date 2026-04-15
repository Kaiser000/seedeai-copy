# Seede AI 复现指南

> 本文档配合 [tech-plan.md](./tech-plan.md) 使用。tech-plan 描述"是什么"和"为什么"，本文档描述"如何从零搭建"。读完本文档应能在本地跑起完整服务，并理解每个核心模块的代码入口。

---

## 0. 前置依赖

| 软件 | 版本要求 | 说明 |
|---|---|---|
| Node.js | ≥ 20 | 前端构建 |
| Java | **21** | 注意是 21，pom.xml 强制要求 |
| Maven | ≥ 3.9 | 后端构建 |
| Git | — | — |

可选：

- 智谱 AI 账号（必填，用于 LLM）：<https://open.bigmodel.cn/>
- 火山方舟账号（可选，用于真实图片生成）：<https://www.volcengine.com/product/ark>
- 讯飞星辰账号（可选，用于联网搜索）：<https://www.xfyun.cn/>

---

## 1. 克隆与目录结构

```bash
git clone <repo-url> seede-ai
cd seede-ai
```

仓库布局：

```
seede-ai/
├── frontend/                React 19 + Vite + TypeScript
├── backend/                 Spring Boot 3 + WebFlux + Java 21
├── docs/                    技术文档（本文件所在位置）
└── _bmad-output/
    └── project-context.md   AI Agent 详细规则（实现代码前必读）
```

---

## 2. 后端：从 0 到能跑

### 2.1 配置环境变量

最小启动只需要一个变量：

```bash
# Linux/Mac
export LLM_API_KEY=<your-zhipu-api-key>

# Windows PowerShell
$env:LLM_API_KEY="<your-zhipu-api-key>"
```

如果不设这个变量，启动会 fail-fast 报错（这是有意为之，防止误用默认值）。

完整环境变量见 [tech-plan.md 第 11 节](./tech-plan.md#11-配置参考)。

### 2.2 启动后端

```bash
cd backend
mvn clean install
mvn spring-boot:run
```

成功标志：

```
模板服务初始化完成: 元数据 290 条, 完整数据 324 条, 分类 15 个
Started SeedeAiApplication in X.XXX seconds (process running for ...)
```

服务监听 `http://localhost:8080`。

### 2.3 烟雾测试

```bash
curl http://localhost:8080/api/health
# {"status":"UP"}

curl http://localhost:8080/api/templates/categories
# ["报告报表","品牌故事","健康医疗",...]

curl "http://localhost:8080/api/templates?limit=2"
# [{"id":"...","name":"...",...}]
```

测试生成（需要 LLM_API_KEY 已设置）：

```bash
curl -N -X POST http://localhost:8080/api/posters/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"夏日冰咖啡促销海报","width":1080,"height":1920}'
```

应看到流式 SSE 输出（`event: thinking` → `analysis_chunk` → `code_chunk` → ...）。

---

## 3. 前端：从 0 到能跑

```bash
cd frontend
npm install
npm run dev
```

打开 <http://localhost:5173>，应看到输入面板。

`vite.config.ts` 已配置 `/api` 代理到 `http://localhost:8080`，无需 CORS 配置即可联调。

输入提示词点击生成，应看到完整的 SSE 流式渲染过程，最终在画布中显示海报。

---

## 4. 核心模块复现路径

下面按"复现某个模块"的视角，列出每个核心实现的文件入口和复现要点。

### 4.1 复现：LLM 客户端层

**目标**：能向 LLM 发请求，拿到流式响应。

**关键文件**：

```
backend/src/main/java/com/seede/llm/
├── LlmClient.java          ← 主类
├── LlmResponseParser.java  ← SSE 解析
└── SystemPromptManager.java ← prompt 加载与变量替换
```

**最小实现步骤**：

1. 配置 `application.yml` 中的 `llm.*`（见 [tech-plan.md 第 11.1 节](./tech-plan.md#111-必填环境变量)）
2. 注入 `LlmClient`
3. 调用：

   ```java
   String systemPrompt = promptManager.loadPrompt("poster-generate.md",
           Map.of("width", "1080", "height", "1920"));
   Flux<String> stream = llmClient.streamChat(systemPrompt, "生成一张促销海报");
   stream.transform(parser::parseStream)
         .subscribe(msg -> System.out.println(msg));
   ```

**关键约束**：
- `LLM_API_KEY` 不能有默认值
- WebFlux 链路里不能 `block()`
- 新增 prompt 文件必须加入 `SystemPromptManager.ALLOWED_TEMPLATES`

### 4.2 复现：模板系统

**目标**：从 JSON 加载 290 模板，提供检索接口。

**关键文件**：

```
backend/src/main/java/com/seede/service/TemplateService.java
backend/src/main/java/com/seede/controller/TemplateController.java
backend/src/main/java/com/seede/model/dto/TemplateInfo.java
backend/src/main/java/com/seede/model/dto/TemplateDetail.java
backend/src/main/resources/all_items.json
backend/src/main/resources/template-metadata.json
```

**复现步骤**：

1. **准备数据**：把 325 个模板的完整代码导出为 `all_items.json`，每条结构 `{id, name, description, prompt, sourceCode}`。质量评分流程见 [design-data-analysis.md](./design-data-analysis.md)。
2. **建索引**：从 `all_items.json` 提取轻量元数据生成 `template-metadata.json`，每条结构 `{id, name, description, category, emotion, width, height, colors[], quality}`。
3. **TemplateService**：`@PostConstruct init()` 启动时加载两个 JSON 到内存：
   - `metadataList: List<TemplateInfo>` —— 用于列表/搜索
   - `fullDataIndex: Map<String, JsonNode>` —— 用于按 id 取 sourceCode
4. **暴露 8 个 public 方法**：见 [tech-plan.md 第 6.2 节](./tech-plan.md#62-templateservice-完整接口)
5. **TemplateController**：把 4 个 GET 端点映射到 service 方法

### 4.3 复现：RAG 模板检索（核心）

**目标**：根据 LLM 分析阶段输出的 `templateHint`，精确检索 2 条同类高质量模板。

**关键文件**：

```
backend/src/main/java/com/seede/service/TemplateService.java  (recommendByHint 方法)
backend/src/main/resources/prompts/poster-analyze.md          (templateHint 词表)
```

**复现步骤**：

#### Step 1：在 analyze prompt 中要求 LLM 输出 templateHint

在 `poster-analyze.md` 的"结构化 JSON"段落最前面加入：

```json
"templateHint": {
  "category": "品牌故事",
  "emotion": "高端奢华",
  "format": "长图"
}
```

并附上完整固定词表（15 分类 + 6 情绪 + 3 格式），强制 LLM 从词表精确选择。完整词表见当前 `poster-analyze.md` 文件或 [tech-plan.md 第 4.3 节](./tech-plan.md#templatehint-固定词表)。

#### Step 2：实现 `recommendByHint` 方法

签名：

```java
public List<TemplateDetail> recommendByHint(
    String category, String emotion, String format, int count)
```

打分规则：

| 匹配 | 分数 |
|---|---|
| 三字段全匹配 | 300 |
| category + emotion 匹配 | 200 |
| 仅 category 或仅 emotion 匹配 | 100 |
| 仅 format 匹配 | 50 |
| **+ 质量分** | + `quality` |

排序后取 top pool（至少 `count*4`），shuffle 后抽 `count` 条返回完整 detail。

**为什么要 shuffle**：保证用户输入相似时不会总返回同样的样本，让生成结果有多样性。

#### Step 3：把 format 三分类与画布尺寸对齐

```java
private String classifyFormat(int width, int height) {
    double ratio = (double) height / width;
    if (ratio >= 2.5) return "长图";   // 1080x3688
    if (ratio <= 1.3) return "方形";   // 1080x1080
    return "常规";                     // 1080x1920
}
```

阈值在分析 290 模板的实际宽高比分布后选定，几乎覆盖所有真实模板。

### 4.4 复现：生成流水线（最复杂）

**目标**：把"用户输入"变成"完整 JSX 字符串"，6 个阶段 SSE 推送。

**关键文件**：

```
backend/src/main/java/com/seede/service/PosterGenerateService.java
backend/src/main/java/com/seede/controller/PosterController.java
backend/src/main/java/com/seede/model/SseMessage.java
```

**架构**：用 `Flux.concat` 串联 5 个独立的 `Flux`，用 `AtomicReference` 在阶段间传递数据。

```java
return Flux.concat(searchStream, thinkingMsg, analysisStream, codeStream, imageStream)
        .map(msg -> ServerSentEvent.<SseMessage>builder().data(msg).build());
```

**复现步骤**：

#### Step 1：载入两个 prompt（generate 阶段还要追加 design-reference）

```java
String analyzePrompt = promptManager.loadPrompt("poster-analyze.md", sizeVars);
String baseGenerate = promptManager.loadPrompt("poster-generate.md", sizeVars);
String designRef = promptManager.loadPrompt("design-reference.md", Map.of());
String generatePrompt = baseGenerate + "\n\n" + designRef;
```

#### Step 2：阶段 1 联网搜索（可选）

```java
Flux<SseMessage> searchStream;
if (webSearchClient.isEnabled()) {
    String keywords = request.getPrompt().substring(0, Math.min(20, request.getPrompt().length()));
    searchStream = webSearchClient.search(keywords)
            .flatMapMany(results -> {
                searchResultsRef.set(results);
                return Flux.just(SseMessage.searchStart(keywords),
                                 SseMessage.searchComplete(toJson(results)));
            })
            .onErrorResume(e -> Flux.just(SseMessage.searchComplete("[]")));
} else {
    searchStream = Flux.empty();
}
```

#### Step 3：阶段 2 需求分析

```java
Flux<SseMessage> analysisStream = Flux.defer(() -> {
    String userPrompt = request.getPrompt();
    if (!searchResultsRef.get().isEmpty()) {
        userPrompt += "\n\n" + WebSearchClient.formatForPrompt(searchResultsRef.get());
    }
    return llmClient.streamChat(analyzePrompt, userPrompt, request.getModelName())
            .transform(s -> responseParser.parseStream(s, false))   // false: 保留 ```json 标记
            .concatMap(msg -> {
                if ("code_chunk".equals(msg.getType())) {
                    return Flux.just(SseMessage.analysisChunk(msg.getContent()));
                }
                if ("complete".equals(msg.getType())) {
                    String text = msg.getContent();
                    analysisRef.set(text);
                    analysisImagesRef.set(extractImagesFromAnalysis(text));
                    String elements = parseElementsFromAnalysis(text);
                    return Flux.just(SseMessage.analysisComplete(text),
                                     SseMessage.layoutComplete(elements));
                }
                return Flux.just(msg);
            });
});
```

注意 `parseStream(stream, false)` —— 分析阶段必须保留代码块标记，因为后续要从 ` ```json ` 块里解析结构化数据。

#### Step 4：阶段 3 代码生成

```java
Flux<SseMessage> codeStream = Flux.defer(() -> {
    String enriched = buildEnrichedPrompt(
        request.getPrompt(), analysisRef.get(),
        request.getWidth(), request.getHeight());
    return llmClient.streamChat(generatePrompt, enriched, request.getModelName())
            .transform(responseParser::parseStream)   // 默认 strip 代码块标记
            .map(msg -> {
                if ("complete".equals(msg.getType())) {
                    codeRef.set(msg.getContent());
                    if (imageGenerateService.isEnabled()) {
                        return SseMessage.codeComplete(msg.getContent());
                    }
                }
                return msg;
            });
});
```

#### Step 5：实现 `buildEnrichedPrompt`（最复杂的部分）

这是 RAG 注入的核心。完整实现按以下顺序拼装到 user message：

1. 原始 prompt
2. `══════` 分隔 + "强制执行" 标题
3. 解析 ```json 块，提取并写入：
   - `templateHint.{category, emotion, format}` → 用于检索（不写入 prompt）
   - `gene.{scene, emotion}` → 兜底检索字段（不写入 prompt）
   - `gene.style.*` → 写入"设计基因参数"
   - `gene.fonts.*` → 写入"推荐字体"
4. **字号预算 + 画面利用率**：调用 `computeTypographyBudget(width, height)` 得到确定性的字号区间，写入"字号预算"和"画面利用率约束"两个硬约束块（不依赖 LLM 分析结果）
5. 写入 `sections[]` → "区块高度分配"
6. 写入 `images[]` → "图片 seed 关键词"
7. **RAG 检索**：调用 `templateService.recommendByHint(hintCategory, hintEmotion, hintFormat, 2)`，把每条样本通过 `extractSampleSkeleton` 截断后写入"参考样本"块。样本引导语必须使用**硬约束标杆**措辞，不要用"请学习其手法"这类软措辞
8. 完整分析文本

完整代码见 [PosterGenerateService.java](../backend/src/main/java/com/seede/service/PosterGenerateService.java)。

#### Step 6：实现字号预算（解决"焦点字号偏小"降级问题）

之前代码生成的海报在 1080×1920 画布上主标题只有 72px、正文 22px，主焦点/正文只有 3.3 倍，远低于守则 1 的 5 倍要求。根因是 poster-generate.md 原先用 `text-7xl ~ text-9xl` 描述主标题（text-7xl = 72px 正是 Tailwind 下限），LLM 取下限"安全"落地。修复思路：后端基于画布尺寸确定性计算一组字号区间，写入 enriched prompt 作为硬约束，绕过 LLM 的默认 prior。

关键设计决策：**按宽度推导而不是高度**。字符的横向尺寸受画布宽度约束，按高度推会让 1080×3688 长图算出 400+px 这种荒唐的主标题。

```java
private record TypographyBudget(
        int heroMin, int heroMax,
        int subtitleMin, int subtitleMax,
        int sectionTitleMin, int sectionTitleMax,
        int bodyMin, int bodyMax,
        int captionMin, int captionMax
) {}

private TypographyBudget computeTypographyBudget(int width, int height) {
    int w = Math.max(1, width);
    double ratio = height > 0 ? (double) height / w : 1.0;
    double heroLo, heroHi;
    if (ratio >= 2.5) {           // 长图：纵向充裕
        heroLo = 0.15; heroHi = 0.22;
    } else if (ratio <= 1.3) {    // 方形：纵向紧张，给配角留空间
        heroLo = 0.11; heroHi = 0.17;
    } else {                      // 常规海报
        heroLo = 0.16; heroHi = 0.22;
    }
    return new TypographyBudget(
            (int) Math.round(w * heroLo),  (int) Math.round(w * heroHi),
            (int) Math.round(w * 0.036),   (int) Math.round(w * 0.052),
            (int) Math.round(w * 0.026),   (int) Math.round(w * 0.034),
            (int) Math.round(w * 0.022),   (int) Math.round(w * 0.028),
            (int) Math.round(w * 0.015),   (int) Math.round(w * 0.020)
    );
}
```

**为什么用区间而不是精确值**：保留创作多样性。固定值会让同尺寸画布永远生成同样体量的海报，区间给 LLM 留浮动空间但保证 hero/body ≥ 5 倍的比例约束始终成立。

**在 enriched prompt 中的渲染**：

```java
TypographyBudget budget = computeTypographyBudget(width, totalHeight);
String canvasFormat = classifyCanvasFormat(width, totalHeight);
sb.append("【字号预算（必须严格遵循 — 基于画布 ").append(width).append("×").append(totalHeight)
  .append(" ").append(canvasFormat).append(" 计算）】\n");
sb.append(String.format("- 主焦点 hero：fontSize 必须在 **%dpx ~ %dpx** 区间内%n",
        budget.heroMin(), budget.heroMax()));
// ...其余层级
sb.append("- **禁止**使用 Tailwind 的 text-7xl / text-8xl / text-9xl 承担主焦点角色\n");
sb.append("- 所有字号必须通过 inline style 显式写出具体 px 数字\n\n");
```

之后紧跟一个"画面利用率约束"硬约束块（5 条规则：section 填充率 ≥ 75%、padding ≤ 15%、禁用 justify-center 空白浮动等），解决"内容只占画布上半 60%，下半大片空白"的问题。这些规则与 LLM 分析结果无关，永远注入。

**v3 补强（字号预算推高后的副作用修复）**：字号从 72px 跃升到 200+px 后，LLM 按旧习惯写 section 高度导致内容溢出、板式相互覆盖。修复方法是扩展 `TypographyBudget` 加入三个 section 高度字段，并注入四块新约束：

```java
private record TypographyBudget(
        int heroMin, int heroMax,
        int subtitleMin, int subtitleMax,
        int sectionTitleMin, int sectionTitleMax,
        int bodyMin, int bodyMax,
        int captionMin, int captionMax,
        int heroSectionMinHeight,   // = heroMax × 2.5，≈ 595px @ 1080 wide
        int ctaSectionMinHeight,    // = max(400, width × 0.40)
        int infoRowMinHeight        // = max(80, bodyMax × 1.7 × 2 + 24)
) {}
```

四块注入约束的作用：

| 约束块 | 解决的失效模式 |
|---|---|
| **Section 高度预算** | 防止 LLM 把 hero section 写得太矮，要求 ≥ `heroSectionMinHeight` |
| **Hero 堆叠与行距规则** | 禁止 `lineHeight < 0.95` 和负 `marginTop`，防止两行 hero 视觉重叠 |
| **Content-fit 硬校验** | 写完每个 section 必须手算内容总高度 ≤ section 高度 × 0.95 |
| **Absolute 分离规则** | `absolute bottom-N` 装饰必须是 section 直接子元素，不参与 flex 流 |

这四块合起来闭环解决"字号预算生效后暴露的覆盖/错位"问题。v1/v2/v3 的责任分工：v1 决定字号，v2 保证不空白，v3 保证内容装得下且不撞。

#### Step 7：实现样本骨架提取

```java
private String extractSampleSkeleton(String sourceCode, int maxChars) {
    if (sourceCode == null || sourceCode.length() <= maxChars) return sourceCode;
    String head = sourceCode.substring(0, maxChars);
    int lastNewline = head.lastIndexOf('\n');
    if (lastNewline > maxChars / 2) head = head.substring(0, lastNewline);
    return head + "\n      {/* ... 以下为样本代码的后续区块，已省略 ... */}";
}
```

为什么 3500 字符够用：模板代码总是 `function Poster() { const colors = {...}; const typography = {...}; return (<div>...</div>); }` 结构，前 3500 字符必然包含 Token 定义和 1-2 个 JSX 区块，足够承载字号锚点和结构范式。

**RAG 样本引导语必须用硬约束措辞**：之前用"请学习其手法，创作风格相近但内容完全不同的海报"，LLM 把它理解为 aspirational reference，字号和图片数完全不向样本对齐。现在改为"硬约束标杆 — 不是灵感来源，是强制最低基准"，明确 4 条硬对齐维度（字号 ≥ 样本最大 fontSize / 图片数 ≥ 样本 `<img>` 数 / 密度 ≥ 样本 / 结构仿写），允许差异的维度只有文案、配色、seed、装饰位置。

#### Step 8：阶段 4 图片生成（可选）

```java
Flux<SseMessage> imageStream = Flux.defer(() -> {
    if (!imageGenerateService.isEnabled() || codeRef.get().isEmpty()) {
        return Flux.empty();
    }
    return imageGenerateService.generateImagesForCode(
        codeRef.get(), request.getPrompt(), analysisImagesRef.get());
});
```

### 4.5 复现：DOM→Canvas 引擎（前端）

**目标**：把 LLM 生成的 JSX 字符串渲染到 fabric.js 画布上。

**关键文件**：

```
frontend/src/engine/index.ts                   ← convertDomToCanvas 入口
frontend/src/engine/handlers/groupHandler.ts   ← 顶层调度
frontend/src/engine/handlers/textHandler.ts
frontend/src/engine/handlers/imageHandler.ts
frontend/src/engine/handlers/shapeHandler.ts
frontend/src/engine/parsers/styleParser.ts     ← computed style 提取
frontend/src/engine/parsers/layoutParser.ts    ← 坐标系转换
frontend/src/features/generation/services/jsxCompiler.ts
```

**复现步骤**：

#### Step 1：JSX 编译

```typescript
import * as Babel from '@babel/standalone';

export async function compileJsx(jsxCode: string): Promise<string> {
  const result = Babel.transform(jsxCode, {
    presets: ['react'],
  });
  return result.code;
}
```

#### Step 2：渲染到隐藏 DOM

```typescript
export async function renderToHiddenDom(
  compiledCode: string,
  width: number,
  height: number
): Promise<HTMLDivElement> {
  const hiddenDiv = document.createElement('div');
  hiddenDiv.style.cssText = `position:absolute;left:-99999px;width:${width}px;height:${height}px;`;
  document.body.appendChild(hiddenDiv);

  // 关键：用 new Function 隔离作用域，绝不能用 eval
  const PosterComponent = new Function('React', `${compiledCode}; return Poster;`)(window.React);

  const root = ReactDOM.createRoot(hiddenDiv);
  root.render(React.createElement(PosterComponent));

  // 等待图片加载
  await waitForImages(hiddenDiv);

  return hiddenDiv;
}

async function waitForImages(container: HTMLElement) {
  const imgs = Array.from(container.querySelectorAll('img'));
  if (imgs.length === 0) {
    await new Promise(r => setTimeout(r, 200));
    return;
  }
  await Promise.all(imgs.map(img =>
    new Promise(resolve => {
      if (img.complete) resolve(null);
      else { img.onload = img.onerror = () => resolve(null); }
    })
  ));
}
```

#### Step 3：DOM 转 Canvas

`convertDomToCanvas` 递归遍历 DOM 树，每个节点：

1. 调用 `getBoundingClientRect()` 拿到坐标
2. `window.getComputedStyle()` 拿到样式
3. 根据节点类型分发到 handler：
   - `<img>` → `imageHandler` → `fabric.Image`
   - 文本节点 → `textHandler` → `fabric.Text`
   - 有背景色的 `<div>` → `shapeHandler` → `fabric.Rect`
   - 容器 div → `groupHandler` 递归

#### Step 4：finally 必须清理

```typescript
try {
  const dom = await renderToHiddenDom(compiledCode, width, height);
  await convertDomToCanvas(dom, canvas);
} finally {
  document.body.removeChild(hiddenDiv);   // ← 这一行不能漏
}
```

### 4.6 复现：图片代理（CORS 解决方案）

**问题**：fabric.js 序列化画布到 PNG 时，如果画布上有跨域图片（picsum.photos / placehold.co），会触发 tainted canvas 错误，导出失败。

**解决方案**：后端转发请求并加 CORS 头。

**关键文件**：[ImageProxyController.java](../backend/src/main/java/com/seede/controller/ImageProxyController.java)

**复现步骤**：

```java
@GetMapping("/image")
public Mono<ResponseEntity<byte[]>> proxyImage(@RequestParam String url) {
    return webClient.get()
        .uri(URI.create(url))
        .retrieve()
        .bodyToMono(byte[].class)
        .map(bytes -> ResponseEntity.ok()
            .header("Access-Control-Allow-Origin", "*")
            .header("Cache-Control", "public, max-age=3600")
            .contentType(MediaType.IMAGE_JPEG)
            .body(bytes));
}
```

前端在 `imageHandler.ts` 里把 `<img src="https://picsum.photos/...">` 替换为 `<img src="/api/proxy/image?url=https%3A//picsum.photos/...">`。

---

## 5. Prompt 工程复现

### 5.1 文件清单

| 文件 | 作用 |
|---|---|
| `poster-analyze.md` | 需求分析阶段 system prompt |
| `poster-generate.md` | 代码生成阶段 system prompt |
| `poster-chat.md` | 对话优化 system prompt |
| `poster-roll.md` | 单元素重生 system prompt |
| `image-prompt.md` | 图片描述生成 |
| `design-reference.md` | 设计参考库 |

### 5.2 复现 poster-analyze.md 的核心结构

文件分两大部分：

**第一部分：自然语言设计方案**

要求 LLM 用自然语言描述：场景判断、配色基调、字体选择、各区块功能、密度分配、视觉焦点。这部分会被流式推送给前端展示给用户。

**第二部分：```json 结构化数据**

强制 LLM 在第二部分输出 ```json 代码块，包含 5 个字段：

```json
{
  "templateHint": { "category", "emotion", "format" },   // ★ 用于 RAG 检索
  "gene":         { "scene", "emotion", "style", "fonts" },
  "sections":     [{name, heightPercent, background, density, focalPoint}],
  "images":       [{purpose, seed, description, width, height}],
  "elements":     [{type, label}]
}
```

**关键**：

- 在 `templateHint` 后面附完整词表（15 + 6 + 3 个固定值），让 LLM 必须从词表选
- `style.*` 必须用 HEX 而不是 Tailwind 类名（便于代码直接引用）
- `sections[].heightPercent` 之和必须 = 100

### 5.3 复现 poster-generate.md 的设计哲学

不要试图用规则覆盖所有海报场景——这会导致死板。正确做法：

1. **保留**只有规则能传达的硬约束：
   - Design Token 必须定义
   - 色彩 3 色系上限
   - DOM→Canvas 引擎不支持的 CSS 列表
   - Tailwind 类名白名单
   - 图片 `<img>` + `prompt` 属性
   - **字号预算**（`computeTypographyBudget` 基于画布宽度确定性算出的 px 区间），作为 hard range 注入 prompt。样本只教风格，尺寸锚点由规则提供，消除 LLM 取默认值的退化路径。
   - **画面利用率**（section 填充率 ≥ 75%、整张 ≥ 60%），防止 `flex justify-center` 造成大片空白。
   - **亮点/特性/节目卡片必须含 `<img>`**，emoji 不能充当卡片主体（emoji 是 24–48px 的字形，权重比 `<img>` 小 10–50 倍，直接踩中"emoji 滥用"负面提示）。
   - **二维码占位统一走 `https://picsum.photos/seed/qrcode/...`**，严禁 `<div>qrcode</div>` 或 `placehold.co/?text=qrcode`（后者会把 "qrcode" 文字烧进图片里）。

2. **删除**规则去描述具体设计手法（已被 RAG 样本替代）：
   - 各种构图手法的代码示例
   - "网页化组件"黑名单
   - 死板的"必须有 N 个区块"约束
   - Tailwind 相对字号（text-7xl / text-8xl / text-9xl）承担主焦点的写法 —— 被字号预算硬范围完全取代

3. **软化**与样本可能冲突的硬规则：
   - 把"严禁 section 堆叠"改为"按样本格式判断"
   - 把"必须 100% 留白"改为"按样本密度对齐"
   - 在守则中明确"参考样本为准"
   - RAG 样本从"参考/模仿"强化为"hard-align / 严格对齐样本的体量感与内容密度"

完整的演进历史见 [tech-plan.md 第 10.4 节](./tech-plan.md#104-poster-generatemd-演进历史)。

---

## 6. 调试与排查

### 6.1 后端日志关键字

```
模板服务初始化完成: ...                  ← 启动是否成功
联网搜索功能状态: enabled=...             ← 搜索开关
开始需求分析 LLM 调用                    ← 阶段 2 开始
解析 templateHint: category=..., ...     ← templateHint 是否解析成功
结构化模板检索: category=..., ...        ← RAG 检索请求
结构化模板检索完成: 返回 N 条样本          ← RAG 是否成功
已注入 N 条参考样本骨架到生成 prompt      ← 样本是否注入
开始代码生成 LLM 调用，enriched prompt 长度: X 字符
```

> 字号预算块和画面利用率约束没有独立日志行——它们被直接拼进 enriched prompt。验证方式：把 `com.seede.service.PosterGenerateService` 日志级别调到 `DEBUG`，或者临时在 [PosterGenerateService.java:426](../backend/src/main/java/com/seede/service/PosterGenerateService.java#L426) 附近加一行 `log.debug("字号预算 hero={}~{}px canvasFormat={}", budget.heroMin, budget.heroMax, canvasFormat);`，确认 LLM 拿到的是基于画布宽度计算出的 px 区间。

### 6.2 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| 启动报 `LLM_API_KEY 不能为空` | 环境变量没设 | 设 `LLM_API_KEY` |
| 生成的海报像网页 | LLM 没读取样本 / 样本太少 | 检查日志中的 `结构化模板检索完成: 返回 N 条` 是否 ≥1 |
| `结构化模板检索完成: 返回 0 条` | templateHint 词表选错 | 检查 LLM 输出的 templateHint 是否在固定词表内 |
| `templateHint 为空，退化为 scene/emotion 模糊检索` | 旧版 analyze prompt 没输出 templateHint | 更新 poster-analyze.md |
| 画布导出 PNG 报 tainted canvas | 图片代理没生效 | 检查 ImageProxyController 是否注册，前端 imageHandler 是否替换 URL |
| 前端编译报 backdrop-blur 不生效 | DOM→Canvas 引擎不支持 | 改用纯色蒙版（已写入 prompt 约束） |
| LLM 返回的 JSX 报语法错 | LLM 没去掉 ```jsx 标记 | 检查 `LlmResponseParser.parseStream(stream, true)` 是否调用 |
| 主标题字号偏小、焦点不够（hero ≈ 72px） | LLM 忽略字号预算，回退到 Tailwind 默认 | 确认 [PosterGenerateService.java:426](../backend/src/main/java/com/seede/service/PosterGenerateService.java#L426) 的字号预算块已注入；检查 LLM 输出是否用 `text-7xl` / `text-8xl` 代替了 inline `fontSize: 'XXXpx'`（prompt 已禁但偶尔被绕过）|
| 画布内容只占上半、下半大片空白 | LLM 用 `flex items-center justify-center` 把少量内容浮在中央 | 画面利用率硬约束已在 [poster-generate.md 第 166 行](../backend/src/main/resources/prompts/poster-generate.md#L166) section 填充率 ≥75%、整张 ≥60%；如仍复现，在 dev-tools 里对比生成 JSX 和该约束 |
| 亮点卡片里出现 emoji（🏆🎭🎁🍽️） | LLM 无视卡片 `<img>` 硬约束 | 检查 [poster-generate.md:342](../backend/src/main/resources/prompts/poster-generate.md#L342)「亮点/特性卡片必须含 `<img>`」段是否在 prompt 内；对比 RAG 样本是否使用 `<img>`（样本是否出现降级会被 LLM 模仿） |
| 二维码位置显示字面文字 "qrcode" | LLM 用 `<div>qrcode</div>` 或 `placehold.co/?text=qrcode` | 检查生成 JSX 中二维码位置是否用 `https://picsum.photos/seed/qrcode/<w>/<h>`；[poster-generate.md:400](../backend/src/main/resources/prompts/poster-generate.md#L400) 已列为严禁写法 |
| 长图（1080×3688）hero 字号爆炸到 400px+ | 字号预算基于 height 而非 width 推导 | 确认 [computeTypographyBudget](../backend/src/main/java/com/seede/service/PosterGenerateService.java#L747) 使用 `width` 作为基数，长图格式系数为 0.15~0.22 × width |
| Section 之间文字/板式相互覆盖、位置错乱 | LLM 按旧习惯写 section 高度，字号推高后内容溢出 | v3 Section 高度预算已注入；检查生成 JSX 中第一个 section 高度是否 ≥ `heroSectionMinHeight`（1080 宽下 ≈ 595px）；手算每个 section 内部内容总高度是否 ≤ section × 0.95 |
| 两行 hero（如 "2026" + "年度盛典"）视觉重叠 | LLM 用 `lineHeight: 0.85` + `marginTop: -30px` 压缩 trick | 检查生成 JSX 中 hero 的 `lineHeight` 是否 ≥ 0.95、`marginTop` 是否为非负；v3 Hero 堆叠规则已在 prompt 禁用此类写法 |
| Section 底部 `absolute` 装饰元素和 flow 正文相撞 | LLM 把 absolute 装饰放在承载 flow 内容的 flex 容器里 | 检查生成 JSX 中 `absolute bottom-*` 是否与 flex 容器同级（而非子元素）；v3 Absolute 分离规则已要求装饰作为 section 直接子元素 |
| 海报图片和主题完全不符，像随机照片 | `IMAGE_GENERATE_API_KEY` 未设置，picsum 占位图未被替换 | 启动日志中查 `IMAGE_GENERATE_API_KEY 未配置` 告警框；设置火山引擎 Seedream 密钥后重启 |

### 6.3 验证 RAG 是否生效

最直接的方式：

```bash
curl -N -X POST http://localhost:8080/api/posters/generate \
  -H "Content-Type: application/json" \
  -d '{"prompt":"青岛啤酒百年传承长图","width":1080,"height":3688}'
```

观察后端日志应出现：

```
解析 templateHint: category=品牌故事, emotion=高端奢华, format=长图
结构化模板检索: category=品牌故事, emotion=高端奢华, format=长图
结构化模板检索完成: 返回 2 条样本, ids=[..., ...]
已注入 2 条参考样本骨架到生成 prompt, 样本总字符数=~7000
```

如果 `样本总字符数` 远超 7000，说明 `extractSampleSkeleton` 没生效。

### 6.4 编译验证

JDK 21 是必须的。如果 `mvn` 默认用了旧 JDK：

```bash
# Windows: 用 IntelliJ 自带 JDK 21
JAVA_HOME="C:/Program Files/JetBrains/IntelliJ IDEA <version>/jbr" mvn clean compile

# Linux/Mac: 设 JAVA_HOME 指向 JDK 21
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
mvn clean compile
```

成功标志：

```
[INFO] Compiling 31 source files with javac [debug parameters release 21] to target\classes
[INFO] BUILD SUCCESS
```

---

## 7. 关键依赖

### 7.1 后端 `pom.xml` 核心依赖

```xml
<dependency>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-webflux</artifactId>
</dependency>
<!-- 严禁加 spring-boot-starter-web，会与 webflux 冲突 -->
<dependency>
  <groupId>com.fasterxml.jackson.core</groupId>
  <artifactId>jackson-databind</artifactId>
</dependency>
```

Java 版本：

```xml
<properties>
  <java.version>21</java.version>
</properties>
```

### 7.2 前端 `package.json` 核心依赖

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@babel/standalone": "^7.x",
    "fabric": "^6.x",
    "zustand": "^5.x",
    "tailwindcss": "^3.4.0"
  }
}
```

注意：

- React **19**（不是 18）
- Tailwind **3.4**（不是 4.x）
- 不使用 esbuild / Puppeteer（早期文档错误描述）

---

## 8. 部署注意事项

| 项 | 说明 |
|---|---|
| 后端 | 标准 Spring Boot 服务，可部署到任何支持 JVM 的环境 |
| 前端 | 静态资源，构建后部署到 CDN/Nginx |
| 数据库 | **不需要**，所有状态在浏览器内存或 LLM 上下文 |
| 文件存储 | **不需要**，画布数据保存在浏览器 |
| 反向代理 | 必须正确转发 SSE，需要禁用代理缓冲（Nginx: `proxy_buffering off`） |
| LLM_API_KEY | 通过环境变量注入，不要硬编码 |

---

## 9. 进一步阅读

- **架构与模块详解**：[tech-plan.md](./tech-plan.md)
- **模板数据准备与质量评分**：[design-data-analysis.md](./design-data-analysis.md)
- **工作流逆向分析**：[workflow-analysis.md](./workflow-analysis.md)
- **产品愿景与 Gene Logic**：[product-optimization-analysis.md](./product-optimization-analysis.md)
- **Agent 实现规则**（实现代码前必读）：[../\_bmad-output/project-context.md](../_bmad-output/project-context.md)
- **CLAUDE.md**：[../CLAUDE.md](../CLAUDE.md) —— 项目级开发约束
