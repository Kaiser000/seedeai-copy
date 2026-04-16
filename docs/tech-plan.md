# Seede AI 技术方案

> 本文档是 Seede AI 的完整技术参考。读完后应能：
> 1. **理解**整体架构与每一阶段的数据流
> 2. **定位**每一处实现到具体的文件、类、方法和行号
> 3. **独立复现**核心模块（生成流水线、RAG 检索、DOM→Canvas 引擎）

---

## 1. 项目定位与核心数据流

Seede AI 是 LLM 驱动的海报生成平台。**LLM 直接充当模板引擎**，不维护设计模板库，生成的是可渲染的 React+Tailwind JSX。

```
用户输入（prompt + 尺寸 + 模型选择）
    │
    ▼
联网搜索（可选）─────────────────┐
    │                          │ 真实数据注入
    ▼                          │
LLM 需求分析 ─────────────────────┤
    │ 输出 templateHint + gene + sections + images + elements
    ▼
RAG 模板检索（按 templateHint 精确匹配）
    │ 返回 2 条同类高质量模板的代码骨架
    ▼
LLM 代码生成 ─────────────────────┤
    │ 输出完整 React+Tailwind JSX │ 样本骨架作为 few-shot
    ▼                          │ 设计基因 + 区块约束 + 图片 seed
图片生成（可选）──────────────────┘
    │ 把 placeholder URL 替换为真实生成图
    ▼
浏览器接收完整 JSX
    │
    ▼
@babel/standalone 编译 JSX → JS
    │
    ▼
ReactDOM.createRoot 渲染到隐藏 DOM
    │
    ▼
DOM→Canvas 引擎（getBoundingClientRect + handlers + fabric.js）
    │
    ▼
fabric.js 画布对象（可编辑）→ PNG 导出
```

整个流程是 **SSE 流式**的：用户从输入到看到完整海报的过程中，前端持续接收 `thinking → analysis_chunk* → analysis_complete → layout_complete → code_chunk* → code_complete → image_analyzing → image_generating* → image_complete* → complete` 事件。

---

## 2. 技术栈

### 前端

| 模块 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 框架 | React | **19** | 注意是 19 不是 18 |
| 构建 | Vite | 7.x | 端口 5173，`/api` 代理到 :8080 |
| 语言 | TypeScript | strict 模式 + verbatimModuleSyntax |
| 样式 | Tailwind CSS | **3.4**（非 4.x） | 用 `tailwind.config.js`（非 CSS-first） |
| UI 组件 | shadcn/ui | — | 仅 `shared/utils/index.ts` 用 barrel export |
| 状态管理 | Zustand | — | useEditorStore + useCanvasCommands |
| JSX 编译 | @babel/standalone | — | 浏览器端编译 LLM 输出的 JSX |
| Canvas | fabric.js | — | 编辑器底层渲染引擎 |
| 测试 | Vitest + jsdom | — | 测试目录 `src/__tests__/{layer}/{feature}/` |

### 后端

| 模块 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 框架 | Spring Boot | 3.5.12 | **WebFlux only**，绝不能加 `spring-boot-starter-web` |
| 语言 | Java | 21 | 用 switch expression、record 等新特性 |
| LLM 网关 | 智谱 GLM-4.7 | — | 默认 provider，支持 OpenAI 兼容 / Anthropic 原生 / OpenRouter |
| 图片生成 | 火山方舟 doubao-seedream | — | 默认模型 `doubao-seedream-4-0-250828` |
| 联网搜索 | 讯飞星辰 CBM | — | 可选启用 |
| 反应式栈 | Reactor | — | `Flux<ServerSentEvent<SseMessage>>` |
| 序列化 | Jackson | — | ObjectMapper |

---

## 3. 整体架构

```
┌──────────────────── 浏览器 ────────────────────┐
│                                              │
│  features/input ─┐                           │
│                  ├──▶ features/generation    │
│                  │     ├ useGenerate (SSE)   │
│                  │     ├ jsxCompiler         │
│                  │     ├ sseClient           │
│                  │     └ canvasSerializer    │
│                  │                           │
│                  ▼                           │
│            features/editor                   │
│            ├ EditorPage                      │
│            ├ canvasRegistry (单例)           │
│            ├ stores/useEditorStore           │
│            └ hooks/useCanvasCommands         │
│                  │                           │
│                  ▼                           │
│            engine/                           │
│            ├ index.ts (convertDomToCanvas)   │
│            ├ handlers/{group,text,image,shape}│
│            └ parsers/{layout,style}          │
│                                              │
└────────────────────┬─────────────────────────┘
                     │ SSE (text/event-stream)
                     │ POST /api/posters/{generate,chat,roll}
                     ▼
┌──────────────────── Spring Boot WebFlux ────────────────────┐
│                                                            │
│  controller/                                               │
│  ├ PosterController     POST /api/posters/generate         │
│  ├ ChatController       POST /api/posters/chat             │
│  ├ RollController       POST /api/posters/roll             │
│  ├ TemplateController   GET  /api/templates*               │
│  ├ ImageProxyController GET  /api/proxy/image              │
│  ├ ModelController      GET  /api/models                   │
│  └ HealthController     GET  /api/health                   │
│                                                            │
│  service/                                                  │
│  ├ PosterGenerateService ◀─── 主流水线（6 阶段）           │
│  │   ├ webSearchClient.search()                            │
│  │   ├ llmClient.streamChat(analyzePrompt)                 │
│  │   ├ templateService.recommendByHint() ◀── RAG 检索      │
│  │   ├ buildEnrichedPrompt() (注入样本骨架 + 设计方案)     │
│  │   ├ llmClient.streamChat(generatePrompt)                │
│  │   └ imageGenerateService.generateImagesForCode()        │
│  ├ TemplateService     290 模板元数据 + sourceCode 索引    │
│  ├ ImageGenerateService 占位图 → 真实图片                  │
│  ├ WebSearchClient     讯飞搜索                            │
│  ├ ChatOptimizeService 对话优化海报                        │
│  └ RollService         单元素重新生成                      │
│                                                            │
│  llm/                                                      │
│  ├ LlmClient           多 provider 适配（OpenAI/Anthropic/OpenRouter）│
│  ├ LlmResponseParser   SSE → SseMessage 流式解析            │
│  └ SystemPromptManager 加载 prompts/*.md 并注入 {{变量}}    │
│                                                            │
│  resources/                                                │
│  ├ prompts/                                                │
│  │   ├ poster-analyze.md   需求分析                         │
│  │   ├ poster-generate.md  代码生成（瘦身 + 样本驱动）      │
│  │   ├ poster-chat.md      对话优化                         │
│  │   ├ poster-roll.md      单元素重生                       │
│  │   ├ image-prompt.md     图片描述生成                     │
│  │   └ design-reference.md 设计参考库                       │
│  ├ all_items.json          325 模板完整数据（约 4MB）       │
│  ├ template-metadata.json  290 个合格模板的元数据索引       │
│  └ template-presets.json   预设模板配置                     │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## 4. 后端：生成流水线（核心）

入口：[PosterGenerateService.java](../backend/src/main/java/com/seede/service/PosterGenerateService.java) 的 `generate(GenerateRequest)` 方法。

流水线由 6 个 `Flux` 串联，使用 `AtomicReference` 在阶段间传递数据：

```java
return Flux.concat(searchStream, thinkingMsg, analysisStream, codeStream, imageStream)
```

每个阶段通过 `Flux.defer()` 延迟创建，确保上一阶段的结果（存在 AtomicReference 中）已就绪。

### 4.1 入口与请求模型

```http
POST /api/posters/generate
Content-Type: application/json

