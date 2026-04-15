package com.seede.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.seede.llm.LlmClient;
import com.seede.llm.LlmResponseParser;
import com.seede.llm.SystemPromptManager;
import com.seede.model.SseMessage;
import com.seede.model.dto.GenerateRequest;
import com.seede.model.dto.TemplateDetail;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 海报生成服务 — 多阶段工作流 Pipeline
 *
 * <p>生成流程（6 个阶段）：</p>
 * <ol>
 *   <li><b>联网搜索</b>（可选）— 搜索用户主题相关信息，注入后续 LLM 上下文<br/>
 *       SSE：search_start → search_complete</li>
 *   <li><b>需求分析</b> — 调用 LLM 分析用户需求，输出设计方案和元素列表<br/>
 *       SSE：thinking → analysis_chunk* → analysis_complete → layout_complete</li>
 *   <li><b>代码生成</b> — 基于设计方案调用 LLM 生成 React/Tailwind JSX<br/>
 *       SSE：code_chunk* → code_complete（含占位图）</li>
 *   <li><b>图片生成</b>（可选）— 为占位图生成真实图片并替换 URL<br/>
 *       SSE：image_analyzing → image_generating* → image_complete*</li>
 *   <li><b>设计合成</b> — 推送最终完整代码<br/>
 *       SSE：complete</li>
 * </ol>
 */
@Service
public class PosterGenerateService {

    private static final Logger log = LoggerFactory.getLogger(PosterGenerateService.class);

    /** 检索相似模板时返回的样本数量（注入到代码生成阶段作为 few-shot 参考） */
    private static final int REFERENCE_SAMPLE_COUNT = 2;

    /** 每个参考样本注入到 prompt 时的最大字符数，超出部分截断并加省略标记。
     *  取值依据：模板平均长度约 12000 字符，截到 3500 字符可以覆盖 Token 定义 + 前 1-2 个 JSX 区块，
     *  足以让 LLM 学习手法；2 条样本合计约 7KB，比注入完整代码节约约 70% 的 prompt tokens。*/
    private static final int SAMPLE_SKELETON_MAX_CHARS = 3500;

    private final LlmClient llmClient;
    private final LlmResponseParser responseParser;
    private final SystemPromptManager promptManager;
    private final ImageGenerateService imageGenerateService;
    private final WebSearchClient webSearchClient;
    private final TemplateService templateService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public PosterGenerateService(LlmClient llmClient,
                                 LlmResponseParser responseParser,
                                 SystemPromptManager promptManager,
                                 ImageGenerateService imageGenerateService,
                                 WebSearchClient webSearchClient,
                                 TemplateService templateService) {
        this.llmClient = llmClient;
        this.responseParser = responseParser;
        this.promptManager = promptManager;
        this.imageGenerateService = imageGenerateService;
        this.webSearchClient = webSearchClient;
        this.templateService = templateService;
    }

