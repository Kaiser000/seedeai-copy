package com.seede.controller;

import com.seede.model.SseMessage;
import com.seede.model.dto.ChatRequest;
import com.seede.service.ChatOptimizeService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;

/**
 * 海报对话优化接口
 *
 * <p>接收用户的自然语言修改指令和当前画布状态，结合历史对话记录，
 * 调用 {@link ChatOptimizeService} 以 SSE 流式返回修改后的 JSX 代码。</p>
 *
 * <p>此接口支持多轮对话（携带 chatHistory），让用户通过自然语言迭代优化海报。</p>
 */
@RestController
@RequestMapping("/api/posters")
public class ChatController {

    private static final Logger log = LoggerFactory.getLogger(ChatController.class);

    private final ChatOptimizeService chatOptimizeService;

    public ChatController(ChatOptimizeService chatOptimizeService) {
        this.chatOptimizeService = chatOptimizeService;
    }

    /**
     * 对话式修改海报
     *
     * <p>POST /api/posters/chat</p>
     * <p>响应格式为 text/event-stream，事件类型参见 {@link SseMessage}。</p>
     *
     * @param request 包含当前画布 JSX、用户修改指令、历史对话及画布尺寸的请求体
     * @return SSE 事件流，依次推送 thinking、code_chunk、complete 或 error 事件
     */
    @PostMapping(value = "/chat", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<SseMessage>> chat(@Valid @RequestBody ChatRequest request) {
        int historySize = request.getChatHistory() != null ? request.getChatHistory().size() : 0;
        log.info("收到对话优化请求 - 尺寸: {}x{}, 历史轮数: {}, 用户指令长度: {} 字符",
                request.getWidth(), request.getHeight(),
                historySize,
                request.getUserMessage() != null ? request.getUserMessage().length() : 0);
        log.debug("对话优化请求详情 - userMessage: {}", request.getUserMessage());

        return chatOptimizeService.chat(request);
    }
}
