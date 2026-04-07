package com.seede.service;

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
 * 海报生成服务
 *
 * <p>核心职责：根据用户的设计描述，加载系统提示词模板，调用 LLM 生成
 * React/Tailwind JSX 代码，再调用图片生成服务为占位图生成真实图片，
 * 最终以 SSE 流形式推送给前端。</p>
 *
 * <p>生成流程：</p>
 * <ol>
 *   <li>加载并渲染 poster-generate.md 提示词模板（注入画布尺寸变量）</li>
 *   <li>发送 thinking 状态事件，告知前端正在处理</li>
 *   <li>调用 {@link LlmClient#streamChat} 向 LLM 发送流式请求</li>
 *   <li>通过 {@link LlmResponseParser#parseStream} 解析响应，逐 chunk 推送代码片段</li>
 *   <li>代码生成完毕后推送 code_complete 事件（携带含占位图的 JSX）</li>
 *   <li>若图片生成已启用，调用 {@link ImageGenerateService} 生成真实图片并替换 URL</li>
 *   <li>推送最终 complete 事件（携带含真实图片的 JSX）</li>
 *   <li>任何异常均降级为 error 事件，前端可按 retryable 决定是否提示重试</li>
 * </ol>
 */
@Service
public class PosterGenerateService {

    private static final Logger log = LoggerFactory.getLogger(PosterGenerateService.class);
    private final LlmClient llmClient;
    private final LlmResponseParser responseParser;
    private final SystemPromptManager promptManager;
    private final ImageGenerateService imageGenerateService;

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
     * 执行海报生成流程，返回 SSE 事件流。
     *
     * @param request 包含设计 prompt 和画布尺寸的请求对象
     * @return SSE 事件流：thinking → code_chunk* → code_complete → image_* → complete（或 error）
     */
    public Flux<ServerSentEvent<SseMessage>> generate(GenerateRequest request) {
        log.info("收到生成请求: prompt={}", request.getPrompt());

        // 步骤 1：加载提示词模板
        String systemPrompt;
        try {
            systemPrompt = promptManager.loadPrompt("poster-generate.md", Map.of(
                    "width", String.valueOf(request.getWidth()),
                    "height", String.valueOf(request.getHeight())
            ));
        } catch (Exception e) {
            log.error("加载 prompt 失败", e);
            return Flux.just(ServerSentEvent.<SseMessage>builder()
                    .data(SseMessage.error("系统配置错误", false)).build());
        }

        // 步骤 2：thinking 事件
        Flux<SseMessage> thinkingMsg = Flux.just(SseMessage.thinking("正在分析设计需求..."));

        // 步骤 3：LLM 代码生成
        // 使用 AtomicReference 暂存完整代码，供图片生成阶段使用
        AtomicReference<String> codeRef = new AtomicReference<>("");

        Flux<SseMessage> llmStream = llmClient.streamChat(systemPrompt, request.getPrompt())
                .doOnNext(line -> log.debug("LLM原始行: {}", line))
                .doOnComplete(() -> log.info("LLM流结束"))
                .doOnError(e -> log.error("LLM流异常", e))
                .transform(responseParser::parseStream)
                .doOnNext(msg -> log.info("解析消息: type={}", msg.getType()))
                .map(msg -> {
                    // 拦截 complete 事件：暂存代码，改为 code_complete
                    // 后续还有图片生成阶段，最终 complete 由图片生成服务发出
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
                    log.error("生成失败", e);
                    return Flux.just(SseMessage.error("生成失败，请稍后重试", true));
                });

        // 步骤 4：图片生成阶段（仅在启用时执行）
        Flux<SseMessage> imageStream = Flux.defer(() -> {
            String code = codeRef.get();
            if (!imageGenerateService.isEnabled() || code.isEmpty()) {
                return Flux.empty();
            }
            log.info("代码生成完毕，开始图片生成阶段");
            return imageGenerateService.generateImagesForCode(code, request.getPrompt());
        });

        // 步骤 5：拼接所有阶段
        return Flux.concat(thinkingMsg, llmStream, imageStream)
                .doOnNext(msg -> log.info("SSE发送: {}", msg.getType()))
                .map(msg -> ServerSentEvent.<SseMessage>builder()
                        .data(msg)
                        .build());
    }
}