    /**
     * 执行多阶段海报生成流程，返回 SSE 事件流。
     *
     * @param request 包含设计 prompt 和画布尺寸的请求对象
     * @return SSE 事件流，按阶段顺序推送
     */
    public Flux<ServerSentEvent<SseMessage>> generate(GenerateRequest request) {
        log.info("收到生成请求: prompt={}, modelName={}", request.getPrompt(), request.getModelName());

        // ── 步骤 0：加载提示词模板 ──────────────────────────────────
        String analyzePrompt;
        String generatePrompt;
        try {
            Map<String, String> sizeVars = Map.of(
                    "width", String.valueOf(request.getWidth()),
                    "height", String.valueOf(request.getHeight())
            );
            analyzePrompt = promptManager.loadPrompt("poster-analyze.md", sizeVars);
            // 将设计参考库追加到生成 prompt 末尾，为 LLM 提供真实模板数据支撑
            String baseGeneratePrompt = promptManager.loadPrompt("poster-generate.md", sizeVars);
            String designReference = "";
            try {
                designReference = promptManager.loadPrompt("design-reference.md", Collections.emptyMap());
            } catch (Exception refErr) {
                log.warn("加载设计参考库失败，跳过: {}", refErr.getMessage());
            }
            generatePrompt = designReference.isEmpty()
                    ? baseGeneratePrompt
                    : baseGeneratePrompt + "\n\n" + designReference;
        } catch (Exception e) {
            log.error("加载 prompt 失败", e);
            return Flux.just(ServerSentEvent.<SseMessage>builder()
                    .data(SseMessage.error("系统配置错误", false)).build());
        }

        // ── 使用 AtomicReference 在阶段间传递数据 ────────────────────
        AtomicReference<List<WebSearchClient.SearchResult>> searchResultsRef =
                new AtomicReference<>(Collections.emptyList());
        AtomicReference<String> analysisRef = new AtomicReference<>("");
        AtomicReference<String> codeRef = new AtomicReference<>("");
        // 分析阶段提取的 images JSON 数组，传递给图片生成阶段以提供语义上下文
        AtomicReference<String> analysisImagesRef = new AtomicReference<>("");

        // ── 步骤 1：联网搜索（可选） ────────────────────────────────
        Flux<SseMessage> searchStream;
        log.info("联网搜索功能状态: enabled={}", webSearchClient.isEnabled());
        if (webSearchClient.isEnabled()) {
            searchStream = Flux.defer(() -> {
                String keywords = request.getPrompt();
                // 截取前 20 个字符作为搜索关键词
                if (keywords.length() > 20) {
                    keywords = keywords.substring(0, 20);
                }
                String searchKeywords = keywords;
                log.info("联网搜索阶段启动: 原始prompt长度={}, 搜索关键词={}", request.getPrompt().length(), searchKeywords);

                return Mono.just(SseMessage.searchStart(searchKeywords))
                        .flux()
                        .concatWith(
                                webSearchClient.search(searchKeywords)
                                        .flatMapMany(results -> {
                                            searchResultsRef.set(results);
                                            String resultsJson = webSearchClient.resultsToJson(results);
                                            log.info("联网搜索完成: 结果数={}", results.size());
                                            return Flux.just(SseMessage.searchComplete(resultsJson));
                                        })
                        )
                        .onErrorResume(e -> {
                            log.error("联网搜索阶段失败，跳过: {}", e.getMessage());
                            return Flux.just(SseMessage.searchComplete("[]"));
                        });
            });
        } else {
            log.info("联网搜索未启用，跳过搜索阶段");
            searchStream = Flux.empty();
        }

        // ── 步骤 2：thinking 事件 ──────────────────────────────────
        Flux<SseMessage> thinkingMsg = Flux.just(SseMessage.thinking("正在分析设计需求..."));

        // ── 步骤 3：需求分析阶段（第一次 LLM 调用） ─────────────────
        Flux<SseMessage> analysisStream = Flux.defer(() -> {
            // 将搜索结果注入分析 prompt 的用户消息
            String userPrompt = request.getPrompt();
            List<WebSearchClient.SearchResult> searchResults = searchResultsRef.get();
            if (!searchResults.isEmpty()) {
                String searchContext = WebSearchClient.formatForPrompt(searchResults);
                userPrompt = userPrompt + "\n\n" + searchContext;
                log.info("搜索结果已注入分析 prompt，参考资料 {} 条", searchResults.size());
            }

            return llmClient.streamChat(analyzePrompt, userPrompt, request.getModelName())
                    .doOnSubscribe(s -> log.info("开始需求分析 LLM 调用"))
                    .doOnComplete(() -> log.info("需求分析 LLM 流结束"))
                    .doOnError(e -> log.error("需求分析 LLM 流异常", e))
                    // 需求分析阶段不清理代码块标记，保留 ```json ... ``` 结构供元素列表解析
                    .transform(stream -> responseParser.parseStream(stream, false))
                    .concatMap(msg -> {
                        if ("code_chunk".equals(msg.getType())) {
                            return Flux.just(SseMessage.analysisChunk(msg.getContent()));
                        }
                        if ("complete".equals(msg.getType())) {
                            String analysisText = msg.getContent();
                            analysisRef.set(analysisText);
                            log.info("需求分析完成，分析文本长度: {} 字符", analysisText.length());

                            // 提取 images 数组，传递给图片生成阶段
                            String imagesJson = extractImagesFromAnalysis(analysisText);
                            analysisImagesRef.set(imagesJson);
                            log.info("提取分析阶段图片需求: {}", imagesJson);

                            String elementsJson = parseElementsFromAnalysis(analysisText);
                            log.info("解析出元素列表: {}", elementsJson);

                            return Flux.just(
                                    SseMessage.analysisComplete(analysisText),
                                    SseMessage.layoutComplete(elementsJson)
                            );
                        }
                        return Flux.just(msg);
                    })
                    .onErrorResume(e -> {
                        log.error("需求分析阶段失败", e);
                        return Flux.just(SseMessage.error("需求分析失败，请稍后重试", true));
                    });
        });

        // ── 步骤 4：代码生成阶段（第二次 LLM 调用） ─────────────────
        // 拼装 enriched prompt 时同步产出 rag_retrieving / rag_complete / prompt_built 三个事件，
        // 通过 Flux.concat 先 emit 这些可观测事件，再 emit LLM 流式输出。
        Flux<SseMessage> codeStream = Flux.defer(() -> {
            String analysisResult = analysisRef.get();
            if (analysisResult.isEmpty()) {
                log.warn("需求分析结果为空，直接使用原始 prompt 生成代码");
            }

            EnrichedPromptResult prepResult = buildEnrichedPrompt(
                    request.getPrompt(), analysisResult, request.getWidth(), request.getHeight());
            String enrichedPrompt = prepResult.prompt();
            log.info("开始代码生成 LLM 调用，enriched prompt 长度: {} 字符, 待发射事件数: {}",
                    enrichedPrompt.length(), prepResult.events().size());

            // 先发射 prep 阶段事件（rag_retrieving / rag_complete / prompt_built），再发射 LLM 流
            Flux<SseMessage> prepEvents = Flux.fromIterable(prepResult.events());

            Flux<SseMessage> llmStream = llmClient.streamChat(generatePrompt, enrichedPrompt, request.getModelName())
                    .doOnSubscribe(s -> log.info("代码生成 LLM 流开始"))
                    .doOnComplete(() -> log.info("代码生成 LLM 流结束"))
                    .doOnError(e -> log.error("代码生成 LLM 流异常", e))
                    .transform(responseParser::parseStream)
                    .map(msg -> {
                        if ("complete".equals(msg.getType())) {
                            codeRef.set(msg.getContent());
                            if (imageGenerateService.isEnabled()) {
                                return SseMessage.codeComplete(msg.getContent());
                            }
                            return msg;
                        }
                        return msg;
                    })
                    .onErrorResume(e -> {
                        log.error("代码生成阶段失败", e);
                        return Flux.just(SseMessage.error("代码生成失败，请稍后重试", true));
                    });

            return Flux.concat(prepEvents, llmStream);
        });

        // ── 步骤 5：图片生成阶段（仅在启用时执行） ─────────────────
        Flux<SseMessage> imageStream = Flux.defer(() -> {
            String code = codeRef.get();
            if (!imageGenerateService.isEnabled() || code.isEmpty()) {
                return Flux.empty();
            }
            log.info("代码生成完毕，开始图片生成阶段");
            return imageGenerateService.generateImagesForCode(
                    code, request.getPrompt(), analysisImagesRef.get());
        });

        // ── 步骤 6：拼接所有阶段 ──────────────────────────────────
        return Flux.concat(searchStream, thinkingMsg, analysisStream, codeStream, imageStream)
                .doFirst(() -> log.info("SSE 流开始推送"))
                .doOnNext(msg -> {
                    if ("error".equals(msg.getType())) {
                        log.error("SSE 推送错误事件: {}", msg.getContent());
                    }
                })
                .doOnComplete(() -> log.info("SSE 流推送完成"))
                .doOnError(e -> log.error("SSE 流异常终止: {}", e.getMessage()))
                .map(msg -> ServerSentEvent.<SseMessage>builder()
                        .data(msg)
                        .build());
    }

