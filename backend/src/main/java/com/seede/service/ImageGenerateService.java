package com.seede.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.seede.config.ImageGenerateConfig;
import com.seede.llm.LlmClient;
import com.seede.llm.LlmResponseParser;
import com.seede.llm.SystemPromptManager;
import com.seede.model.SseMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.time.Duration;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 图片生成服务
 *
 * <p>负责在海报代码生成完毕后，分析 JSX 中的占位图（picsum.photos），
 * 调用 LLM 生成图片描述提示词，再调用 Seedream 模型生成真实图片，
 * 最终替换代码中的占位图 URL。</p>
 *
 * <p>全程使用响应式链，不使用 block()，通过 boundedElastic 调度器
 * 避免阻塞 Netty 事件循环线程。</p>
 */
@Service
public class ImageGenerateService {

    private static final Logger log = LoggerFactory.getLogger(ImageGenerateService.class);

    /** 匹配 picsum.photos 占位图 URL */
    private static final Pattern PICSUM_PATTERN =
            Pattern.compile("https://picsum\\.photos/seed/([^/]+)/(\\d+)/(\\d+)");

    private final ImageGenerateConfig config;
    private final LlmClient llmClient;
    private final LlmResponseParser responseParser;
    private final SystemPromptManager promptManager;
    private final WebClient imageWebClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ImageGenerateService(ImageGenerateConfig config,
                                LlmClient llmClient,
                                LlmResponseParser responseParser,
                                SystemPromptManager promptManager) {
        this.config = config;
        this.llmClient = llmClient;
        this.responseParser = responseParser;
        this.promptManager = promptManager;
        this.imageWebClient = WebClient.builder()
                .defaultHeader("Content-Type", "application/json")
                .build();
    }

    /** 是否启用图片生成功能 */
    public boolean isEnabled() {
        return config.isEnabled();
    }

    /**
     * 为已生成的海报代码生成真实图片并替换占位图 URL。
     *
     * @param jsxCode       LLM 生成的包含占位图的 JSX 代码
     * @param userPrompt    用户的原始设计描述（用于生成图片提示词的上下文）
     * @return SSE 消息流：image_analyzing → (image_generating → image_complete)* → complete
     */
    public Flux<SseMessage> generateImagesForCode(String jsxCode, String userPrompt) {
        List<ImagePlaceholder> placeholders = parseImagePlaceholders(jsxCode);

        if (placeholders.isEmpty()) {
            log.info("未检测到占位图，跳过图片生成");
            return Flux.just(SseMessage.complete(jsxCode));
        }

        log.info("检测到 {} 张占位图，开始图片生成流程", placeholders.size());

        return Flux.concat(
                // 阶段 1：分析图片需求
                Flux.just(SseMessage.imageAnalyzing(
                        "检测到 " + placeholders.size() + " 张图片需要生成")),

                // 阶段 2：生成图片描述提示词 + 阶段 3：逐张生成图片
                generateImagePrompts(placeholders, jsxCode, userPrompt)
                        .flatMapMany(promptedPlaceholders ->
                                generateAndReplace(jsxCode, promptedPlaceholders))
        );
    }

    /** 解析 JSX 代码中的 picsum.photos 占位图 URL */
    List<ImagePlaceholder> parseImagePlaceholders(String jsxCode) {
        List<ImagePlaceholder> result = new ArrayList<>();
        Matcher matcher = PICSUM_PATTERN.matcher(jsxCode);

        while (matcher.find()) {
            result.add(ImagePlaceholder.of(
                    matcher.group(0),       // 完整 URL
                    matcher.group(1),       // seed 关键词
                    Integer.parseInt(matcher.group(2)),  // 宽度
                    Integer.parseInt(matcher.group(3))   // 高度
            ));
        }

        // 去重（基于 originalUrl）
        return result.stream().distinct().toList();
    }

