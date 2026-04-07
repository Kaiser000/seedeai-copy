package com.seede.controller;

import com.seede.model.SseMessage;
import com.seede.model.dto.RollRequest;
import com.seede.service.RollService;
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
 * 元素重新生成接口（Roll）
 *
 * <p>当用户对海报中某个局部元素不满意时，可通过此接口仅针对该元素重新生成，
 * 而不必重新生成整张海报，从而提高交互效率。</p>
 *
 * <p>调用 {@link RollService}，以 SSE 流式返回新元素的 JSX 片段。</p>
 */
@RestController
@RequestMapping("/api/posters")
public class RollController {

    private static final Logger log = LoggerFactory.getLogger(RollController.class);

    private final RollService rollService;

    public RollController(RollService rollService) {
        this.rollService = rollService;
    }

    /**
     * 重新生成指定元素
     *
     * <p>POST /api/posters/roll</p>
     * <p>响应格式为 text/event-stream，事件类型参见 {@link SseMessage}。</p>
     *
     * @param request 包含元素描述、当前画布上下文及画布尺寸的请求体
     * @return SSE 事件流，依次推送 thinking、code_chunk、complete 或 error 事件
     */
    @PostMapping(value = "/roll", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public Flux<ServerSentEvent<SseMessage>> roll(@Valid @RequestBody RollRequest request) {
        log.info("收到元素重新生成请求 - 尺寸: {}x{}, 元素描述: {}",
                request.getWidth(), request.getHeight(),
                request.getElementDescription());
        log.debug("元素重新生成请求详情 - canvasContext长度: {} 字符",
                request.getCanvasContext() != null ? request.getCanvasContext().length() : 0);

        return rollService.roll(request);
    }
}