    /**
     * 构建过程的产物：含拼装好的 prompt 字符串和需要推送给前端的 SSE 事件列表。
     * <p>事件包含：rag_retrieving / rag_complete / prompt_built，让前端 AI 工作流面板
     * 能完整看到 RAG 检索条件、检索结果和 enriched prompt 的统计信息。</p>
     */
    private record EnrichedPromptResult(String prompt, List<SseMessage> events) {}

    /**
     * 构建注入了分析结果的增强用户提示词，并产出对应的可观测事件。
     * <p>包含 5 个注入块：设计基因参数、区块高度、图片 seed、相似模板参考（RAG）、完整分析文本。</p>
     * <p>同时发射 3 个事件：</p>
     * <ul>
     *   <li>rag_retrieving — RAG 检索条件（templateHint 或兜底标记）</li>
     *   <li>rag_complete — 检索到的样本元数据 + 骨架代码</li>
     *   <li>prompt_built — enriched prompt 拼装统计 + 完整内容</li>
     * </ul>
     */
    private EnrichedPromptResult buildEnrichedPrompt(String originalPrompt, String analysisResult, int width, int totalHeight) {
        if (analysisResult == null || analysisResult.isBlank()) {
            return new EnrichedPromptResult(originalPrompt, Collections.emptyList());
        }

        // 收集要推送给前端的事件
        List<SseMessage> events = new ArrayList<>();
        // 统计字段，最终用于 prompt_built 事件
        int sectionsCount = 0;
        int imagesCount = 0;
        List<String> geneStyleKeys = new ArrayList<>();
        int sampleTotalChars = 0;

        StringBuilder sb = new StringBuilder(originalPrompt);
        sb.append("\n\n");
        sb.append("══════════════════════════════════════════\n");
        sb.append("【强制执行】以下设计方案由需求分析阶段确定，你必须严格遵循，不可自行修改。\n");
        sb.append("══════════════════════════════════════════\n\n");

        // 用于 RAG 检索的场景和情绪字段（gene.scene 和 gene.emotion 是兜底，优先用 templateHint）
        String scene = "";
        String emotion = "";
        // 结构化路由字段（LLM 从固定词表选出，优先用于检索）
        String hintCategory = "";
        String hintEmotion = "";
        String hintFormat = "";

        String structuredJson = extractJsonBlock(analysisResult);
        if (structuredJson != null) {
            try {
                JsonNode root = objectMapper.readTree(structuredJson);

                // 提取 templateHint（RAG 结构化路由，比 gene.scene 更可控）
                JsonNode templateHint = root.path("templateHint");
                if (!templateHint.isMissingNode()) {
                    hintCategory = templateHint.path("category").asText("");
                    hintEmotion = templateHint.path("emotion").asText("");
                    hintFormat = templateHint.path("format").asText("");
                    log.info("解析 templateHint: category={}, emotion={}, format={}",
                            hintCategory, hintEmotion, hintFormat);
                }

                // 提取设计基因参数（gene），约束代码生成阶段的风格一致性
                JsonNode gene = root.path("gene");
                if (!gene.isMissingNode()) {
                    scene = gene.path("scene").asText("");
                    emotion = gene.path("emotion").asText("");
                    sb.append("【设计基因参数（必须严格遵循）】\n");
                    if (!scene.isEmpty()) {
                        sb.append("- 场景类型：").append(scene).append("\n");
                    }
                    if (!emotion.isEmpty()) {
                        sb.append("- 目标情绪：").append(emotion).append("\n");
                    }
                    JsonNode style = gene.path("style");
                    if (!style.isMissingNode()) {
                        // 收集所有非空 style key，用于 prompt_built 事件统计
                        String[] styleFields = {
                                "primaryColor", "accentColor", "bgColor", "textColor",
                                "textMutedColor", "borderColor", "cornerRadius", "shadowLevel", "tracking"
                        };
                        for (String key : styleFields) {
                            if (!style.path(key).asText("").isEmpty()) {
                                geneStyleKeys.add(key);
                            }
                        }
                        appendIfPresent(sb, "主色(HEX)", style.path("primaryColor"));
                        appendIfPresent(sb, "强调色(HEX)", style.path("accentColor"));
                        appendIfPresent(sb, "背景色(HEX)", style.path("bgColor"));
                        appendIfPresent(sb, "文字色(HEX)", style.path("textColor"));
                        appendIfPresent(sb, "弱化文字色", style.path("textMutedColor"));
                        appendIfPresent(sb, "边框色", style.path("borderColor"));
                        appendIfPresent(sb, "统一圆角", style.path("cornerRadius"));
                        appendIfPresent(sb, "统一阴影", style.path("shadowLevel"));
                        appendIfPresent(sb, "字间距", style.path("tracking"));
                    }

                    // 提取推荐字体组合
                    JsonNode fonts = gene.path("fonts");
                    if (!fonts.isMissingNode()) {
                        sb.append("- 推荐字体：");
                        appendIfPresent(sb, "标题", fonts.path("title"));
                        appendIfPresent(sb, "正文", fonts.path("body"));
                        appendIfPresent(sb, "数字", fonts.path("numeric"));
                    }
                    sb.append("\n");
                }

                // 提取区块高度分配，包含密度和焦点信息
                JsonNode sections = root.path("sections");
                if (sections.isArray() && !sections.isEmpty()) {
                    sectionsCount = sections.size();
                    sb.append("【区块高度分配（必须严格遵循）】\n");
                    for (JsonNode section : sections) {
                        String name = section.path("name").asText("未命名");
                        int percent = section.path("heightPercent").asInt(0);
                        String bg = section.path("background").asText("");
                        int height = (int) Math.round(totalHeight * percent / 100.0);
                        String density = section.path("density").asText("");
                        String focalPoint = section.path("focalPoint").asText("");
                        StringBuilder line = new StringBuilder();
                        line.append(String.format("- %s：高度 %dpx（%d%%），背景 %s", name, height, percent, bg));
                        if (!density.isEmpty()) {
                            line.append("，密度=").append(density);
                        }
                        if (!focalPoint.isEmpty()) {
                            line.append("，焦点=").append(focalPoint);
                        }
                        sb.append(line).append("\n");
                    }
                    sb.append("\n");
                }

                // 提取图片 seed 关键词
                JsonNode images = root.path("images");
                if (images.isArray() && !images.isEmpty()) {
                    imagesCount = images.size();
                    sb.append("【图片映射清单（必须保留 imageId 并使用对应 seed）】\n");
                    int imageOrder = 1;
                    for (JsonNode img : images) {
                        String imageId = img.path("imageId").asText("");
                        if (imageId.isEmpty()) {
                            imageId = "img-" + imageOrder;
                        }
                        String purpose = img.path("purpose").asText("");
                        String seed = img.path("seed").asText("");
                        int w = img.path("width").asInt(800);
                        int h = img.path("height").asInt(600);
                        sb.append(String.format("- imageId=\"%s\"，%s：seed=\"%s\"，尺寸 %dx%d\n",
                                imageId, purpose, seed, w, h));
                        imageOrder++;
                    }
                    sb.append("\n");
                }
            } catch (Exception e) {
                log.warn("[PosterGenerate] 解析结构化 JSON 失败，回退为原文注入: {}", e.getMessage());
            }
        }

        // ── 字号预算 + 画面利用率硬约束（基于画布尺寸确定性计算，不依赖 LLM 输出） ──
        // 焦点字号偏小、画面利用率低是之前 LLM 生成的两个主要问题，根因是：
        //   (1) prompt 中 fontSize 指引是相对值（text-7xl~9xl），LLM 取下限 72px；
        //   (2) flex justify-center 让少量内容浮在 section 中间造成大片空白。
        // 这里直接注入基于画布宽度计算的 px 级硬范围，让 LLM 无法回落到默认值。
        TypographyBudget budget = computeTypographyBudget(width, totalHeight);
        String canvasFormat = classifyCanvasFormat(width, totalHeight);
        double heroBodyRatio = Math.max(5.0, (double) budget.heroMin / Math.max(1, budget.bodyMax));
        sb.append("【字号预算（必须严格遵循 — 基于画布 ").append(width).append("×").append(totalHeight)
                .append(" ").append(canvasFormat).append(" 计算）】\n");
        sb.append(String.format("- 主焦点 hero（巨型主标题 / 核心数字 / slogan）：fontSize 必须在 **%dpx ~ %dpx** 区间内%n",
                budget.heroMin, budget.heroMax));
        sb.append(String.format("- 副标题 subtitle：fontSize 必须在 **%dpx ~ %dpx** 区间内%n",
                budget.subtitleMin, budget.subtitleMax));
        sb.append(String.format("- 区块标题 sectionTitle：fontSize 必须在 **%dpx ~ %dpx** 区间内%n",
                budget.sectionTitleMin, budget.sectionTitleMax));
        sb.append(String.format("- 正文 body：fontSize 必须在 **%dpx ~ %dpx** 区间内%n",
                budget.bodyMin, budget.bodyMax));
        sb.append(String.format("- 说明文字 caption：fontSize 必须在 **%dpx ~ %dpx** 区间内%n",
                budget.captionMin, budget.captionMax));
        sb.append(String.format("- 焦点/正文字号比例必须 ≥ %.1f 倍（守则 1 要求）%n", heroBodyRatio));
        sb.append("- **禁止**使用 Tailwind 的 text-7xl / text-8xl / text-9xl 承担主焦点角色（它们最大仅 128px，在本画布上远低于 hero 下限）\n");
        sb.append("- 所有字号必须通过 inline style 显式写出具体 px 数字，例如：`style={{ ...typography.h1, fontSize: '")
                .append((budget.heroMin + budget.heroMax) / 2).append("px' }}`\n\n");

        sb.append("【画面利用率约束（防止大片空白 — 这是之前生成的常见缺陷）】\n");
        sb.append("- 每个 section 的内部 padding（py-* 上下之和）不得超过该 section 高度的 15%\n");
        sb.append("- 每个 section 内部的内容必须填充至少 75% 的可用高度\n");
        sb.append("- **禁止**使用 `flex items-center justify-center` 把少量内容浮在 section 正中央导致上下大片空白\n");
        sb.append("- 如果发现某 section 的内容不足以填充 75% 高度，必须：(a) 放大 hero 字号到预算上限；(b) 增加真实的辅助图片或装饰元素；(c) 合并到相邻 section\n");
        sb.append("- 整张海报非背景元素的内容填充率必须 ≥ 画布面积的 60%\n\n");

        // ── Section 高度预算（字号预算被放大后暴露的新失效模式：内容溢出、板式相互覆盖） ──
        // 根因：LLM 按旧习惯写 section 高度（如头部 730px），但字号预算把 hero 推到 200+px，
        //      加上堆叠的 2026 + 主标题 + 副标题 + 装饰元素，内容总高度超过 section 高度，
        //      导致后续 section 被覆盖、absolute 装饰被 flow 内容压住等位置错乱问题。
        // 解决方案：给 LLM 一组基于字号预算反推的 section 最小高度硬下限 + 强制 content-fit 自检。
        int heroPlusCtaMin = budget.heroSectionMinHeight + budget.ctaSectionMinHeight;
        int remainingForMiddle = Math.max(200, totalHeight - heroPlusCtaMin);
        sb.append("【Section 高度预算（基于字号预算反推 — 防止内容溢出和板式覆盖）】\n");
        sb.append(String.format("- 含 hero 主标题的主视觉 section（通常是第一个 section）：**最小高度 ≥ %dpx**（= heroMax × 2.5，覆盖双行 hero + 副标题 + 上下装饰）%n",
                budget.heroSectionMinHeight));
        sb.append(String.format("- CTA section（含二维码 / 按钮 / 联系方式）：**最小高度 ≥ %dpx**（二维码方块 200 + 标题 + 2 行辅助文字 + padding）%n",
                budget.ctaSectionMinHeight));
        sb.append(String.format("- 信息型 section 的每行信息（时间 / 地点 / 规则 / 嘉宾等）：**每行高度 ≥ %dpx**，N 行信息 section 最小高度 = N × %d + 160 (section title + padding)%n",
                budget.infoRowMinHeight, budget.infoRowMinHeight));
        sb.append(String.format("- 卡片型 section（精彩预告 / 特性卡片 / 节目单）：卡片图片高度 ≥ 180px，加卡片文字区 120px 和 section 标题 120px，**最小高度 ≥ 420px**%n"));
        sb.append(String.format("- 画布总高度 %dpx 中，扣除 hero section %dpx 和 CTA section %dpx 后剩余 **%dpx** 用于中间 section（信息 + 卡片等）%n",
                totalHeight, budget.heroSectionMinHeight, budget.ctaSectionMinHeight, remainingForMiddle));
        sb.append("- 如果 section 高度之和超过画布高度，必须缩减中间 section 的行数 / 卡片数 / 装饰元素，而不是挤压 hero section\n\n");

        sb.append("【Hero 堆叠与行距规则（禁止压缩 trick — 会直接造成文字覆盖）】\n");
        sb.append("- 堆叠的 hero 行（如 `2026` + `年度盛典`）`lineHeight` 必须 ≥ **0.95**，严禁 0.85 / 0.8 / 0.9\n");
        sb.append("- **禁止**用负值 marginTop（如 `marginTop: '-30px'`）挤压相邻 hero 行距 — 这会让行框视觉重叠\n");
        sb.append("- 两行 hero 之间的空隙必须通过正 margin 或 gap 表达（≥ 16px）\n");
        sb.append("- 副标题（如 `ANNUAL GALA`、`诚邀您的参与`）与 hero 之间的间距 ≥ 24px，不得贴着 hero 底部\n");
        sb.append("- 正文和 caption 的 `lineHeight` 必须 ≥ 1.3，避免中文字符上下粘连\n\n");

        sb.append("【Content-fit 硬校验（写完每个 section 必做 — 本轮最重要的失败自检）】\n");
        sb.append("写完每个 section 的 JSX 后，**立即手算**该 section 的内部内容总高度：\n");
        sb.append("  内部高度 = pt-* + 所有子元素的 bounding box 高度之和 + 所有 gap / space-y-* / margin + pb-*\n");
        sb.append("其中每个子元素的高度估算：\n");
        sb.append("  - 文字元素高度 ≈ fontSize × lineHeight × 行数（默认 lineHeight 取 1.3）\n");
        sb.append("  - 图片 / svg / 装饰方块 = 其显式设定的 h-* 或 height\n");
        sb.append("  - 卡片容器 = 内部所有子元素之和 + padding\n");
        sb.append("**硬约束：内部内容总高度必须 ≤ section 高度 × 0.95**（留 5% 余量防止估算误差导致边界溢出）\n");
        sb.append("如果超出，必须修正：(a) 放大 section 高度（相应缩减兄弟 section）；(b) 减少子元素数量；(c) 把字号向区间下限调整（但不得低于预算下限）。\n");
        sb.append("**不得**用 `overflow-hidden` 或负 margin 掩盖溢出 — 这不是修正，是把 bug 藏起来。\n\n");

        sb.append("【Absolute 定位与 flow 内容的分离规则（防止装饰元素覆盖正文）】\n");
        sb.append("- 如果某元素用 `absolute` 定位到 section 底部（如 `absolute bottom-10`），它必须是 **section 的直接子元素**，不得放在同一 flex 容器内部\n");
        sb.append("- 等价写法：section 根 div 下直接放 absolute 装饰 + 另一个 flex 容器（relative z-10）承载 flow content\n");
        sb.append("- 如果必须放在 flex 容器内部，flex 容器必须 **padding-bottom ≥ (bottom 偏移 + 装饰高度 × 1.5)**，给 flow 内容留出避让空间\n");
        sb.append("- 反例：`<div className=\"flex flex-col pt-12\">... flow 内容 ...<div className=\"absolute bottom-10\">装饰</div></div>` — flow 内容会撞上底部装饰\n");
        sb.append("- 正例：`<section><div className=\"absolute bottom-10 z-20\">装饰</div><div className=\"relative z-10 flex flex-col pt-12 pb-28\">... flow 内容 ...</div></section>`\n\n");

        // ── RAG：按 templateHint 结构化检索，失败时退化为 gene.scene/emotion 模糊检索 ──
        // 同时推送 rag_retrieving / rag_complete 事件给前端，让 AI 工作流面板可见整个 RAG 过程
        if (templateService.isAvailable()) {
            boolean useFallback = hintCategory.isEmpty() && hintEmotion.isEmpty() && hintFormat.isEmpty();

            // 推送 rag_retrieving 事件：检索条件
            try {
                ObjectNode retrievingPayload = objectMapper.createObjectNode();
                retrievingPayload.put("category", hintCategory);
                retrievingPayload.put("emotion", hintEmotion);
                retrievingPayload.put("format", hintFormat);
                retrievingPayload.put("fallback", useFallback);
                retrievingPayload.put("fallbackScene", useFallback ? scene : "");
                retrievingPayload.put("fallbackEmotion", useFallback ? emotion : "");
                events.add(SseMessage.ragRetrieving(objectMapper.writeValueAsString(retrievingPayload)));
            } catch (Exception e) {
                log.warn("构造 rag_retrieving 事件失败: {}", e.getMessage());
            }

            try {
                List<TemplateDetail> samples;
                if (!useFallback) {
                    samples = templateService.recommendByHint(
                            hintCategory, hintEmotion, hintFormat, REFERENCE_SAMPLE_COUNT);
                } else {
                    log.info("templateHint 为空，退化为 scene/emotion 模糊检索");
                    samples = templateService.recommendSimilar(
                            scene, emotion, width, totalHeight, REFERENCE_SAMPLE_COUNT);
                }

                // 构造 rag_complete 事件 payload（即使为空也推送，让前端知道检索完成）
                ArrayNode samplesArr = objectMapper.createArrayNode();

                if (!samples.isEmpty()) {
                    sb.append("【参考样本（硬约束标杆 — 不是灵感来源，是强制最低基准）】\n");
                    sb.append("以下是从 290+ 模板库按 (category / emotion / format) 精确检索出的 ").append(samples.size())
                            .append(" 个同类高质量样本，每个已截断为前 ").append(SAMPLE_SKELETON_MAX_CHARS)
                            .append(" 字符的代码骨架（包含 Token 定义和前 1-2 个 JSX 区块）。你必须在以下维度与样本**硬对齐**：\n")
                            .append("  1. **字号体量**：你输出的主焦点 fontSize 必须 ≥ 样本 Token 定义或首个区块中出现的最大 fontSize 数值。请扫描样本中所有 `fontSize:` 或 `text-\\dxl` 的值，取最大的那个作为你 hero 字号的下限，不得低于它。\n")
                            .append("  2. **图片数量**：你使用的 `<img>` 标签数量必须 ≥ 样本中的 `<img>` 标签数量。如果样本有 5 张图，你不能只放 2 张，更不能用 emoji 或纯色块代替。\n")
                            .append("  3. **内容密度**：样本每个区块的内容填充率（文字 + 图片面积 vs 空白）是你的下限，不能比样本更稀疏；样本有的卡片/列表/时间轴结构，你也要有。\n")
                            .append("  4. **整体结构**：样本的骨架（flex 堆叠 / absolute 自由构图混合模式、section 数量、Token 定义位置）是你的必选模板。\n")
                            .append("**允许差异的维度**：具体文案（必须完全重写，不得复制样本文字）、配色数值（按 gene.style 调整）、图片 seed 关键词、装饰元素具体位置。\n")
                            .append("**禁止降级的维度**：字号体量、图片数量、内容密度、结构复杂度。宁可超出样本，也不能低于样本。\n\n");
                    for (int i = 0; i < samples.size(); i++) {
                        TemplateDetail sample = samples.get(i);
                        String fullSource = sample.getSourceCode() == null ? "" : sample.getSourceCode();
                        String skeleton = extractSampleSkeleton(fullSource, SAMPLE_SKELETON_MAX_CHARS);
                        sampleTotalChars += skeleton.length();
                        sb.append("──── 参考样本 ").append(i + 1).append(" ────\n");
                        sb.append("名称：").append(sample.getName()).append("\n");
                        if (sample.getCategory() != null) {
                            sb.append("分类：").append(sample.getCategory()).append("\n");
                        }
                        if (sample.getEmotion() != null) {
                            sb.append("情绪：").append(sample.getEmotion()).append("\n");
                        }
                        sb.append("尺寸：").append(sample.getWidth()).append("x").append(sample.getHeight()).append("\n");
                        sb.append("代码骨架：\n");
                        sb.append("```jsx\n");
                        sb.append(skeleton);
                        sb.append("\n```\n\n");

                        // 把样本元数据和完整骨架放入 SSE 事件 payload，供前端展开查看
                        ObjectNode sampleNode = objectMapper.createObjectNode();
                        sampleNode.put("id", sample.getId());
                        sampleNode.put("name", sample.getName());
                        sampleNode.put("category", sample.getCategory());
                        sampleNode.put("emotion", sample.getEmotion());
                        sampleNode.put("width", sample.getWidth());
                        sampleNode.put("height", sample.getHeight());
                        sampleNode.put("originalChars", fullSource.length());
                        sampleNode.put("skeletonChars", skeleton.length());
                        sampleNode.put("skeleton", skeleton);
                        samplesArr.add(sampleNode);
                    }
                    log.info("已注入 {} 条参考样本骨架到生成 prompt, 样本总字符数={}",
                            samples.size(), sampleTotalChars);
                }

                // 推送 rag_complete 事件
                try {
                    ObjectNode ragPayload = objectMapper.createObjectNode();
                    ragPayload.set("samples", samplesArr);
                    ragPayload.put("totalSampleChars", sampleTotalChars);
                    events.add(SseMessage.ragComplete(objectMapper.writeValueAsString(ragPayload)));
                } catch (Exception e) {
                    log.warn("构造 rag_complete 事件失败: {}", e.getMessage());
                }
            } catch (Exception e) {
                log.warn("注入参考样本失败，跳过: {}", e.getMessage());
                // 失败时仍推送一个空的 rag_complete，让前端 stage 不卡在 active
                try {
                    ObjectNode ragPayload = objectMapper.createObjectNode();
                    ragPayload.set("samples", objectMapper.createArrayNode());
                    ragPayload.put("totalSampleChars", 0);
                    ragPayload.put("error", e.getMessage());
                    events.add(SseMessage.ragComplete(objectMapper.writeValueAsString(ragPayload)));
                } catch (Exception ignore) { /* fallthrough */ }
            }
        }

        sb.append("【完整设计方案】\n");
        sb.append(analysisResult);

        String finalPrompt = sb.toString();

        // 推送 prompt_built 事件：含统计信息和完整 enriched prompt
        try {
            ObjectNode builtPayload = objectMapper.createObjectNode();
            builtPayload.put("totalChars", finalPrompt.length());
            builtPayload.put("originalPromptChars", originalPrompt.length());
            builtPayload.put("sampleTotalChars", sampleTotalChars);
            builtPayload.put("sectionsCount", sectionsCount);
            builtPayload.put("imagesCount", imagesCount);
            ArrayNode keysArr = objectMapper.createArrayNode();
            for (String k : geneStyleKeys) keysArr.add(k);
            builtPayload.set("geneStyleKeys", keysArr);
            builtPayload.put("fullPrompt", finalPrompt);
            events.add(SseMessage.promptBuilt(objectMapper.writeValueAsString(builtPayload)));
        } catch (Exception e) {
            log.warn("构造 prompt_built 事件失败: {}", e.getMessage());
        }

        return new EnrichedPromptResult(finalPrompt, events);
    }