{
  "prompt": "2026 年个人所得税退税提醒长图",
  "width": 1080,
  "height": 3688,
  "modelName": "glm-4.7"   // 可选，覆盖默认模型
}
```

返回 `text/event-stream`，每条事件是一个 `SseMessage{ type, content, retryable? }`。

### 4.2 阶段 1：联网搜索（可选）

文件：[WebSearchClient.java](../backend/src/main/java/com/seede/service/WebSearchClient.java)

- 由 `web-search.enabled` 控制开关（默认 false）
- 截取用户 prompt 前 20 个字符作为搜索关键词
- 调用讯飞 CBM API 返回 SearchResult 列表
- 推送 SSE：`search_start → search_complete`
- 失败时降级为空结果，不中断主流程
- 结果通过 `WebSearchClient.formatForPrompt()` 序列化为文本，注入到下一阶段的用户消息中（**不**注入 system prompt）

### 4.3 阶段 2：需求分析

调用 LLM 用 [poster-analyze.md](../backend/src/main/resources/prompts/poster-analyze.md) 做需求分析，输出**第一部分**自然语言设计方案 + **第二部分** ```json 结构化数据。

#### 输出 JSON Schema（必须严格遵守）

```json
{
  "templateHint": {              // ★ 用于 RAG 检索的结构化路由（必填）
    "category": "品牌故事",       // 15 个固定分类之一
    "emotion": "高端奢华",        // 12 个固定情绪之一
    "format": "长图"              // 长图 / 常规 / 方形
  },
  "gene": {                      // 设计基因参数
    "scene": "社交媒体长图",      // 自由文本（兜底，备用模糊检索）
    "emotion": "高端/奢华",
    "layoutStyle": "free-composition",  // 构图风格（6 种之一，驱动布局技术选择）
    "colorStrategy": "complementary",   // 配色策略（4 种之一，驱动色彩推导方法）
    "style": {
      "primaryColor": "#1A1A1A",
      "accentColor": "#D4AF37",
      "bgColor": "#F9F8F6",
      "textColor": "#1A1A1A",
      "textMutedColor": "#6C6863",
      "borderColor": "rgba(26,26,26,0.1)",
      "cornerRadius": "rounded-2xl",
      "shadowLevel": "shadow-lg",
      "tracking": "tracking-wide"
    },
    "fonts": {
      "title": "LanternMingA",
      "body": "Noto Sans",
      "numeric": "Inter"
    }
  },
  "sections": [                  // 区块列表，heightPercent 之和必须 = 100
    {
      "name": "区块名称",
      "heightPercent": 25,
      "background": "bg-gradient-to-b from-red-600 to-red-800",
      "function": "头部主视觉",
      "density": "medium",       // low / medium / high
      "focalPoint": "主标题文字"
    }
  ],
  "images": [                    // 图片需求列表
    {
      "purpose": "全屏背景",
      "seed": "celebration",     // picsum.photos 的 seed 关键词
      "description": "节日庆祝氛围的暖色调场景",
      "width": 1080,
      "height": 800
    }
  ],
  "elements": [                  // 所有可见元素的扁平列表
    {"type": "shape", "label": "..."},
    {"type": "image", "label": "..."},
    {"type": "text", "label": "..."}
  ]
}
```

#### templateHint 固定词表

| 字段 | 取值 |
|---|---|
| `category` | 电商产品 / 品牌故事 / 报告报表 / 健康医疗 / 美食餐饮 / 旅游行程 / 活动邀请 / 教育培训 / 招聘招生 / 读书笔记 / 节日节气 / 科技AI / 政策解读 / 设计创意 / 综合海报 |
| `emotion` | 专业权威 / 高端奢华 / 温暖治愈 / 活泼年轻 / 紧急促销 / 极简现代 / 复古怀旧 / 赛博未来 / 童趣可爱 / 自然有机 / 严肃纪实 / 节庆狂欢 |
| `format` | 长图（h/w ≥ 2.5）/ 常规（1.3 < h/w < 2.5）/ 方形（h/w ≤ 1.3） |

LLM 必须从词表中精确选择，不能自创值。完整词表说明见 [poster-analyze.md](../backend/src/main/resources/prompts/poster-analyze.md) 的"templateHint 固定词表"段落。

#### SSE 推送

```
thinking: "正在分析设计需求..."
analysis_chunk: "采用专业、权威的政务风格..." (流式，多次)
analysis_complete: <完整分析文本>
layout_complete: {"elements":[...]}  // 解析出的元素列表
```

### 4.4 阶段 2.5：RAG 模板检索

文件：[TemplateService.java](../backend/src/main/java/com/seede/service/TemplateService.java)

启动时通过 `@PostConstruct init()` 加载两个 JSON：

```java
metadataList: List<TemplateInfo>           // 290 条元数据，按 quality 降序
fullDataIndex: Map<String, JsonNode>       // id → 完整模板节点（含 sourceCode）
```

#### 核心方法：`recommendByHint(category, emotion, format, count)`

精确结构化检索，打分规则：

| 匹配情况 | 分数 |
|---|---|
| category + emotion + format 全匹配 | 300 |
| category + emotion 匹配（format 不同） | 200 |
| 仅 category **或** 仅 emotion 匹配 | 100 |
| 仅 format 匹配 | 50 |
| **+ 质量分** | + `quality`（1-10） |
| **+ 随机扰动** | + `random(-20, +20)`，打破得分相近时的固定排序 |

打分后：
1. 按分数降序排序
2. 取 **扩大的** top pool（至少 `count*8` 条，最多得分 ≥100 的前 20 条）
3. **shuffle pool** → 通过 `selectWithCategoryDiversity()` 选出 `count` 条，优先保证返回样本分类（category）不同
4. 通过 `getDetail(id)` 拿到完整 `TemplateDetail`（含 sourceCode）

**多样性三重保障**：
- **随机扰动**：每次评分加 ±20 分噪声，让得分接近的模板排名每次不同
- **扩大池子**：pool 从 `count*4=8` 增大到 `count*8=16`，覆盖更多候选
- **分类去重**：优先选不同 category 的样本（第一轮去重，第二轮补足）

对于新增情绪（复古怀旧、赛博未来等，模板库中暂无对应标签），评分自动退化为 category+format 匹配，配色/风格差异由 prompt 中的 gene 参数驱动。