    /**
     * 调用 LLM 为每张占位图生成详细的图片描述提示词。
     */
    private Mono<List<ImagePlaceholder>> generateImagePrompts(
            List<ImagePlaceholder> placeholders, String jsxCode, String userPrompt) {

        String systemPrompt = promptManager.loadPrompt("image-prompt.md", Map.of());

        StringBuilder imageList = new StringBuilder();
        for (int i = 0; i < placeholders.size(); i++) {
            ImagePlaceholder p = placeholders.get(i);
            imageList.append(String.format("%d. seed=%s, 尺寸=%dx%d\n",
                    i + 1, p.seed, p.width, p.height));
        }

        String userMessage = String.format(
                "海报设计需求：%s\n\n海报代码：\n%s\n\n需要生成提示词的图片列表：\n%s\n" +
                "请为每张图片生成适合 AI 绘画模型的详细英文提示词，以 JSON 数组格式输出。",
                userPrompt, jsxCode, imageList);

        return llmClient.streamChat(systemPrompt, userMessage)
                .transform(responseParser::parseStream)
                .filter(msg -> "complete".equals(msg.getType()))
                .map(SseMessage::getContent)
                .next()
                .defaultIfEmpty("[]")
                .map(response -> parsePromptResponse(response, placeholders))
                .doOnNext(list -> log.info("图片提示词生成完毕，共 {} 条", list.size()))
                .onErrorResume(e -> {
                    log.warn("图片提示词生成失败，使用 seed 关键词作为备选", e);
                    return Mono.just(placeholders.stream()
                            .map(p -> p.withPrompt(p.seed + ", professional poster design, high quality"))
                            .toList());
                });
    }

    /** 解析 LLM 返回的图片提示词 JSON，与占位图列表关联 */
    private List<ImagePlaceholder> parsePromptResponse(String response, List<ImagePlaceholder> placeholders) {
        try {
            String json = response;
            int start = response.indexOf('[');
            int end = response.lastIndexOf(']');
            if (start >= 0 && end > start) {
                json = response.substring(start, end + 1);
            }

            JsonNode array = objectMapper.readTree(json);
            List<ImagePlaceholder> result = new ArrayList<>();

            for (int i = 0; i < placeholders.size(); i++) {
                ImagePlaceholder p = placeholders.get(i);
                if (array.isArray() && i < array.size()) {
                    JsonNode item = array.get(i);
                    String prompt = item.has("prompt") ? item.get("prompt").asText() : p.seed;
                    result.add(p.withPrompt(prompt));
                } else {
                    result.add(p.withPrompt(p.seed + ", professional design, high quality"));
                }
            }
            return result;
        } catch (Exception e) {
            log.warn("解析图片提示词 JSON 失败: {}", response, e);
            return placeholders.stream()
                    .map(p -> p.withPrompt(p.seed + ", professional poster design, high quality"))
                    .toList();
        }
    }

    /**
     * 逐张生成图片并替换 JSX 代码中的占位图 URL（全响应式，无 block）。
     *
     * <p>使用 AtomicReference 在 concatMap 链中累积替换后的代码，
     * 每次成功生成图片后将占位 URL 替换为真实 URL。</p>
     */
    private Flux<SseMessage> generateAndReplace(String jsxCode, List<ImagePlaceholder> placeholders) {
        int total = placeholders.size();
        AtomicReference<String> codeRef = new AtomicReference<>(jsxCode);

        // 对每张图片：发 image_generating → 调用 API → 发 image_complete → 替换 URL
        Flux<SseMessage> imageFlux = Flux.range(0, total)
                .concatMap(i -> {
                    ImagePlaceholder p = placeholders.get(i);
                    SseMessage progressMsg = SseMessage.imageGenerating(
                            String.format("正在生成第 %d/%d 张图片：%s", i + 1, total, p.seed));

                    return Flux.concat(
                            Flux.just(progressMsg),
                            callSeedreamApiReactive(p.prompt, p.width, p.height)
                                    .map(imageUrl -> {
                                        // 使用后端代理 URL 替换占位图，解决浏览器 CORS 限制
                                        // 前端 fabric.js canvas 操作需要图片支持 CORS，
                                        // 外部 CDN 通常不提供 CORS 头，通过 /api/proxy/image 代理解决
                                        String proxyUrl = "/api/proxy/image?url="
                                                + URLEncoder.encode(imageUrl, StandardCharsets.UTF_8);
                                        codeRef.updateAndGet(code -> code.replace(p.originalUrl, proxyUrl));
                                        log.info("第 {}/{} 张图片生成成功: seed={}, url={}", i + 1, total, p.seed, imageUrl);
                                        // image_complete 消息中返回原始 URL，供前端 UI 预览展示
                                        return SseMessage.imageComplete(String.format(
                                                "{\"index\":%d,\"prompt\":\"%s\",\"url\":\"%s\"}",
                                                i, escapeJson(p.prompt), escapeJson(imageUrl)));
                                    })
                                    .onErrorResume(e -> {
                                        log.error("第 {}/{} 张图片生成失败: {}", i + 1, total, e.getMessage());
                                        return Mono.just(SseMessage.imageComplete(String.format(
                                                "{\"index\":%d,\"prompt\":\"%s\",\"url\":null,\"error\":\"%s\"}",
                                                i, escapeJson(p.prompt), escapeJson(e.getMessage()))));
                                    })
                                    .flux()
                    );
                });

        // 所有图片处理完毕后，发送包含真实图片 URL 的最终代码
        Flux<SseMessage> completeFlux = Flux.defer(() ->
                Flux.just(SseMessage.complete(codeRef.get())));

        return Flux.concat(imageFlux, completeFlux);
    }