    /**
     * 从模板 sourceCode 中提取"骨架"片段，用作 few-shot 参考。
     *
     * <p>策略：取前 {@code maxChars} 个字符后，回溯到最后一个换行符处截断，
     * 再追加省略标记。这样可以保证：</p>
     * <ul>
     *   <li>函数开头和 const colors/typography Token 定义完整保留（位于代码最前端）</li>
     *   <li>return 语句及前 1-2 个顶层 JSX 区块可见，足以传达结构手法</li>
     *   <li>截断发生在行边界，避免切断字符串/属性导致 LLM 误学</li>
     * </ul>
     *
     * @param sourceCode 原始模板代码
     * @param maxChars   保留的最大字符数（建议 3000~4000）
     * @return 截断后的骨架代码，末尾带省略提示
     */
    private String extractSampleSkeleton(String sourceCode, int maxChars) {
        if (sourceCode == null || sourceCode.isEmpty()) {
            return "";
        }
        if (sourceCode.length() <= maxChars) {
            return sourceCode;
        }

        String head = sourceCode.substring(0, maxChars);
        // 回溯到最后一个换行符，避免切断行内结构
        int lastNewline = head.lastIndexOf('\n');
        if (lastNewline > maxChars / 2) {
            head = head.substring(0, lastNewline);
        }
        return head + "\n      {/* ... 以下为样本代码的后续区块，为控制 prompt 长度已省略。"
                + "请从上面的 Token 定义和首个区块结构中理解手法 ... */}";
    }