#### 兜底：`recommendSimilar(scene, emotion, width, height, count)`

当分析阶段没输出 `templateHint`（旧版本 prompt 或解析失败）时使用，按 `gene.scene/emotion` 模糊匹配 + 宽高比分类。打分规则较松：format 100 + emotion 50 + category 关键词 30 + 随机扰动 ±20。同样使用扩大池子 + 分类去重。

### 4.5 阶段 3：代码生成

调用 LLM 用 [poster-generate.md](../backend/src/main/resources/prompts/poster-generate.md) 生成 JSX。这一阶段的关键是 **`buildEnrichedPrompt`**，它把以下信息拼装到用户消息（不是 system prompt）：

```
原始用户 prompt
══════════════════════════════════════════
【强制执行】以下设计方案由需求分析阶段确定...
══════════════════════════════════════════

【设计基因参数（必须严格遵循）】
- 场景类型：...
- 目标情绪：...
- 构图风格：free-composition（必须使用对应的构图技术）
- 配色策略：complementary（必须基于此策略推导色彩）
- 主色(HEX)：#1A1A1A
- 强调色(HEX)：#D4AF37
- ...

【字号预算（必须严格遵循 — 基于画布 1080×1920 常规 计算）】
- 主焦点 hero：fontSize 必须在 **173px ~ 238px** 区间内
- 副标题 subtitle：fontSize 必须在 **39px ~ 56px** 区间内
- 区块标题 sectionTitle：fontSize 必须在 **28px ~ 37px** 区间内
- 正文 body：fontSize 必须在 **24px ~ 30px** 区间内
- 说明文字 caption：fontSize 必须在 **16px ~ 22px** 区间内
- 焦点/正文比例必须 ≥ 5.8 倍
- 禁止使用 text-7xl/8xl/9xl 承担主焦点角色

【画面利用率约束（防止大片空白）】
- 每个 section 内部 padding ≤ 15% section 高度
- 每个 section 内容填充率 ≥ 75%
- 禁止用 flex justify-center 把少量内容浮在 section 中央
- 整张海报内容填充率 ≥ 画布面积的 60%

【区块高度分配（必须严格遵循）】
- 头部：高度 480px（25%），背景 ...
- ...

【图片 seed 关键词（必须使用以下 seed）】
- 全屏背景：seed="celebration"，尺寸 1080x800
- ...

【参考样本（硬约束标杆 — 不是灵感来源，是强制最低基准）】
以下是从 290+ 模板库按 (category/emotion/format) 精确检索出的 2 个同类高质量样本...
每个已截断为前 3500 字符的骨架。你必须在字号体量 / 图片数量 / 内容密度 / 结构四个维度与样本硬对齐。

──── 参考样本 1 ────
名称：青岛啤酒经典百年传承长图
分类：品牌故事
情绪：高端奢华
尺寸：1080x3688
代码骨架：
```jsx
function Poster() {
  const colors = { ... };
  const typography = { ... };
  return (
    <div ...>
      ... (前 1-2 个 JSX 区块)
      {/* ... 以下为样本代码的后续区块，已省略 ... */}
```

──── 参考样本 2 ────
...

【完整设计方案】
<analyze 阶段输出的完整文本>
```

#### 样本骨架提取

方法：[`extractSampleSkeleton(sourceCode, maxChars)`](../backend/src/main/java/com/seede/service/PosterGenerateService.java)

策略（两阶段骨架提取，结构优先）：

**核心理念：保留 100% 的布局结构，压缩文案内容，裁剪装饰性板式。**

**Phase 1 — 文案压缩**（保留结构，剥离内容）：
1. 去除 import / ReactDOM 渲染样板
2. 压缩 JSX 标签间的长中文文本：`>五一国际劳动节快乐<` → `>五一国际...<`
3. 压缩 img prompt 属性（长英文描述 → 前 10 字符）
4. 压缩含中文的短引号字符串（数据数组中的标题/描述）
5. 深层缩进减半（保留嵌套层级关系）
6. 折叠连续空行

**Phase 2 — 板式裁剪**（仅在 Phase 1 后仍超预算时执行）：
1. 移除装饰性 className（shadow-/rounded-/border-/opacity-/transition/hover:）
2. 移除 textShadow 样式
3. 缩写超长 className 链（保留前 60 字符的布局类，截断尾部装饰类）

**兜底**：若两阶段后仍超预算，对已高度压缩的代码做头部截取（每字符的结构密度是原始代码的 2-3 倍）。

#### 实测效果

| 指标 | 值 |
|---|---|
| 预算 | 12000 字符 / 样本 |
| 模板完整保留率 | **74.4%**（241/324） |
| 中位数模板（12661 字符） | Phase 1 → ~10400，Phase 2 → ~9900，**完整保留** |
| P90 模板（18983 字符） | 需截断，但截断的是已压缩代码，结构信息密度 2-3x |
| 2 样本总预算 | ~24K chars ≈ 8K tokens，占 128K 上下文 6% |

#### 字号预算系统

**背景**：之前生成的海报在 1080×1920 画布上出现"主焦点字号仅 72px、和正文 22px 比只有 3.3 倍"这种降级问题。根因是 poster-generate.md 原先用 `text-7xl ~ text-9xl` 描述主标题字号范围，而 text-7xl = 72px 正好是 Tailwind 的下限值，LLM 取下限"安全"落地，导致海报失去海报感。同时 RAG 样本的"请学习其手法"措辞太软，LLM 不会去对齐样本的 fontSize 数字。

**方案**：`PosterGenerateService.buildEnrichedPrompt` 基于画布**宽度**（不是高度）确定性计算一组字号区间，作为硬约束注入 enriched prompt。

**为什么按宽度推**：字符的横向尺寸受画布宽度约束。按高度推会让 1080×3688 长图算出 400+px 这种荒唐的主标题宽度。

**推导公式**（[PosterGenerateService.computeTypographyBudget](../backend/src/main/java/com/seede/service/PosterGenerateService.java)）：

| 画布格式 | 判定 | hero 系数 | 1080 宽下 hero 区间 |
|---|---|---|---|
| 长图 | h/w ≥ 2.5 | 0.15 ~ 0.22 | 162 ~ 238px |
| 常规 | 1.3 ~ 2.5 | 0.16 ~ 0.22 | 173 ~ 238px |
| 方形 | h/w ≤ 1.3 | 0.11 ~ 0.17 | 119 ~ 184px |

其他层级（subtitle / sectionTitle / body / caption）按宽度固定系数，不区分格式：

| 层级 | 宽度系数 | 1080 宽下区间 |
|---|---|---|
| subtitle | 0.036 ~ 0.052 | 39 ~ 56px |
| sectionTitle | 0.026 ~ 0.034 | 28 ~ 37px |
| body | 0.022 ~ 0.028 | 24 ~ 30px |
| caption | 0.015 ~ 0.020 | 16 ~ 22px |

**为什么用区间而不是精确值**：保留创作多样性。固定值会让同尺寸画布永远生成同样体量的海报，缺乏变化；但区间可以确保 hero/body ≥ 5 倍的守则 1 约束始终成立。

**方形画布 hero 系数偏小**：方形海报纵向空间紧张（1080×1080），hero 需要留空间给副标题、主图等配角，所以系数降到 0.11 ~ 0.17。长图 / 常规共用 0.16 ~ 0.22 因为它们都有充足纵向空间。

#### 画面利用率约束

与字号预算一同注入的第二条硬约束，解决"海报内容只占画布上半 60%，下半大片空白"的问题。五条硬规则：

1. Section 内部 padding（py-*）≤ section 高度的 15%
2. Section 内容填充率 ≥ 75%
3. 禁用 `flex items-center justify-center` 导致少量内容浮于中央
4. Header section 必须至少含 hero + 副标题 + 2 个装饰元素
5. 整张海报内容填充率 ≥ 画布面积 60%

这些规则直接在 `buildEnrichedPrompt` 中硬编码写入 enriched prompt，不需要解析分析阶段 JSON，因此与模型能力无关，永远生效。

#### Section 高度预算 + Content-fit 硬校验（v3，解决字号预算推高后的新失效模式）

**背景**：字号预算系统上线后，hero 字号从 72px 跃升到 200+px，但 LLM 仍按旧习惯写 section 高度（头部 ≈ 38%、信息 ≈ 25%、卡片 ≈ 20%、CTA ≈ 17%）。结果 section 内部的文字 + 装饰 + 图片总高度超过 section 高度，导致：
- 后续 section 被前一个 section 溢出内容覆盖
- `absolute bottom-N` 装饰元素和 flow 正文相撞
- LLM 用 `lineHeight: 0.85` + `marginTop: -30px` 压缩 hero 行距试图救场，造成两行 hero 视觉重叠

**方案**：扩展 `TypographyBudget` record 增加三个 section 高度字段，注入新的「Section 高度预算」+「Hero 堆叠规则」+「Content-fit 硬校验」+「Absolute 分离规则」四块约束到 enriched prompt。

**Section 高度字段**（由 `computeTypographyBudget` 推导）：

| 字段 | 公式 | 1080×1920 下取值 | 设计意图 |
|---|---|---|---|
| `heroSectionMinHeight` | `heroMax × 2.5` | ≈ 595px | 容纳双行 hero（lineHeight 1.0 = 2×heroMax）+ 上下装饰 + 副标题 |
| `ctaSectionMinHeight` | `max(400, width × 0.4)` | 432px | 二维码方块 200 + 标题 ~48 + 2 行辅助文字 ~80 + padding ~100 |
| `infoRowMinHeight` | `max(80, bodyMax × 1.7 × 2 + 24)` | 126px | 每行信息（如"活动时间" + "2026 年 1 月 18 日 18:00"）两行文本 |

**注入的四块约束**：

1. **Section 高度预算**：列出上述三个数字并提供剩余中间 section 空间公式，强制 LLM 不把 hero section 压在 heroSectionMinHeight 以下。
2. **Hero 堆叠与行距规则**：禁止 `lineHeight < 0.95` 和负 `marginTop`，强制相邻 hero 行 ≥ 16px 间隙。
3. **Content-fit 硬校验**：写完每个 section 必须手算内容总高度，必须 ≤ section 高度 × 0.95；若超出必须缩减元素或调整 section 高度，**禁止**用 `overflow-hidden` 或负 margin 掩盖溢出。
4. **Absolute 分离规则**：`absolute bottom-N` 装饰必须是 section 的直接子元素（不参与 flex 流），或 flex 容器必须 `padding-bottom ≥ (bottom 偏移 + 装饰高度) × 1.5`。

**为什么 v1/v2 约束不够**：v1 的字号预算只解决了"字号太小"，v2 的画面利用率只解决了"空白太多"。v3 解决的是"字号变大后内容装不下"——这是前两版产生的副作用，必须配套。现在三版合起来是一个闭环：字号预算决定字号 → section 高度预算决定 section 容器 → Content-fit 校验保证内容装得下。

**落地位置**：
- Java：[PosterGenerateService.computeTypographyBudget](../backend/src/main/java/com/seede/service/PosterGenerateService.java) 扩展三个字段；`buildEnrichedPrompt` 注入四块约束。
- Prompt：[poster-generate.md](../backend/src/main/resources/prompts/poster-generate.md) 新增 `### Content-fit 硬校验` 和 `### Absolute 装饰与 flow 内容的分离规则` 两个小节作为静态版本。

#### 自适应长图模式

**背景**：模板库中长图（1080×3688 等比例 ≥ 2.5）有 97 个模板，是第二大格式。长图内容量不固定，固定高度预设体验不佳，用户反馈"自适应效果更好"。

**方案**：前端 `SizeSelector` 新增"1080×自适应 长图"预设，`height=0` 作为哨兵值标识自适应模式。

**数据流**：

| 阶段 | 固定高度模式 | 自适应模式（height=0） |
|---|---|---|
| 前端 → 后端 | `{ width: 1080, height: 1920 }` | `{ width: 1080, height: 0 }` |
| 后端 prompt {{height}} | `"1920"` | `"自适应（由内容决定）"` |
| 格式分类 | `classifyCanvasFormat(w, h)` | 直接返回 `"长图"` |
| 字号预算 | 基于实际 h/w 比例选系数 | 使用参考高度 3688 → 长图系数 |
| Section 高度预算 | 注入固定 px 下限 + 总高度分配 | 仅注入最小高度建议，不注入总高度约束 |
| 区块分配 | `heightPercent × totalHeight / 100 = px` | 仅保留比例参考，不计算 px |
| LLM 生成 JSX 外层容器 | `style={{ width: '1080px', height: '1920px' }}` | `style={{ width: '1080px' }}`（不设 height） |
| 前端 hidden div | `height: 1920px` | 不设 height（auto） |
| 渲染后 | 直接使用 | 测量 `hiddenDiv.scrollHeight` 作为实际高度 |
| 画布尺寸 | `1080 × 1920` | `1080 × 实测值`（setPosterSize 回写 store） |

**模板 RAG**：`TemplateService.classifyFormat(w, 0)` 返回"长图"，匹配 97 个长图模板。

**尺寸预设来源**：基于模板库实际分布（竖版 163、长图 97、横版 2、方形通用），不再硬编码。

#### RAG 样本硬对齐策略（非"学习手法"）

之前 enriched prompt 对样本的引导语是"请学习其结构/Token/版式语汇...为当前需求创作一个风格相近但内容完全不同的全新海报"，这种措辞被 LLM 理解为"样本是 aspirational reference，按自己默认即可"，最终**字号和图片数量完全不会向样本对齐**。

现在改为"硬约束标杆 — 不是灵感来源，是强制最低基准"，明确 4 条硬对齐维度：

1. **字号体量**：主焦点 fontSize 必须 ≥ 样本骨架中出现的最大 fontSize 数值
2. **图片数量**：`<img>` 数量必须 ≥ 样本中的 `<img>` 数量
3. **内容密度**：每个区块的填充率 ≥ 样本对应区块
4. **整体结构**：样本的骨架（flex/absolute 混合、section 数量、Token 定义位置）是必选模板

允许差异的维度：具体文案（必须完全重写）、配色数值、图片 seed、装饰元素位置。禁止降级的维度：字号、图片数、密度、结构复杂度。

#### SSE 推送

```
code_chunk: "function Poster() {..." (流式)
code_chunk: "  const colors = {..." 
...
code_complete: <完整 JSX>   // 仅当 imageGenerateService.isEnabled() 为 true 时推送
```

### 4.6 阶段 4：图片生成（可选）

文件：[ImageGenerateService.java](../backend/src/main/java/com/seede/service/ImageGenerateService.java)

由 `image-generate.enabled` 控制。流程：

1. 解析 LLM 生成的 JSX，提取所有 `<img>` 标签
2. 对每个 `<img>` 读取 `prompt` 属性（LLM 在生成时为图片标注的英文描述）
3. 结合分析阶段的 `analysisImagesRef`（`{purpose, seed, description}`）增强语义
4. 调用火山方舟图片生成 API，把占位 URL 替换为真实生成图 URL

SSE 推送：

```
image_analyzing: "..."
image_generating: "{idx,total,prompt}"  // 多次
image_complete:   "{idx,url}"            // 多次
```

### 4.7 SSE 协议总览

文件：[SseMessage.java](../backend/src/main/java/com/seede/model/SseMessage.java)

```java
public static SseMessage thinking(String content)
public static SseMessage codeChunk(String content)
public static SseMessage complete(String content)
public static SseMessage codeComplete(String content)
public static SseMessage imageAnalyzing(String content)
public static SseMessage imageGenerating(String content)
public static SseMessage imageComplete(String content)
public static SseMessage searchStart(String content)
public static SseMessage searchComplete(String content)
public static SseMessage analysisChunk(String content)
public static SseMessage analysisComplete(String content)
public static SseMessage layoutComplete(String content)
public static SseMessage error(String content, boolean retryable)
```

事件序列（成功路径）：

```
[search_start → search_complete]?
thinking
analysis_chunk* → analysis_complete → layout_complete
code_chunk* → (code_complete | complete)
[image_analyzing → image_generating* → image_complete*]?
complete                                  // 仅在图片生成启用时单独推送
```

---

## 5. 后端：LLM 客户端层

### 5.1 SystemPromptManager

文件：[SystemPromptManager.java](../backend/src/main/java/com/seede/llm/SystemPromptManager.java)

- 从 classpath 加载 `prompts/*.md`
- 替换 `{{width}}`、`{{height}}` 等变量
- **白名单约束**：`ALLOWED_TEMPLATES = {poster-generate.md, poster-chat.md, poster-roll.md, ...}` 防注入
- 调用方式：`promptManager.loadPrompt("poster-generate.md", Map.of("width","1080","height","1920"))`

新增 prompt 模板时**必须**同步更新 `ALLOWED_TEMPLATES`。

### 5.2 LlmClient

文件：[LlmClient.java](../backend/src/main/java/com/seede/llm/LlmClient.java)

支持三种 provider，通过 `llm.provider` 配置切换：

| provider | 默认 URL | 协议 |
|---|---|---|
| `openai`（默认） | `https://open.bigmodel.cn/api/paas/v4/chat/completions` | OpenAI 兼容（智谱/DeepSeek 等） |
| `anthropic` | — | Claude 原生格式 |
| `openrouter` | `https://openrouter.ai/api/v1/chat/completions` | OpenRouter |

核心方法：

```java
Flux<String> streamChat(String systemPrompt, String userMessage)
Flux<String> streamChat(String systemPrompt, String userMessage, String modelNameOverride)
Flux<String> streamChatWithHistory(String systemPrompt, List<Map<String, String>> messages)
```

返回 `Flux<String>` 是原始 SSE 事件文本，需要 `LlmResponseParser` 进一步解析。

### 5.3 LlmResponseParser

文件：[LlmResponseParser.java](../backend/src/main/java/com/seede/llm/LlmResponseParser.java)

把 LLM 原始 SSE 流转换为 `SseMessage` 流：

```java
Flux<SseMessage> parseStream(Flux<String> rawStream)
Flux<SseMessage> parseStream(Flux<String> rawStream, boolean stripFences)
```

- 对 OpenAI 格式：解析 `choices[0].delta.content`
- 对 Anthropic 格式：解析 `content_block_delta.delta.text`
- `stripFences=true`：去除代码块标记 ```` ```jsx ```` 包裹
- `stripFences=false`：保留代码块（用于 analyze 阶段提取 ```json）

---

## 6. 后端：模板系统

数据准备见 [docs/design-data-analysis.md](./design-data-analysis.md)。

### 6.1 数据文件

| 文件 | 大小 | 用途 |
|---|---|---|
| `resources/all_items.json` | ~4MB | 325 模板的完整数据，含 sourceCode |
| `resources/template-metadata.json` | ~130KB | 290 个合格模板的轻量元数据索引 |
| `resources/template-presets.json` | ~20KB | 前端预设展示配置 |

### 6.2 TemplateService 完整接口

```java
public List<String> getCategories()                          // 15 个分类
public List<TemplateInfo> listByCategory(String cat, int n)  // 按分类筛选
public List<TemplateInfo> search(String keyword, int n)      // 关键词搜索
public List<TemplateInfo> recommend(int count)               // 随机推荐（top 50% 中抽）
public Optional<TemplateDetail> getDetail(String id)         // 获取完整详情
public List<TemplateDetail> recommendByHint(String cat, String emo, String fmt, int n)  // RAG 结构化检索
public List<TemplateDetail> recommendSimilar(String scene, String emo, int w, int h, int n)  // 兜底模糊检索
public boolean isAvailable()                                 // 数据是否加载成功
```

### 6.3 数据 DTO

[TemplateInfo.java](../backend/src/main/java/com/seede/model/dto/TemplateInfo.java)（轻量摘要）：

```java
String id, name, description, category, emotion;
int width, height, quality;
String[] colors;  // HEX 数组
```

[TemplateDetail.java](../backend/src/main/java/com/seede/model/dto/TemplateDetail.java)（继承 TemplateInfo）：

```java
String prompt;       // 原始生成提示词
String sourceCode;   // 完整 JSX 代码
```

### 6.4 REST 接口

文件：[TemplateController.java](../backend/src/main/java/com/seede/controller/TemplateController.java)

```
GET /api/templates?category=&keyword=&limit=20    → List<TemplateInfo>
GET /api/templates/categories                     → List<String>
GET /api/templates/recommend?count=8              → List<TemplateInfo>
GET /api/templates/{id}                           → TemplateDetail
```

---

## 7. 后端：其他服务

### 7.1 图片代理

文件：[ImageProxyController.java](../backend/src/main/java/com/seede/controller/ImageProxyController.java)

```
GET /api/proxy/image?url=<encoded>
```

绕过浏览器 CORS：前端引用 placehold.co / picsum.photos 占位图时，由后端转发请求并加 CORS 头。否则 fabric.js 在序列化画布到 Canvas 时会因为 tainted canvas 报错。

### 7.2 Web Search

文件：[WebSearchClient.java](../backend/src/main/java/com/seede/service/WebSearchClient.java)

- 讯飞 CBM 的 HMAC-SHA256 鉴权
- `result-limit` 默认 5 条
- `formatForPrompt(results)` 把结果序列化为 markdown 列表注入 LLM 上下文
- 失败降级为空结果，**不影响**主流程

### 7.3 Chat / Roll

| Service | 端点 | 用途 | Prompt |
|---|---|---|---|
| ChatOptimizeService | `POST /api/posters/chat` | 用户基于已有海报对话优化 | `poster-chat.md` |
| RollService | `POST /api/posters/roll` | 单元素重新生成 | `poster-roll.md` |

均使用 `streamChatWithHistory()`，前端通过 `useEditorStore.chatHistory` 传递对话上下文。

`role` 字段通过 `ALLOWED_ROLES = {"user", "assistant"}` 白名单过滤，**禁止注入 `system` 角色**。

---

## 8. 前端：DOM→Canvas 引擎

引擎与 features 层完全解耦，位于 [`frontend/src/engine/`](../frontend/src/engine/)。

### 8.1 完整流水线

```
LLM JSX 字符串
    │
    ▼ compileJsx() ← @babel/standalone
JS 字符串 (含 React 全局)
    │
    ▼ renderToHiddenDom()
new Function('React', code) → window.React 注入 → ReactDOM.createRoot → 隐藏 DOM
    │
    ▼ 等待图片加载（Promise.all img.onload，无图片则 200ms 固定延迟）
    │
    ▼ runGeometricAudit()  ← 几何审计（见 8.5）
AuditReport 写入 store：溢出 / 超框 / 字号过小 / 对比度不足
    │
    ▼ convertDomToCanvas()
getBoundingClientRect 坐标转换 → 递归 handler → fabric.js 对象
    │
    ▼
canvasRegistry.getGlobalCanvas().add(...)
```

### 8.2 文件清单

| 文件 | 职责 |
|---|---|
| [`engine/index.ts`](../frontend/src/engine/index.ts) | 入口 `convertDomToCanvas(dom, canvas)` |
| [`engine/handlers/groupHandler.ts`](../frontend/src/engine/handlers/groupHandler.ts) | 顶层调度，递归遍历 DOM 树 |
| [`engine/handlers/textHandler.ts`](../frontend/src/engine/handlers/textHandler.ts) | 文本节点 → fabric.Textbox；`createStyledTextObject` 处理混合字号/颜色段 |
| [`engine/handlers/imageHandler.ts`](../frontend/src/engine/handlers/imageHandler.ts) | `<img>` → fabric.Image |
| [`engine/handlers/shapeHandler.ts`](../frontend/src/engine/handlers/shapeHandler.ts) | div/背景色 → fabric.Rect |
| [`engine/parsers/styleParser.ts`](../frontend/src/engine/parsers/styleParser.ts) | computed style → fabric 属性 |
| [`engine/parsers/layoutParser.ts`](../frontend/src/engine/parsers/layoutParser.ts) | 坐标系转换 |
| [`engine/parsers/inlineTextParser.ts`](../frontend/src/engine/parsers/inlineTextParser.ts) | 识别并收集"内联文本容器"（TEXT_NODE + inline `<span>` 混排）|

**内联文本容器合并** — `groupHandler.ts` 在叶节点之后、常规容器之前插入了专门分支：
若元素的所有子节点都是 TEXT_NODE 或纯文本 inline 元素（`span`/`b`/`i`/`em`/`strong` 等），
且有 ≥2 个非空段，就通过 `collectInlineSegments` + `createStyledTextObject` 合并成单个
带 fabric per-character `styles` 的 Textbox。此前这类结构会丢失父节点直接文本
（`<p>全场<span>5折</span>起</p>` 只剩 "5折"），或让不同字号 `<span>` 独立定位
导致 `flex items-baseline` 基线对齐丢失（`<div><span>¥</span><span>50</span></div>`
的 ¥ 飘在数字上方像一个点）。合并后所有段在同一行上由 fabric 按最大字号驱动行高，
自动基线对齐。

### 8.3 关键约束（不可违反）

- **finally 块必须 `document.body.removeChild(hiddenDiv)`**，否则隐藏 DOM 泄漏
- **绝不能用 `eval()`** 编译后的 JSX，必须 `new Function('React', code)`
- **`canvasRegistry.ts` 是全局单例**，假设同时只有一个 canvas，不通过 props 传递
- 部分 `useEffect` 故意空依赖加 `eslint-disable`，**不要修改**
- **渲染失败必须清画布 + 报真实错误**：[CanvasPanel.tsx](../frontend/src/features/editor/components/CanvasPanel.tsx) 的 `runRender` catch 块必须先 `canvas.clear()`，再把真实 error message 透给 `setError`（格式：`渲染失败：<err.message>`）。LLM 偶发变量名 typo（如声明 `typography` 却写 `typographic`）会导致 `flushSync` 阶段抛 `ReferenceError`，若不清画布则上一次成功的 fabric 对象残留，用户会误判为"图片丢了"。错误条 UI 用 `title` tooltip 暴露完整信息。对应的预防在 `poster-generate.md` 守则 6「变量名严格一致性」硬约束。

### 8.5 几何审计（Geometric Audit）

JSX 路线主动放弃了**解码阶段的 schema 校验**（grammar-constrained decoding），
所以必须用"渲染后检测 + LLM 回注修复"的闭环兜底。几何审计是这个闭环的第一层。

位置：[`frontend/src/engine/audit/`](../frontend/src/engine/audit/)

| 文件 | 职责 |
| --- | --- |
| [`auditTypes.ts`](../frontend/src/engine/audit/auditTypes.ts) | `AuditIssue` / `AuditReport` / `AuditOptions` 类型定义 |
| [`auditHelpers.ts`](../frontend/src/engine/audit/auditHelpers.ts) | 纯函数工具：CSS 颜色解析、WCAG 对比度、bbox 溢出计算、alpha compositing |
| [`geometricAudit.ts`](../frontend/src/engine/audit/geometricAudit.ts) | 主审计函数 `runGeometricAudit(root, bounds, options?)` |
| [`auditFormatter.ts`](../frontend/src/engine/audit/auditFormatter.ts) | `formatIssuesForRepair()`（→ LLM prompt） / `formatIssuesForUi()`（→ Banner） |

**四条规则（按触发成本从低到高）：**

| 规则 | 触发条件 | 严重等级 | 修复提示 |
| --- | --- | --- | --- |
| `OUT_OF_BOUNDS` | 元素 bbox 超出画布边界 > 2px，且无 `overflow:hidden` 祖先裁切，且元素视觉显著（有背景/边框/阴影） | error | 调整位置或尺寸 |
| `TEXT_OVERFLOW` | 文本叶节点 `scrollWidth > clientWidth + 2` 或 `scrollHeight > clientHeight + 2` | error | 缩短文本 / 增大容器 / 降低字号 / `break-words` |
| `MIN_FONT_SIZE` | 文本叶节点 computed `font-size < 14px`（可配置） | warning | 提升字号 |
| `LOW_CONTRAST` | 文本与有效背景色 WCAG 对比度 < 4.5（AA 级） | warning | 调整配色 |
| `SIBLING_OVERLAP` | 同一容器内 in-flow 子元素 bbox 在垂直方向重叠 > 10px（跳过 `absolute`/`fixed` 装饰 + 尺寸 < 10px 的小元素） | error | 增大 section 高度 / 缩小内容 / 改用 `h-fit` |

**执行位置**：[`CanvasPanel.tsx`](../frontend/src/features/editor/components/CanvasPanel.tsx) 的
`runRender` 中，在 `renderToHiddenDom` + 图片 `onload` 等待完成后、`convertDomToCanvas`
之前调用。审计失败不抛异常（有 try/catch 保险丝），只写 `useEditorStore.auditReport`。

**UI 反馈**：[`AuditBanner.tsx`](../frontend/src/features/editor/components/AuditBanner.tsx)
是 CanvasPanel 右上角的浮层；当 `errorCount > 0` 时自动显示，可展开查看全部 issue，
提供"自动修复"按钮触发 [`useAuditRepair`](../frontend/src/features/generation/hooks/useAuditRepair.ts)。

**修复闭环**：`useAuditRepair.repair()` 把 `formatIssuesForRepair(auditReport)` 作为
`userMessage` 发给 `/api/posters/chat`，复用现有对话修改接口。LLM 返回的新 JSX
写回 `setGeneratedCode()` → CanvasPanel 自动重渲染 → 自动重审计。这形成了一个无需后端改动的
纯前端回路。

**设计取舍**：

- **只做高置信度规则** —— 没有检测元素重叠（布局意图不明容易误报），没有做 vision-model 判分（延迟 + 成本）
- **规则对 LLM 友好** —— issue.message 是可直接塞进 prompt 的中文修复指令，不是英文规则 ID
- **阈值全部可配** —— `AuditOptions` 允许针对不同画布尺寸调参
- **审计崩溃不阻塞渲染** —— 外层 try/catch 保障主流程不受影响

测试覆盖：[`__tests__/engine/auditHelpers.test.ts`](../frontend/src/__tests__/engine/auditHelpers.test.ts)
（纯函数 42 条断言）+ [`__tests__/engine/geometricAudit.test.ts`](../frontend/src/__tests__/engine/geometricAudit.test.ts)
（集成 11 条场景，用 `mockLayout` 打补丁模拟 jsdom 无布局引擎的环境）。

### 8.6 不支持的 CSS

DOM→Canvas 引擎从 computed style 提取属性，以下效果**会丢失**变成纯色块：

| CSS | 后果 | 替代方案 |
|---|---|---|
| `backdrop-blur` / `backdrop-filter` | 完全丢失 | 用更高透明度的纯色蒙版 |
| `filter: blur/brightness/contrast` | 不渲染 | 直接用更深的颜色 |
| `mix-blend-mode` | 不支持 | — |
| `clip-path` | 不支持 | 用 `border-radius` |

这些约束已写入 [poster-generate.md](../backend/src/main/resources/prompts/poster-generate.md) 让 LLM 避免。

---

## 9. 前端：状态管理与生成流程

### 9.1 Zustand stores

| Store | 文件 | 职责 |
|---|---|---|
| useEditorStore | [stores/useEditorStore.ts](../frontend/src/features/editor/stores/useEditorStore.ts) | 生成流程状态、画布选中对象、对话历史 |
| useCanvasCommands | hooks/ | 撤销/重做命令栈（独立 store） |

### 9.2 生成流程

文件：[`features/generation/hooks/useGenerate.ts`](../frontend/src/features/generation/hooks/useGenerate.ts)

```typescript
const { generate } = useGenerate();
await generate({ prompt, width, height, modelName });
```

内部：
1. POST `/api/posters/generate`，建立 SSE 连接
2. [`sseClient.ts`](../frontend/src/features/generation/services/sseClient.ts) 解析事件流
3. 按 `type` 分发到 `useEditorStore` 各个回调
4. `code_chunk` 累积到完整 JSX 字符串
5. `complete` 事件触发 `compileJsx → renderToHiddenDom → convertDomToCanvas`
6. 最终通过 `canvasRegistry.getGlobalCanvas().add(group)` 添加到画布

### 9.3 画布访问

```typescript
import { getGlobalCanvas } from '@/features/editor/canvasRegistry';

const canvas = getGlobalCanvas();
canvas.add(fabricObject);
```

**不**通过 props 传递 canvas。整个应用只有一个 canvas 实例。

---

## 10. Prompt 工程

### 10.1 文件清单

位于 [`backend/src/main/resources/prompts/`](../backend/src/main/resources/prompts/)：

| 文件 | 用途 | 行数 |
|---|---|---|
| `poster-analyze.md` | 需求分析阶段 system prompt | ~360 |
| `poster-generate.md` | 代码生成阶段 system prompt | ~610 |
| `poster-chat.md` | 对话优化阶段 system prompt | — |
| `poster-roll.md` | 单元素重生 system prompt | — |
| `image-prompt.md` | 图片描述生成（用于图片生成阶段） | ~60 |
| `design-reference.md` | 设计参考库（追加到 generate prompt） | ~240 |

### 10.2 poster-analyze.md 关键设计

- 第一部分：自然语言设计方案（流式输出给前端展示）
- 第二部分：```json 结构化数据（用于后续阶段）
- **新增** templateHint 字段（见 4.3 节），LLM 必须从固定词表精确选择
- 输出 `gene.style` 颜色用 HEX 值（不是 Tailwind 类名），便于代码直接引用

### 10.3 poster-generate.md 设计哲学

文件经历过 3 轮重大改造，当前版本核心理念：

1. **样本驱动 > 死规则**：检索到的真实样本骨架是最高权威，规则只是兜底
2. **主次分明 ≠ 字少**：海报可以有大段文字（文化展览、招聘等），但必须层级分明，焦点压倒一切
3. **格式分类**：长图（可 section 堆叠）/ 常规（推荐自由构图）/ 方形（极简中心）— 按样本格式判断，不要机械套用某一种结构
4. **保留的硬约束**（样本无法传达）：
   - Design Token 必须定义（colors + typography 对象）
   - 3 色系上限
   - DOM→Canvas 引擎的不支持 CSS 列表
   - Tailwind 类名白名单（safelist 已预编译）
   - 图片必须用 `<img>` 标签 + `prompt` 属性
   - 蒙版透明度 ≤40%

### 10.4 poster-generate.md 演进历史

| 版本 | 改动 | 原因 |
|---|---|---|
| 初版 | 完整死规则 + 12 个 landing-page 组件示例 | 海报像网页 |
| v2 | 守则 1+2 改"单焦点 + 自由构图" | 太武断 |
| v3 | 删 12 组件 + 加 8 个海报版式语汇 | 仍是规则驱动 |
| v4 | 加 RAG 样本注入 | 真实样本 > 规则 |
| v5 | 删 8 版式 + 删自由构图示例 + 软化守则 | 让样本自己教，规则只兜底 |
| v6（当前） | 守则 7 背景高级感 + 守则 8 圆角容器 + 场景适配组件库 + 场景→内容架构映射 | 与竞品差距分析驱动 |

每一版的删减都基于"这个规则能由样本传达吗"的判断。

### 10.5 v6 增强：设计质量对标竞品

**背景分析**：与竞品对比发现 5 个核心差距——内容丰富度不足、样式变化少、背景缺乏高级感、缺少圆角形状设计、不会根据场景选择合适布局。

**改动清单**：

| 文件 | 新增内容 | 解决的问题 |
|---|---|---|
| `poster-analyze.md` | 场景适配内容架构映射表（7 种场景 × 必选组件）| 内容空洞、场景不适配 |
| `poster-analyze.md` | 背景高级感规范（5 种手法 + 硬规则）| 纯色平铺背景 |
| `poster-analyze.md` | 圆角容器规范 | 直角容器缺乏现代感 |
| `poster-analyze.md` | 最低区块数提升（4/6/8）| 内容不够丰富 |
| `poster-generate.md` | 守则 7：背景高级感（代码级 4 种手法 + 反例）| 背景一眼廉价 |
| `poster-generate.md` | 守则 8：圆角容器系统（强制表 + 代码示例）| 直角容器 |
| `poster-generate.md` | 场景适配组件库（时间轴/路线卡/商品网格/数据展示/引用框）| 千篇一律的区块结构 |
| `poster-generate.md` | 负面提示 11-14 | 新增失败模式检测 |
| `design-reference.md` | 模式 6-9（背景/时间轴/路线卡/圆角系统）| 参考模式不足 |
| `technique-snippets.json` | 6 种新手法（径向辉光/深浅交替/时间轴/路线卡/暖白背景）| 手法库覆盖不全 |
| `TemplateService.java` | 双池策略（essential + highFreq）| 新手法 frequency=0 被过滤 |
| `PosterGenerateService.java` | 手法注入数从 6 提升到 8 | 增加关键手法覆盖率 |

---

## 11. 配置参考

### 11.1 必填环境变量

| 变量 | 说明 |
|---|---|
| `LLM_API_KEY` | 智谱 AI 密钥。**不允许设默认值**，启动时 fail-fast 校验 |

### 11.2 可选环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `LLM_PROVIDER` | `openai` | `openai` / `anthropic` / `openrouter` |
| `LLM_API_URL` | 智谱 endpoint | LLM API 地址 |
| `LLM_MODEL` | `glm-4.7` | 模型名称 |
| `LLM_MAX_TOKENS` | `8192` | 单次请求最大 tokens |
| `IMAGE_GENERATE_ENABLED` | `true` | 是否启用图片生成 |
| `IMAGE_GENERATE_API_KEY` | — | 火山方舟密钥 |
| `IMAGE_GENERATE_MODEL` | `doubao-seedream-4-0-250828` | 图片生成模型 |
| `WEB_SEARCH_ENABLED` | `false` | 是否启用联网搜索 |
| `WEB_SEARCH_APP_ID` / `KEY` / `SECRET` | — | 讯飞 CBM 鉴权 |
| `CORS_ALLOWED_ORIGIN_PATTERNS` | `http://localhost:5173,http://10.10.*:5173` | CORS 白名单（支持通配符） |

### 11.3 关键参数（代码内常量）

| 位置 | 常量 | 当前值 | 含义 |
|---|---|---|---|
| `PosterGenerateService` | `REFERENCE_SAMPLE_COUNT` | 2 | RAG 注入的样本数 |
| `PosterGenerateService` | `SAMPLE_SKELETON_MAX_CHARS` | 3500 | 单个样本截断到的字符数 |
| `TemplateService.classifyFormat` | 长图阈值 | h/w ≥ 2.5 | — |
| `TemplateService.classifyFormat` | 方形阈值 | h/w ≤ 1.3 | — |
| `WebSearchClient` | 关键词截断 | 20 字符 | — |

调整这些参数前请评估对 token 成本和检索质量的影响。

---

## 12. 安全考量

| 风险 | 缓解措施 | 实现位置 |
|---|---|---|
| LLM Prompt 注入 | `ALLOWED_TEMPLATES` 模板白名单 | SystemPromptManager |
| 角色注入 | `ALLOWED_ROLES = {"user","assistant"}` 白名单过滤 system 角色 | ChatOptimizeService |
| 任意 JSX 代码执行 | `new Function('React', code)` 隔离作用域，**禁用** `eval()` | jsxCompiler.ts |
| Canvas tainted | 后端图片代理转发 picsum/placehold.co | ImageProxyController |
| LLM_API_KEY 泄漏 | 启动 fail-fast 校验，**禁止**默认值 | LlmClient 构造 |
| CORS | 白名单匹配，支持通配符（同网段开发） | WebConfig |
| WebFlux 阻塞 | 全程响应式，**禁用** `block()` / `Thread.sleep()` | 整个 backend/ |

---

## 13. 复现指南指针

具体的从 0 到 1 复现步骤见 [implementation-guide.md](./implementation-guide.md)。

数据准备和质量评分见 [design-data-analysis.md](./design-data-analysis.md)。

工作流逆向分析的原始素材见 [workflow-analysis.md](./workflow-analysis.md)。

产品愿景与 Gene Logic 决策矩阵见 [product-optimization-analysis.md](./product-optimization-analysis.md)。

---

## 14. 未实现 / 待优化

> 这些不是 bug，是已知的当前架构边界。

1. **检索：仅按 templateHint 精确匹配**，没有 embedding 相似度。后续可以加 sentence-transformers 做语义检索。
2. **样本骨架：朴素截断**，没有 AST 解析。极少数样本可能在前 3500 字符里没完整 Token 定义。
3. **画布单例假设**：`canvasRegistry` 全局单例，多画布场景需要重构。
4. **图片生成串行**：`ImageGenerateService` 当前一张一张生成。可以改成并行（Reactor `flatMap` + 并发度限制）。
5. **Token 成本监控**：未统计每次请求实际消耗的 tokens。可以加 metrics（Micrometer + Prometheus）。
6. **模板更新流程**：`all_items.json` 静态加载，新增模板需要重启服务。
