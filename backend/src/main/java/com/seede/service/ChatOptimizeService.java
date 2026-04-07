package com.seede.service;

import com.seede.llm.LlmClient;
import com.seede.llm.LlmResponseParser;
import com.seede.llm.SystemPromptManager;
import com.seede.model.SseMessage;
import com.seede.model.dto.ChatRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

/**
 * 海报对话优化服务
 *
 * <p>核心职责：接收用户的自然语言修改指令及当前画布 JSX，结合历史对话记录，
 * 调用 LLM 生成修改后的完整 JSX，以 SSE 流式推送给前端。</p>
 *
 * <p>与 {@link PosterGenerateService} 的区别：</p>
 * <ul>
 *   <li>系统提示词使用 poster-chat.md（内嵌当前 canvasState 作为上下文）</li>
 *   <li>调用 {@link LlmClient#streamChatWithHistory}，携带多轮对话历史</li>
 *   <li>对历史消息的 role 进行白名单校验，防止非法角色注入</li>
 * </ul>
 */
@Service
public class ChatOptimizeService {

    private static final Logger log = LoggerFactory.getLogger(ChatOptimizeService.class);

    /** 允许出现在 chatHistory 中的 role 值；system 角色由服务端统一注入，不允许客户端传入 */
    private static final Set<String> ALLOWED_ROLES = Set.of("user", "assistant");

    private final LlmClient llmClient;
    private final LlmResponseParser responseParser;
    private final SystemPromptManager promptManager;

    public ChatOptimizeService(LlmClient llmClient, LlmResponseParser responseParser,
                               SystemPromptManager promptManager) {
        this.llmClient = llmClient;
        this.responseParser = responseParser;
        this.promptManager = promptManager;
    }

    /**
     * 执行对话式海报优化流程，返回 SSE 事件流。
     *
     * @param request 包含画布 JSX、用户指令、对话历史及画布尺寸的请求对象
     * @return 由 thinking → code_chunk* → complete（或 error）组成的 SSE 事件流
     */
    public Flux<ServerSentEvent<SseMessage>> chat(ChatRequest request) {
        int historySize = request.getChatHistory() != null ? request.getChatHistory().size() : 0;
        log.info("开始对话优化 - 尺寸: {}x{}, 历史轮数: {}", request.getWidth(), request.getHeight(), historySize);

        // 步骤 1：加载提示词模板，注入画布尺寸和当前 canvasState
        // canvasState 让 LLM 了解当前海报代码上下文，从而进行精准的局部修改
        String canvasState = request.getCanvasState() != null ? request.getCanvasState() : "";
        log.debug("加载提示词模板: poster-chat.md，canvasState长度: {} 字符", canvasState.length());
        String systemPrompt = promptManager.loadPrompt("poster-chat.md", Map.of(
                "width", String.valueOf(request.getWidth()),
                "height", String.valueOf(request.getHeight()),
                "canvasState", canvasState
        ));
        log.debug("提示词模板加载完成，长度: {} 字符", systemPrompt.length());

        // 步骤 2：构建消息列表（过滤非法 role + 历史消息 + 当前用户消息）
        // 使用 ALLOWED_ROLES 白名单过滤，防止客户端通过 chatHistory 注入 system 角色消息
        List<Map<String, String>> messages = new ArrayList<>();
        if (request.getChatHistory() != null) {
            request.getChatHistory().stream()
                    .filter(Objects::nonNull)
                    .filter(msg -> ALLOWED_ROLES.contains(msg.getRole()))
                    .forEach(msg -> {
                        messages.add(Map.of(
                                "role", msg.getRole(),
                                "content", msg.getContent() != null ? msg.getContent() : ""
                        ));
                        log.debug("添加历史消息 - role: {}", msg.getRole());
                    });
        }
        // 追加本轮用户消息
        messages.add(Map.of("role", "user", "content", request.getUserMessage()));
        log.debug("消息列表构建完成，共 {} 条（含当前用户消息）", messages.size());

        // 步骤 3：立即发出 thinking 事件，前端可据此展示"分析中"的 UI 状态
        Flux<SseMessage> thinkingMsg = Flux.just(SseMessage.thinking("正在分析修改意图..."));

        // 步骤 4：携带历史消息调用 LLM，解析流式响应；异常降级为可重试的 error 事件
        Flux<SseMessage> llmStream = responseParser.parseStream(
                llmClient.streamChatWithHistory(systemPrompt, messages)
        ).doOnNext(msg -> log.debug("收到 LLM 解析消息 - type: {}", msg.getType()))
         .doOnComplete(() -> log.info("对话优化流结束"))
         .doOnError(e -> log.error("对话优化 LLM 流异常", e))
         .onErrorResume(e -> {
             log.error("对话优化失败 - 原因: {}", e.getMessage(), e);
             return Flux.just(SseMessage.error("优化失败，请稍后重试", true));
         });

        // 步骤 5：拼接 thinking 和 LLM 流，包装为标准 SSE 事件后返回
        return Flux.concat(thinkingMsg, llmStream)
                .map(msg -> ServerSentEvent.<SseMessage>builder().data(msg).build());
    }
}