    /**
     * 辅助方法：如果 JsonNode 有值则追加到 StringBuilder。
     */
    private void appendIfPresent(StringBuilder sb, String label, JsonNode node) {
        if (!node.isMissingNode() && !node.asText("").isEmpty()) {
            sb.append("- ").append(label).append("：").append(node.asText()).append("\n");
        }
    }

    /**
     * 从分析文本中提取 ```json ... ``` 代码块内容。
     */
    private String extractJsonBlock(String text) {
        int start = text.indexOf("```json");
        if (start < 0) return null;

        int contentStart = text.indexOf("\n", start);
        if (contentStart < 0) return null;
        contentStart += 1;

        int end = text.indexOf("```", contentStart);
        if (end <= contentStart) return null;

        return text.substring(contentStart, end).trim();
    }

    /**
     * 从分析文本的结构化 JSON 中提取 images 数组。
     * 返回 JSON 数组字符串（如 [{"purpose":"...","seed":"...","description":"..."}]），
     * 传递给图片生成阶段以提供精确的语义上下文。
     */
    private String extractImagesFromAnalysis(String analysisText) {
        try {
            String jsonBlock = extractJsonBlock(analysisText);
            if (jsonBlock != null) {
                JsonNode root = objectMapper.readTree(jsonBlock);
                JsonNode images = root.path("images");
                if (images.isArray() && !images.isEmpty()) {
                    ArrayNode normalized = objectMapper.createArrayNode();
                    int i = 1;
                    for (JsonNode img : images) {
                        ObjectNode node = img.isObject()
                                ? (ObjectNode) img.deepCopy()
                                : objectMapper.createObjectNode();
                        if (node.path("imageId").asText("").isEmpty()) {
                            node.put("imageId", "img-" + i);
                        }
                        normalized.add(node);
                        i++;
                    }
                    return objectMapper.writeValueAsString(normalized);
                }
            }
        } catch (Exception e) {
            log.warn("提取分析阶段 images 数组失败: {}", e.getMessage());
        }
        return "[]";
    }

