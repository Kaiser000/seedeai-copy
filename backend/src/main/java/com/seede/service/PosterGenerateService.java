package com.seede.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.seede.llm.LlmClient;
import com.seede.llm.LlmResponseParser;
import com.seede.llm.SystemPromptManager;
import com.seede.model.SseMessage;
import com.seede.model.dto.GenerateRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

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

    private final LlmClient llmClient;
    private final LlmResponseParser responseParser;
    private final SystemPromptManager promptManager;
    private final ImageGenerateService imageGenerateService;
    private final WebSearchClient webSearchClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public PosterGenerateService(LlmClient llmClient,
                                 LlmResponseParser responseParser,
                                 SystemPromptManager promptManager,
                                 ImageGenerateService imageGenerateService,
                                 WebSearchClient webSearchClient) {
        this.llmClient = llmClient;
        this.responseParser = responseParser;
        this.promptManager = promptManager;
        this.imageGenerateService = imageGenerateService;
        this.webSearchClient = webSearchClient;
    }

    /**
     * 执行多阶段海报生成流程，返回 SSE 事件流。
     *
     * @param request 包含设计 prompt 和画布尺寸的请求对象
     * @return SSE 事件流，按阶段顺序推送
     */
    public Flux<ServerSentEvent<SseMessage>> generate(GenerateRequest request) {
        log.info("收到生成请求: prompt={}", request.getPrompt());

        // ── 步骤 0：加载提示词模板 ──────────────────────────────────
        String analyzePrompt;
        String generatePrompt;
        try {
            Map<String, String> sizeVars = Map.of(
                    "width", String.valueOf(request.getWidth()),
                    "height", String.valueOf(request.getHeight())
            );
            analyzePrompt = promptManager.loadPrompt("poster-analyze.md", sizeVars);
            generatePrompt = promptManager.loadPrompt("poster-generate.md", sizeVars);
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

        // ── 步骤 1：联网搜索（可选） ────────────────────────────────
        Flux<SseMessage> searchStream;
        if (webSearchClient.isEnabled()) {
            searchStream = Flux.defer(() -> {
                String keywords = request.getPrompt();
                // 截取前 20 个字符作为搜索关键词
                if (keywords.length() > 20) {
                    keywords = keywords.substring(0, 20);
                }
                String searchKeywords = keywords;

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

            return llmClient.streamChat(analyzePrompt, userPrompt)
                    .doOnSubscribe(s -> log.info("开始需求分析 LLM 调用"))
                    .doOnComplete(() -> log.info("需求分析 LLM 流结束"))
                    .doOnError(e -> log.error("需求分析 LLM 流异常", e))
                    .transform(responseParser::parseStream)
                    .concatMap(msg -> {
                        if ("code_chunk".equals(msg.getType())) {
                            return Flux.just(SseMessage.analysisChunk(msg.getContent()));
                        }
                        if ("complete".equals(msg.getType())) {
                            String analysisText = msg.getContent();
                            analysisRef.set(analysisText);
                            log.info("需求分析完成，分析文本长度: {} 字符", analysisText.length());

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
        Flux<SseMessage> codeStream = Flux.defer(() -> {
            String analysisResult = analysisRef.get();
            if (analysisResult.isEmpty()) {
                log.warn("需求分析结果为空，直接使用原始 prompt 生成代码");
            }

            String enrichedPrompt = buildEnrichedPrompt(request.getPrompt(), analysisResult, request.getHeight());
            log.info("开始代码生成 LLM 调用，enriched prompt 长度: {} 字符", enrichedPrompt.length());

            return llmClient.streamChat(generatePrompt, enrichedPrompt)
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
        });

        // ── 步骤 5：图片生成阶段（仅在启用时执行） ─────────────────
        Flux<SseMessage> imageStream = Flux.defer(() -> {
            String code = codeRef.get();
            if (!imageGenerateService.isEnabled() || code.isEmpty()) {
                return Flux.empty();
            }
            log.info("代码生成完毕，开始图片生成阶段");
            return imageGenerateService.generateImagesForCode(code, request.getPrompt());
        });

        // ── 步骤 6：拼接所有阶段 ──────────────────────────────────
        return Flux.concat(searchStream, thinkingMsg, analysisStream, codeStream, imageStream)
                .doOnNext(msg -> log.info("SSE发送: type={}", msg.getType()))
                .map(msg -> ServerSentEvent.<SseMessage>builder()
                        .data(msg)
                        .build());
    }

    /**
     * 构建注入了分析结果的增强用户提示词。
     */
    private String buildEnrichedPrompt(String originalPrompt, String analysisResult, int totalHeight) {
        if (analysisResult == null || analysisResult.isBlank()) {
            return originalPrompt;
        }

        StringBuilder sb = new StringBuilder(originalPrompt);
        sb.append("\n\n");
        sb.append("══════════════════════════════════════════\n");
        sb.append("【强制执行】以下设计方案由需求分析阶段确定，你必须严格遵循，不可自行修改。\n");
        sb.append("══════════════════════════════════════════\n\n");

        String structuredJson = extractJsonBlock(analysisResult);
        if (structuredJson != null) {
            try {
                JsonNode root = objectMapper.readTree(structuredJson);

                JsonNode sections = root.path("sections");
                if (sections.isArray() && !sections.isEmpty()) {
                    sb.append("【区块高度分配（必须严格遵循）】\n");
                    for (JsonNode section : sections) {
                        String name = section.path("name").asText("未命名");
                        int percent = section.path("heightPercent").asInt(0);
                        String bg = section.path("background").asText("");
                        int height = (int) Math.round(totalHeight * percent / 100.0);
                        sb.append(String.format("- %s：高度 %dpx（%d%%），背景 %s\n", name, height, percent, bg));
                    }
                    sb.append("\n");
                }

                JsonNode images = root.path("images");
                if (images.isArray() && !images.isEmpty()) {
                    sb.append("【图片 seed 关键词（必须使用以下 seed）】\n");
                    for (JsonNode img : images) {
                        String purpose = img.path("purpose").asText("");
                        String seed = img.path("seed").asText("");
                        int w = img.path("width").asInt(800);
                        int h = img.path("height").asInt(600);
                        sb.append(String.format("- %s：seed=\"%s\"，尺寸 %dx%d\n", purpose, seed, w, h));
                    }
                    sb.append("\n");
                }
            } catch (Exception e) {
                log.warn("解析结构化 JSON 失败，回退为原文注入: {}", e.getMessage());
            }
        }

        sb.append("【完整设计方案】\n");
        sb.append(analysisResult);

        return sb.toString();
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
     * 从分析文本中解析页面元素列表 JSON。
     */
    private String parseElementsFromAnalysis(String analysisText) {
        try {
            String jsonBlock = extractJsonBlock(analysisText);
            if (jsonBlock != null) {
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
}
