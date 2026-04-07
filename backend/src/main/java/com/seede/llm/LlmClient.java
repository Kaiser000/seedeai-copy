package com.seede.llm;

import com.seede.config.LlmConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * LLM HTTP 客户端
 *
 * <p>封装与大语言模型 API（默认为智谱 GLM）的所有 HTTP 通信逻辑，
 * 使用 Spring WebFlux 的 {@link WebClient} 实现非阻塞流式请求。</p>
 *
 * <p>支持两种请求模式：</p>
 * <ul>
 *   <li>{@link #streamChat} — 单轮对话（system + user 两条消息）</li>
 *   <li>{@link #streamChatWithHistory} — 多轮对话（system + 历史消息列表）</li>
 * </ul>
 *
 * <p>所有请求均启用流式模式（stream=true），返回 SSE/NDJSON 格式的原始文本流，
 * 由 {@link LlmResponseParser} 负责进一步解析。</p>
 *
 * <p>超时配置：每次请求最长等待 120 秒，超时后抛出 {@link reactor.core.Exceptions} 异常，
 * 由上层服务的 onErrorResume 降级处理。</p>
 */
@Component
public class LlmClient {

    private static final Logger log = LoggerFactory.getLogger(LlmClient.class);

    /** LLM API 请求超时时间（秒） */
    private static final int TIMEOUT_SECONDS = 120;

    private final WebClient webClient;
    private final LlmConfig config;

    /**
     * 构造时初始化 WebClient，以 LLM API 的 baseUrl 为基准，
     * 并设置默认 Content-Type 请求头。
     *
     * @param config LLM 配置（apiUrl、apiKey、modelName）
     */
    public LlmClient(LlmConfig config) {
        this.config = config;
        log.info("初始化 LlmClient - apiUrl: {}, modelName: {}", config.getApiUrl(), config.getModelName());
        this.webClient = WebClient.builder()
                .baseUrl(config.getApiUrl())
                .defaultHeader("Content-Type", "application/json")
                .build();
        log.debug("WebClient 初始化完成");
    }

    /**
     * 发起单轮流式对话请求。
     *
     * <p>消息结构：[{role:system, content:systemPrompt}, {role:user, content:userMessage}]</p>
     *
     * @param systemPrompt 系统提示词，定义 LLM 的角色和生成规范
     * @param userMessage  用户消息，包含设计描述或元素生成要求
     * @return LLM 原始响应行的 Flux 流（SSE data 行或 NDJSON 行）
     */
    public Flux<String> streamChat(String systemPrompt, String userMessage) {
        log.info("发起流式请求 - model: {}, userMessage长度: {} 字符",
                config.getModelName(), userMessage != null ? userMessage.length() : 0);
        log.debug("streamChat systemPrompt长度: {} 字符", systemPrompt != null ? systemPrompt.length() : 0);

        // 构造请求体：开启 stream 模式，携带 system 和 user 两条消息
        Map<String, Object> body = Map.of(
                "model", config.getModelName(),
                "stream", true,
                "messages", List.of(
                        Map.of("role", "system", "content", systemPrompt),
                        Map.of("role", "user", "content", userMessage)
                )
        );

        return webClient.post()
                .uri("")
                // API Key 通过 Bearer Token 方式鉴权
                .header("Authorization", "Bearer " + config.getApiKey())
                // 声明接受 SSE 流式响应
                .accept(MediaType.TEXT_EVENT_STREAM)
                .bodyValue(body)
                .retrieve()
                // 4xx/5xx 响应读取错误体并包装为 RuntimeException，触发 onErrorResume 降级
                .onStatus(status -> status.is4xxClientError() || status.is5xxServerError(),
                        resp -> resp.bodyToMono(String.class)
                                .map(body2 -> new RuntimeException("LLM API 错误 " + resp.statusCode() + ": " + body2)))
                .bodyToFlux(String.class)
                // 超时保护：防止 LLM 长时间无响应导致连接挂起
                .timeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                .doOnSubscribe(s -> log.debug("SSE 连接已建立，等待 LLM 响应..."))
                .doOnComplete(() -> log.info("streamChat 流式响应接收完毕"))
                .doOnError(e -> log.error("streamChat 请求失败: {}", e.getMessage(), e));
    }

    /**
     * 发起多轮对话流式请求（携带历史消息）。
     *
     * <p>消息结构：[{role:system, ...}, {role:user/assistant, ...}*, {role:user, ...}]</p>
     *
     * @param systemPrompt 系统提示词，注入了当前画布状态作为上下文
     * @param messages     历史消息列表 + 当前用户消息（已在 Service 层组装完毕）
     * @return LLM 原始响应行的 Flux 流
     */
    public Flux<String> streamChatWithHistory(String systemPrompt, List<Map<String, String>> messages) {
        log.info("发起多轮对话流式请求 - model: {}, 消息条数: {}", config.getModelName(), messages.size());
        log.debug("streamChatWithHistory systemPrompt长度: {} 字符", systemPrompt != null ? systemPrompt.length() : 0);

        // 将 system 消息插入消息列表头部，构成完整的对话上下文
        var allMessages = new java.util.ArrayList<Map<String, String>>();
        allMessages.add(Map.of("role", "system", "content", systemPrompt));
        allMessages.addAll(messages);
        log.debug("完整消息列表共 {} 条", allMessages.size());

        Map<String, Object> body = Map.of(
                "model", config.getModelName(),
                "stream", true,
                "messages", allMessages
        );

        return webClient.post()
                .uri("")
                .header("Authorization", "Bearer " + config.getApiKey())
                .accept(MediaType.TEXT_EVENT_STREAM)
                .bodyValue(body)
                .retrieve()
                .onStatus(status -> status.is4xxClientError() || status.is5xxServerError(),
                        resp -> resp.bodyToMono(String.class)
                                .map(body2 -> new RuntimeException("LLM API 错误 " + resp.statusCode() + ": " + body2)))
                .bodyToFlux(String.class)
                .timeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                .doOnSubscribe(s -> log.debug("多轮对话 SSE 连接已建立，等待 LLM 响应..."))
                .doOnComplete(() -> log.info("streamChatWithHistory 流式响应接收完毕"))
                .doOnError(e -> log.error("streamChatWithHistory 请求失败: {}", e.getMessage(), e));
    }
}
