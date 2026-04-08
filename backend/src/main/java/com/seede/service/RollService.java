package com.seede.service;

import com.seede.llm.LlmClient;
import com.seede.llm.LlmResponseParser;
import com.seede.llm.SystemPromptManager;
import com.seede.model.SseMessage;
import com.seede.model.dto.RollRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.util.Map;

/**
 * 元素重新生成服务（Roll）
 *
 * <p>核心职责：当用户对海报中某个局部元素不满意时，仅针对该元素重新生成，
 * 无需重新生成整张海报，提高交互效率。</p>
 *
 * <p>处理流程：</p>
 * <ol>
 *   <li>加载 poster-roll.md 提示词模板，注入画布尺寸</li>
 *   <li>将元素描述与画布上下文拼接为用户消息，便于 LLM 理解局部生成的约束</li>
 *   <li>发送 thinking 事件 → 流式调用 LLM → 解析响应 → 推送 code_chunk / complete</li>
 * </ol>
 */
@Service
public class RollService {

    private static final Logger log = LoggerFactory.getLogger(RollService.class);
    private final LlmClient llmClient;
    private final LlmResponseParser responseParser;
    private final SystemPromptManager promptManager;

    public RollService(LlmClient llmClient, LlmResponseParser responseParser,
                       SystemPromptManager promptManager) {
        this.llmClient = llmClient;
        this.responseParser = responseParser;
        this.promptManager = promptManager;
    }

    /**
     * 执行元素重新生成流程，返回 SSE 事件流。
     *
     * @param request 包含元素描述、画布上下文及画布尺寸的请求对象
     * @return 由 thinking → code_chunk* → complete（或 error）组成的 SSE 事件流
     */
    public Flux<ServerSentEvent<SseMessage>> roll(RollRequest request) {
        log.info("开始重新生成元素 - 尺寸: {}x{}, 元素描述: {}, modelName: {}",
                request.getWidth(), request.getHeight(), request.getElementDescription(), request.getModelName());

        // 步骤 1：加载提示词模板，注入画布尺寸
        log.debug("加载提示词模板: poster-roll.md");
        String systemPrompt = promptManager.loadPrompt("poster-roll.md", Map.of(
                "width", String.valueOf(request.getWidth()),
                "height", String.valueOf(request.getHeight())
        ));
        log.debug("提示词模板加载完成，长度: {} 字符", systemPrompt.length());

        // 步骤 2：拼接用户消息——元素描述 + 完整画布上下文
        // 提供完整 canvasContext 让 LLM 了解当前海报整体风格，保持新元素与整体一致性
        String canvasContext = request.getCanvasContext() != null ? request.getCanvasContext() : "";
        String userMessage = "元素描述：" + request.getElementDescription()
                + "\n\n画布上下文：" + canvasContext;
        log.debug("用户消息构建完成，总长度: {} 字符", userMessage.length());

        // 步骤 3：立即发出 thinking 事件，前端可据此展示"生成中"的 UI 状态
        Flux<SseMessage> thinkingMsg = Flux.just(SseMessage.thinking("正在重新生成元素..."));

        // 步骤 4：向 LLM 发起流式请求，解析响应；异常降级为可重试的 error 事件
        Flux<SseMessage> llmStream = responseParser.parseStream(
                llmClient.streamChat(systemPrompt, userMessage, request.getModelName())
        ).doOnNext(msg -> log.debug("收到 LLM 解析消息 - type: {}", msg.getType()))
         .doOnComplete(() -> log.info("元素重新生成流结束"))
         .doOnError(e -> log.error("元素重新生成 LLM 流异常", e))
         .onErrorResume(e -> {
             log.error("重新生成失败 - 元素: {}, 原因: {}",
                     request.getElementDescription(), e.getMessage(), e);
             return Flux.just(SseMessage.error("重新生成失败，请稍后重试", true));
         });

        // 步骤 5：拼接 thinking 和 LLM 流，包装为标准 SSE 事件后返回
        return Flux.concat(thinkingMsg, llmStream)
                .map(msg -> ServerSentEvent.<SseMessage>builder().data(msg).build());
    }
}
