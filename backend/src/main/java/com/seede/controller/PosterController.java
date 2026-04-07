package com.seede.controller;

import com.seede.model.SseMessage;
import com.seede.model.dto.GenerateRequest;
import com.seede.service.PosterGenerateService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.codec.ServerSentEvent;
import org.springframework.http.server.reactive.ServerHttpResponse;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Flux;

/**
 * 海报生成接口
 *
 * <p>接收用户的设计描述（prompt）及画布尺寸，调用 {@link PosterGenerateService}
 * 与 LLM 交互，以 SSE（Server-Sent Events）流式返回生成过程和最终 JSX 代码。</p>
 *
 * <p>客户端需使用 EventSource 或支持 text/event-stream 的 HTTP 客户端接收响应。</p>
 */
@RestController
@RequestMapping("/api/posters")
public class PosterController {

    private static final Logger log = LoggerFactory.getLogger(PosterController.class);

    private final PosterGenerateService generateService;

    public PosterController(PosterGenerateService generateService) {
        this.generateService = generateService;
    }

    /**
     * 生成海报
     *
     * <p>POST /api/posters/generate</p>
     * <p>响应格式为 text/event-stream，事件类型参见 {@link SseMessage}。</p>
     *
     * @param request 包含设计描述 prompt 和画布宽高的请求体
     * @return SSE 事件流，依次推送 thinking、code_chunk、complete 或 error 事件
     */
    @PostMapping(value = "/generate", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<SseMessage>> generate(
            @Valid @RequestBody GenerateRequest request,
            ServerHttpResponse response) {
        response.getHeaders().set("X-Accel-Buffering", "no");
        response.getHeaders().set("Cache-Control", "no-cache");

        log.info("收到海报生成请求 - 尺寸: {}x{}, prompt长度: {} 字符",
                request.getWidth(), request.getHeight(),
                request.getPrompt() != null ? request.getPrompt().length() : 0);
        log.debug("海报生成请求详情 - prompt: {}", request.getPrompt());

        return generateService.generate(request);
    }
}