    /**
     * 从分析文本中解析页面元素列表 JSON。
     */
    private String parseElementsFromAnalysis(String analysisText) {
        try {
            String jsonBlock = extractJsonBlock(analysisText);
            log.info("从分析文本中提取 JSON 块: {}", jsonBlock != null ? "成功（" + jsonBlock.length() + " 字符）" : "未找到 ```json 代码块");
            if (jsonBlock != null) {
                log.debug("JSON 块前 500 字符: {}", jsonBlock.substring(0, Math.min(500, jsonBlock.length())));
                JsonNode node = objectMapper.readTree(jsonBlock);
                if (node.has("elements")) {
                    log.debug("从 ```json 代码块中成功解析元素列表");
                    // 仅返回 elements 部分
                    return objectMapper.writeValueAsString(
                            objectMapper.createObjectNode().set("elements", node.get("elements")));
                }
            }

            // 回退：查找裸 JSON
            int braceStart = analysisText.lastIndexOf("{\"elements\"");
            if (braceStart < 0) {
                braceStart = analysisText.lastIndexOf("{ \"elements\"");
            }
            if (braceStart >= 0) {
                int depth = 0;
                for (int i = braceStart; i < analysisText.length(); i++) {
                    char c = analysisText.charAt(i);
                    if (c == '{') depth++;
                    else if (c == '}') {
                        depth--;
                        if (depth == 0) {
                            String json = analysisText.substring(braceStart, i + 1);
                            JsonNode node = objectMapper.readTree(json);
                            if (node.has("elements")) {
                                log.debug("从文本中成功解析 elements JSON 对象");
                                return json;
                            }
                            break;
                        }
                    }
                }
            }

            log.warn("无法从分析结果中解析元素列表，返回空数组");
            return "{\"elements\":[]}";
        } catch (Exception e) {
            log.error("解析分析结果中的元素列表失败: {}", e.getMessage());
            return "{\"elements\":[]}";
        }
    }