    /**
     * 响应式调用 Seedream API 生成图片，返回图片 URL 的 Mono。
     * 通过 subscribeOn(boundedElastic) 避免阻塞 Netty 线程。
     */
    private Mono<String> callSeedreamApiReactive(String prompt, int width, int height) {
        String size = resolveSeedreamSize(width, height);

        Map<String, Object> requestBody = Map.of(
                "model", config.getModelName(),
                "prompt", prompt,
                "size", size,
                "response_format", "url",
                "watermark", false
        );

        log.info("调用 Seedream API - model: {}, size: {}, prompt: {}",
                config.getModelName(), size, prompt.substring(0, Math.min(100, prompt.length())));

        return imageWebClient.post()
                .uri(config.getApiUrl())
                .header("Authorization", "Bearer " + config.getApiKey())
                .accept(MediaType.APPLICATION_JSON)
                .bodyValue(requestBody)
                .retrieve()
                .onStatus(status -> status.is4xxClientError() || status.is5xxServerError(),
                        resp -> resp.bodyToMono(String.class)
                                .map(body -> new RuntimeException("Seedream API 错误: " + body)))
                .bodyToMono(String.class)
                .timeout(Duration.ofSeconds(120))
                .subscribeOn(Schedulers.boundedElastic())
                .map(this::extractImageUrl)
                .flatMap(url -> url != null
                        ? Mono.just(url)
                        : Mono.error(new RuntimeException("Seedream API 返回空 URL")));
    }

    /** 从 Seedream API 响应中提取图片 URL */
    private String extractImageUrl(String responseStr) {
        if (responseStr == null) return null;
        try {
            JsonNode root = objectMapper.readTree(responseStr);
            JsonNode data = root.path("data");
            if (data.isArray() && !data.isEmpty()) {
                return data.get(0).path("url").asText(null);
            }
            log.warn("Seedream API 响应中无 data 数组: {}", responseStr);
            return null;
        } catch (Exception e) {
            log.error("解析 Seedream API 响应失败: {}", responseStr, e);
            return null;
        }
    }

    /** 将任意宽高映射为 Seedream 支持的尺寸（最小像素数 921600） */
    private String resolveSeedreamSize(int width, int height) {
        double ratio = (double) width / height;
        if (ratio > 1.3) return "1280x720";         // 横版 16:9（921600px）
        if (ratio > 0.9) return "1024x1024";         // 方形 1:1（1048576px）
        return "720x1280";                            // 竖版 9:16（921600px）
    }

    private String escapeJson(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r");
    }

    /** 占位图信息 */
    static class ImagePlaceholder {
        final String originalUrl;
        final String seed;
        final int width;
        final int height;
        final String prompt;

        ImagePlaceholder(String originalUrl, String seed, int width, int height, String prompt) {
            this.originalUrl = originalUrl;
            this.seed = seed;
            this.width = width;
            this.height = height;
            this.prompt = prompt;
        }

        static ImagePlaceholder of(String originalUrl, String seed, int width, int height) {
            return new ImagePlaceholder(originalUrl, seed, width, height, null);
        }

        ImagePlaceholder withPrompt(String newPrompt) {
            return new ImagePlaceholder(originalUrl, seed, width, height, newPrompt);
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof ImagePlaceholder that)) return false;
            return Objects.equals(originalUrl, that.originalUrl);
        }

        @Override
        public int hashCode() {
            return Objects.hash(originalUrl);
        }
    }
}
