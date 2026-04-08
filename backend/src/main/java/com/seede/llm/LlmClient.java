package com.seede.llm;

import com.seede.config.LlmConfig;
import com.seede.config.OpenRouterConfig;
import io.netty.resolver.DefaultAddressResolverGroup;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Flux;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * LLM HTTP 客户端
 *
 * <p>封装与大语言模型 API 的所有 HTTP 通信逻辑，
 * 使用 Spring WebFlux 的 {@link WebClient} 实现非阻塞流式请求。</p>
 *
 * <p>所有 OpenAI 兼容 API（智谱、DeepSeek、OpenRouter 等）共用同一协议，
 * 仅 URL、API Key、模型名不同，因此使用单个无 baseUrl 的 WebClient，
 * 在请求时动态传入完整 URL 和鉴权头。</p>
 *
 * <p>支持两种请求模式：</p>
 * <ul>
 *   <li>{@link #streamChat} — 单轮对话（system + user 两条消息）</li>
 *   <li>{@link #streamChatWithHistory} — 多轮对话（system + 历史消息列表）</li>
 * </ul>
 */
@Component
public class LlmClient {

    private static final Logger log = LoggerFactory.getLogger(LlmClient.class);

    /** LLM API 请求超时时间（秒） */
    private static final int TIMEOUT_SECONDS = 120;

    /** 通用 WebClient，不绑定 baseUrl，请求时动态传入完整 URL */
    private final WebClient webClient;

    private final LlmConfig config;
    private final OpenRouterConfig openRouterConfig;

    public LlmClient(LlmConfig config, OpenRouterConfig openRouterConfig) {
        this.config = config;
        this.openRouterConfig = openRouterConfig;
        log.info("初始化 LlmClient - 默认 apiUrl: {}, modelName: {}, OpenRouter: {}",
                config.getApiUrl(), config.getModelName(), openRouterConfig.isEnabled() ? "已配置" : "未配置");

        // 使用 JDK 默认 DNS 解析器，避免 Netty 自带 DNS 解析器在某些网络环境下解析失败
        HttpClient httpClient = HttpClient.create()
                .resolver(DefaultAddressResolverGroup.INSTANCE);

        // 单个通用 WebClient，不设 baseUrl
        this.webClient = WebClient.builder()
                .clientConnector(new ReactorClientHttpConnector(httpClient))
                .defaultHeader("Content-Type", "application/json")
                .build();
        log.debug("WebClient 初始化完成");
    }

    /**
     * 判断指定的模型名称是否应路由到 OpenRouter。
     * OpenRouter 模型 ID 格式为 "provider/model"（含 "/"），且 OpenRouter 必须已配置。
     */
    private boolean isOpenRouterModel(String modelName) {
        return modelName != null
                && !modelName.isBlank()
                && modelName.contains("/")
                && openRouterConfig.isEnabled();
    }

    /**
     * 解析最终使用的模型名称、API URL、API Key。
     * OpenRouter 模型 → 路由到 OpenRouter；否则使用默认配置。
     */
    private String resolveModelName(String modelNameOverride) {
        if (modelNameOverride != null && !modelNameOverride.isBlank()) {
            if (modelNameOverride.contains("/") && !openRouterConfig.isEnabled()) {
                log.warn("请求指定了 OpenRouter 模型 [{}]，但 OpenRouter 未配置，回退到默认模型 [{}]",
                        modelNameOverride, config.getModelName());
                return config.getModelName();
            }
            return modelNameOverride;
        }
        return config.getModelName();
    }

    private String resolveApiUrl(boolean useOpenRouter) {
        return useOpenRouter ? openRouterConfig.getApiUrl() : config.getApiUrl();
    }

    private String resolveApiKey(boolean useOpenRouter) {
        return useOpenRouter ? openRouterConfig.getApiKey() : config.getApiKey();
    }

    // ── 单轮对话 ────────────────────────────────────────────────────

    public Flux<String> streamChat(String systemPrompt, String userMessage) {
        return streamChat(systemPrompt, userMessage, null);
    }

    public Flux<String> streamChat(String systemPrompt, String userMessage, String modelNameOverride) {
        String modelName = resolveModelName(modelNameOverride);
        boolean useOpenRouter = isOpenRouterModel(modelNameOverride);

        log.info("发起流式请求 - model: {}, useOpenRouter: {}, userMessage长度: {} 字符",
                modelName, useOpenRouter, userMessage != null ? userMessage.length() : 0);

        // OpenRouter 和默认提供商都走 OpenAI 兼容格式
        Map<String, Object> body;
        if (!useOpenRouter && config.isAnthropic()) {
            body = Map.of(
                    "model", modelName,
                    "max_tokens", config.getMaxTokens(),
                    "stream", true,
                    "system", systemPrompt,
                    "messages", List.of(Map.of("role", "user", "content", userMessage))
            );
        } else {
            body = Map.of(
                    "model", modelName,
                    "stream", true,
                    "messages", List.of(
                            Map.of("role", "system", "content", systemPrompt),
                            Map.of("role", "user", "content", userMessage)
                    )
            );
        }

        return executeStreamRequest(body, useOpenRouter);
    }

    // ── 多轮对话 ────────────────────────────────────────────────────

    public Flux<String> streamChatWithHistory(String systemPrompt, List<Map<String, String>> messages) {
        return streamChatWithHistory(systemPrompt, messages, null);
    }

    public Flux<String> streamChatWithHistory(String systemPrompt, List<Map<String, String>> messages,
                                              String modelNameOverride) {
        String modelName = resolveModelName(modelNameOverride);
        boolean useOpenRouter = isOpenRouterModel(modelNameOverride);

        log.info("发起多轮对话流式请求 - model: {}, useOpenRouter: {}, 消息条数: {}",
                modelName, useOpenRouter, messages.size());

        Map<String, Object> body;
        if (!useOpenRouter && config.isAnthropic()) {
            body = Map.of(
                    "model", modelName,
                    "max_tokens", config.getMaxTokens(),
                    "stream", true,
                    "system", systemPrompt,
                    "messages", messages
            );
        } else {
            var allMessages = new java.util.ArrayList<Map<String, String>>();
            allMessages.add(Map.of("role", "system", "content", systemPrompt));
            allMessages.addAll(messages);

            body = Map.of(
                    "model", modelName,
                    "stream", true,
                    "messages", allMessages
            );
        }

        return executeStreamRequest(body, useOpenRouter);
    }

    // ── 统一请求执行 ────────────────────────────────────────────────

    /**
     * 执行流式 HTTP 请求。动态传入完整 URL 和鉴权头，无需预初始化多个 WebClient。
     */
    private Flux<String> executeStreamRequest(Map<String, Object> body, boolean useOpenRouter) {
        String apiUrl = resolveApiUrl(useOpenRouter);
        String apiKey = resolveApiKey(useOpenRouter);

        log.debug("请求 URL: {}", apiUrl);

        var request = webClient.post()
                .uri(apiUrl)
                .accept(MediaType.TEXT_EVENT_STREAM);

        // 鉴权头：Anthropic 用 x-api-key，其余统一 Bearer Token
        if (!useOpenRouter && config.isAnthropic()) {
            request = request
                    .header("x-api-key", apiKey)
                    .header("anthropic-version", "2023-06-01");
        } else {
            request = request.header("Authorization", "Bearer " + apiKey);
        }

        return request
                .bodyValue(body)
                .retrieve()
                .onStatus(status -> status.is4xxClientError() || status.is5xxServerError(),
                        resp -> resp.bodyToMono(String.class)
                                .map(errBody -> new RuntimeException("LLM API 错误 " + resp.statusCode() + ": " + errBody)))
                .bodyToFlux(String.class)
                .timeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                .doOnSubscribe(s -> log.debug("SSE 连接已建立，等待 LLM 响应..."))
                .doOnComplete(() -> log.info("流式响应接收完毕"))
                .doOnError(e -> log.error("流式请求失败: {}", e.getMessage(), e));
    }
}
