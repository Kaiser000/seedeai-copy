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

import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 海报生成服务 — 多阶段工作流 Pipeline
 *
 * <p>核心职责：将用户的设计描述通过多阶段 LLM 调用，逐步生成高质量海报。
 * 每个阶段独立向前端推送 SSE 事件，前端可实时展示工作流进度。</p>
 *
 * <p>生成流程（5 个阶段）：</p>
 * <ol>
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
    private final ObjectMapper objectMapper = new ObjectMapper();

    public PosterGenerateService(LlmClient llmClient,
                                 LlmResponseParser responseParser,
                                 SystemPromptManager promptManager,
                                 ImageGenerateService imageGenerateService) {
        this.llmClient = llmClient;
        this.responseParser = responseParser;
        this.promptManager = promptManager;
        this.imageGenerateService = imageGenerateService;
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

        // ── 步骤 1：thinking 事件 ──────────────────────────────────
        Flux<SseMessage> thinkingMsg = Flux.just(SseMessage.thinking("正在分析设计需求..."));

        // ── 步骤 2：需求分析阶段（第一次 LLM 调用） ─────────────────
        // 分析用户需求 → 输出设计方案 + 元素列表
        AtomicReference<String> analysisRef = new AtomicReference<>("");

        Flux<SseMessage> analysisStream = llmClient.streamChat(analyzePrompt, request.getPrompt())
                .doOnSubscribe(s -> log.info("开始需求分析 LLM 调用"))
                .doOnComplete(() -> log.info("需求分析 LLM 流结束"))
                .doOnError(e -> log.error("需求分析 LLM 流异常", e))
                .transform(responseParser::parseStream)
                // 将 parseStream 输出的 code_chunk/complete 转换为 analysis 系列事件
                .concatMap(msg -> {
                    if ("code_chunk".equals(msg.getType())) {
                        // code_chunk → analysis_chunk（流式分析内容）
                        return Flux.just(SseMessage.analysisChunk(msg.getContent()));
                    }
                    if ("complete".equals(msg.getType())) {
                        // complete → analysis_complete + layout_complete
                        String analysisText = msg.getContent();
                        analysisRef.set(analysisText);
                        log.info("需求分析完成，分析文本长度: {} 字符", analysisText.length());

                        // 解析元素列表 JSON
                        String elementsJson = parseElementsFromAnalysis(analysisText);
                        log.info("解析出元素列表: {}", elementsJson);

                        return Flux.just(
                                SseMessage.analysisComplete(analysisText),
                                SseMessage.layoutComplete(elementsJson)
                        );
                    }
                    // error 事件直接透传
                    return Flux.just(msg);
                })
                .onErrorResume(e -> {
                    log.error("需求分析阶段失败", e);
                    return Flux.just(SseMessage.error("需求分析失败，请稍后重试", true));
                });

        // ── 步骤 3：代码生成阶段（第二次 LLM 调用） ─────────────────
        // 基于分析结果生成 JSX 代码
        AtomicReference<String> codeRef = new AtomicReference<>("");

        Flux<SseMessage> codeStream = Flux.defer(() -> {
            String analysisResult = analysisRef.get();
            if (analysisResult.isEmpty()) {
                log.warn("需求分析结果为空，直接使用原始 prompt 生成代码");
            }

            // 将分析结果注入用户消息，引导代码生成
            String enrichedPrompt = buildEnrichedPrompt(request.getPrompt(), analysisResult);
            log.info("开始代码生成 LLM 调用，enriched prompt 长度: {} 字符", enrichedPrompt.length());

            return llmClient.streamChat(generatePrompt, enrichedPrompt)
                    .doOnSubscribe(s -> log.info("代码生成 LLM 流开始"))
                    .doOnComplete(() -> log.info("代码生成 LLM 流结束"))
                    .doOnError(e -> log.error("代码生成 LLM 流异常", e))
                    .transform(responseParser::parseStream)
                    .map(msg -> {
                        // 拦截 complete → code_complete（后续还有图片生成阶段）
                        if ("complete".equals(msg.getType())) {
                            codeRef.set(msg.getContent());
                            if (imageGenerateService.isEnabled()) {
                                return SseMessage.codeComplete(msg.getContent());
                            }
                            // 图片生成未启用时直接发 complete
                            return msg;
                        }
                        return msg;
                    })
                    .onErrorResume(e -> {
                        log.error("代码生成阶段失败", e);
                        return Flux.just(SseMessage.error("代码生成失败，请稍后重试", true));
                    });
        });

        // ── 步骤 4：图片生成阶段（仅在启用时执行） ─────────────────
        Flux<SseMessage> imageStream = Flux.defer(() -> {
            String code = codeRef.get();
            if (!imageGenerateService.isEnabled() || code.isEmpty()) {
                return Flux.empty();
            }
            log.info("代码生成完毕，开始图片生成阶段");
            return imageGenerateService.generateImagesForCode(code, request.getPrompt());
        });

        // ── 步骤 5：拼接所有阶段 ──────────────────────────────────
        return Flux.concat(thinkingMsg, analysisStream, codeStream, imageStream)
                .doOnNext(msg -> log.info("SSE发送: type={}", msg.getType()))
                .map(msg -> ServerSentEvent.<SseMessage>builder()
                        .data(msg)
                        .build());
    }

    /**
     * 构建注入了分析结果的增强用户提示词。
     *
     * <p>将需求分析阶段的设计方案追加到用户原始 prompt 后面，
     * 让代码生成 LLM 能够参考分析结果进行更精准的代码生成。</p>
     *
     * @param originalPrompt 用户原始设计描述
     * @param analysisResult 需求分析阶段输出的完整文本
     * @return 增强后的用户提示词
     */
    private String buildEnrichedPrompt(String originalPrompt, String analysisResult) {
        if (analysisResult == null || analysisResult.isBlank()) {
            return originalPrompt;
        }
        return originalPrompt + "\n\n---\n【设计方案参考】以下是需求分析阶段确定的设计方案，请严格遵循此方案生成代码：\n\n"
                + analysisResult;
    }

    /**
     * 从分析文本中解析页面元素列表 JSON。
     *
     * <p>尝试按优先级提取：</p>
     * <ol>
     *   <li>```json ... ``` 代码块中的 JSON</li>
     *   <li>文本中包含 "elements" 的 JSON 对象</li>
     *   <li>解析失败时返回空元素列表</li>
     * </ol>
     *
     * @param analysisText 完整的分析文本
     * @return JSON 字符串（包含 elements 数组），解析失败时返回 {@code {"elements":[]}}
     */
    private String parseElementsFromAnalysis(String analysisText) {
        try {
            // 尝试 1：提取 ```json ... ``` 代码块
            int jsonStart = analysisText.indexOf("```json");
            if (jsonStart >= 0) {
                int contentStart = analysisText.indexOf("\n", jsonStart);
                if (contentStart >= 0) {
                    contentStart += 1;
                    int jsonEnd = analysisText.indexOf("```", contentStart);
                    if (jsonEnd > contentStart) {
                        String json = analysisText.substring(contentStart, jsonEnd).trim();
                        // 验证 JSON 合法性
                        JsonNode node = objectMapper.readTree(json);
                        if (node.has("elements")) {
                            log.debug("从 ```json 代码块中成功解析元素列表");
                            return json;
                        }
                    }
                }
            }

            // 尝试 2：在文本中查找包含 "elements" 的 JSON 对象
            int braceStart = analysisText.lastIndexOf("{\"elements\"");
            if (braceStart < 0) {
                braceStart = analysisText.lastIndexOf("{ \"elements\"");
            }
            if (braceStart >= 0) {
                // 向后查找匹配的闭合 }
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