    // ═══════════════════════════════════════════════════════════════
    // 字号预算（基于画布尺寸确定性推导，消除 LLM 对 fontSize 默认值的依赖）
    // ═══════════════════════════════════════════════════════════════

    /**
     * 字号预算值对象（所有单位均为 px）。
     * <p>每个层级给出一个区间（min~max），而非精确值，保留创作多样性，
     * 同时避免不同画布混用同一套 fontSize 导致的体量感丢失。</p>
     *
     * <p>同时包含 section 高度预算：基于字号预算反推的 hero section 最小高度和
     * CTA section 最小高度，用于防止 LLM 按旧习惯把 section 写得太矮导致内容溢出。
     * 这是字号预算被放大后新暴露的失效模式（文字/板式相互覆盖）的解决方案。</p>
     */
    private record TypographyBudget(
            int heroMin, int heroMax,
            int subtitleMin, int subtitleMax,
            int sectionTitleMin, int sectionTitleMax,
            int bodyMin, int bodyMax,
            int captionMin, int captionMax,
            int heroSectionMinHeight,
            int ctaSectionMinHeight,
            int infoRowMinHeight
    ) {}

    /**
     * 基于画布尺寸计算字号预算。
     *
     * <p>核心观察：**字号应该基于画布宽度推导，不是高度**。因为文字宽度受画布宽约束，
     * 如果按高度推导，1080×3688 长图会算出荒唐的 400+px 主标题。</p>
     *
     * <p>系数选择（在 1080 宽度下对应约 170~240px hero）：</p>
     * <ul>
     *   <li>长图（h/w ≥ 2.5）：纵向空间充裕，hero 系数 0.15~0.22</li>
     *   <li>方形（h/w ≤ 1.3）：纵向空间紧张，hero 系数 0.11~0.17（给配角留空间）</li>
     *   <li>常规（1.3 ~ 2.5）：标准比例，hero 系数 0.16~0.22</li>
     * </ul>
     *
     * <p>其余层级（subtitle/body/caption）按宽度固定系数，不区分格式。</p>
     *
     * @param width  画布宽度（px）
     * @param height 画布高度（px）
     * @return 计算出的字号预算
     */
    private TypographyBudget computeTypographyBudget(int width, int height) {
        int w = Math.max(1, width);
        double ratio = height > 0 ? (double) height / w : 1.0;
        double heroLo, heroHi;
        if (ratio >= 2.5) {
            heroLo = 0.15; heroHi = 0.22;
        } else if (ratio <= 1.3) {
            heroLo = 0.11; heroHi = 0.17;
        } else {
            heroLo = 0.16; heroHi = 0.22;
        }
        int heroMin = (int) Math.round(w * heroLo);
        int heroMax = (int) Math.round(w * heroHi);
        int bodyMax = (int) Math.round(w * 0.028);
        // Hero section 最小高度 = heroMax × 2.5（覆盖两行 hero × lineHeight 1.0 + 上下装饰区 + 副标题）
        //   例如 1080×1920 方向上 heroMax≈238 → 最小高度 ≈ 595px，足以容纳双行 hero + 徽章 + ANNUAL GALA + 诚邀副标题
        // CTA section 最小高度 = 二维码方块 200 + 大标题 ~48 + 两行辅助说明 ~80 + padding ~100 = ~430px
        // 信息行最小高度 = bodyMax × 1.7（行高）× 2行 + 图标区 16 + 行内 gap 8 ≈ body-based row
        int heroSectionMinHeight = (int) Math.round(heroMax * 2.5);
        int ctaSectionMinHeight = Math.max(400, (int) Math.round(w * 0.40));
        int infoRowMinHeight = Math.max(80, (int) Math.round(bodyMax * 1.7 * 2 + 24));
        return new TypographyBudget(
                heroMin,
                heroMax,
                (int) Math.round(w * 0.036),
                (int) Math.round(w * 0.052),
                (int) Math.round(w * 0.026),
                (int) Math.round(w * 0.034),
                (int) Math.round(w * 0.022),
                bodyMax,
                (int) Math.round(w * 0.015),
                (int) Math.round(w * 0.020),
                heroSectionMinHeight,
                ctaSectionMinHeight,
                infoRowMinHeight
        );
    }

    /**
     * 按宽高比分类画布格式，与 {@link TemplateService#classifyFormat} 保持一致。
     * 用于字号预算块的日志文案和格式提示。
     */
    private String classifyCanvasFormat(int width, int height) {
        int w = Math.max(1, width);
        double ratio = height > 0 ? (double) height / w : 1.0;
        if (ratio >= 2.5) return "长图";
        if (ratio <= 1.3) return "方形";
        return "常规";
    }
}
