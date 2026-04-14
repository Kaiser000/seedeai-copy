package com.seede.llm;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.seede.model.SseMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Flux;

/**
 * LLM 流式响应解析器
 *
 * <p>负责将 {@link LlmClient} 返回的原始 SSE/NDJSON 文本行流，
 * 解析为结构化的 {@link SseMessage} 序列，供上层服务推送给前端。</p>
 *
 * <p>支持的 LLM 响应格式（OpenAI 兼容格式）：</p>
 * <pre>
 * data: {"choices":[{"delta":{"content":"..."}, "finish_reason":null}]}
 * data: {"choices":[{"delta":{}, "finish_reason":"stop"}]}
 * data: [DONE]
 * </pre>
 *
 * <p>解析规则：</p>
 * <ul>
 *   <li>空行直接跳过</li>
 *   <li>{@code data: [DONE]} 行直接跳过（完成信号已由 finish_reason=stop 触发）</li>
 *   <li>delta.content 非空 → 推送 {@code code_chunk} 事件并累积到 codeBuffer</li>
 *   <li>finish_reason 非空 → 推送 {@code complete} 事件（携带完整代码）</li>
 *   <li>JSON 解析失败 → 推送不可重试的 {@code error} 事件，记录 WARN 日志</li>
 * </ul>
 *
 * <p>线程安全：使用 {@link Flux#defer} 确保每次订阅都获得独立的 codeBuffer，
 * 避免并发请求之间的状态污染。</p>
 */
@Component
public class LlmResponseParser {

    private static final Logger log = LoggerFactory.getLogger(LlmResponseParser.class);

    /** Jackson ObjectMapper，复用实例以避免频繁创建开销 */
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 匹配 markdown 代码块开头标记：```jsx、```tsx、```javascript 等 */
    private static final java.util.regex.Pattern CODE_FENCE_START =
            java.util.regex.Pattern.compile("^```(?:jsx|tsx|javascript|js|html|react)?\\s*\\n?");

    /** 匹配 markdown 代码块结尾标记 */
    private static final java.util.regex.Pattern CODE_FENCE_END =
            java.util.regex.Pattern.compile("\\n?```\\s*$");

    /**
     * 将原始 LLM 响应行流解析为 SSE 消息流（默认清理代码块标记）。
     *
     * @param rawStream LlmClient 返回的原始文本行 Flux
     * @return 解析后的 {@link SseMessage} Flux，事件类型为 code_chunk、complete 或 error
     */
    public Flux<SseMessage> parseStream(Flux<String> rawStream) {
        return parseStream(rawStream, true);
    }

    /**
     * 将原始 LLM 响应行流解析为 SSE 消息流。
     *
     * @param rawStream LlmClient 返回的原始文本行 Flux
     * @param stripFences 是否清理 markdown 代码块标记（代码生成阶段需要清理，需求分析阶段不能清理，
     *                    否则会破坏分析文本中的 {@code ```json ... ```} 结构化输出块）
     * @return 解析后的 {@link SseMessage} Flux，事件类型为 code_chunk、complete 或 error
     */
    public Flux<SseMessage> parseStream(Flux<String> rawStream, boolean stripFences) {
        // 使用 Flux.defer 确保每次订阅都创建独立的 codeBuffer 实例
        // 防止并发请求或重试时共享同一 StringBuilder 导致代码串混
        return Flux.defer(() -> {
            // 累积所有 code_chunk 内容，在 complete 事件时一并返回完整代码
            StringBuilder codeBuffer = new StringBuilder();
            log.debug("开始解析 LLM 响应流（新订阅，独立 codeBuffer）");

            return rawStream
                    // 过滤空行和 SSE event: 行（只保留 data 行）
                    .filter(line -> !line.isBlank() && !line.startsWith("event:") && !line.startsWith("event: "))
                    .handle((line, sink) -> {
                        // 去除 SSE 协议前缀 "data: "，获得实际 JSON 内容
                        String data = line.startsWith("data: ") ? line.substring(6) : line;

                        // [DONE] 是 OpenAI 兼容格式的流结束标记，实际完成由 finish_reason 触发
                        if (data.equals("[DONE]")) {
                            log.debug("收到 [DONE] 标记，流结束");
                            return;
                        }

                        try {
                            // 解析 JSON 响应体
                            JsonNode root = objectMapper.readTree(data);

                            // 自动检测响应格式：有 "type" 字段 → Anthropic，有 "choices" 字段 → OpenAI
                            if (root.has("type")) {
                                // ===== Anthropic Claude 响应格式 =====
                                parseAnthropicEvent(root, codeBuffer, sink, stripFences);
                            } else if (root.has("choices")) {
                                // ===== OpenAI 兼容响应格式 =====
                                parseOpenAiEvent(root, codeBuffer, sink, stripFences);
                            } else {
                                log.debug("跳过无法识别的 JSON 行: {}", data.substring(0, Math.min(data.length(), 100)));
                            }
                        } catch (Exception e) {
                            // JSON 解析异常：记录原始行内容（便于排查 API 响应格式变更），
                            // 推送不可重试的 error 事件（解析错误通常为服务端问题，重试无意义）
                            log.warn("解析LLM响应行失败: {}", line, e);
                            sink.next(SseMessage.error("响应解析异常", false));
                        }
                    });
        });
    }

    /**
     * 解析 OpenAI 兼容格式的 SSE 事件（智谱 GLM、DeepSeek 等）。
     *
     * <p>格式示例：{@code {"choices":[{"delta":{"content":"..."},"finish_reason":null}]}}</p>
     */
    private void parseOpenAiEvent(JsonNode root, StringBuilder codeBuffer,
                                  reactor.core.publisher.SynchronousSink<SseMessage> sink,
                                  boolean stripFences) {
        JsonNode choices = root.path("choices");
        if (choices.isArray() && !choices.isEmpty()) {
            JsonNode delta = choices.get(0).path("delta");

            // 情况 1：delta.content 有内容 → 推送代码片段并累积
            String content = delta.path("content").asText("");
            if (!content.isEmpty()) {
                codeBuffer.append(content);
                log.trace("推送 code_chunk，内容长度: {} 字符，累积总长: {} 字符",
                        content.length(), codeBuffer.length());
                sink.next(SseMessage.codeChunk(content));
                return;
            }

            // 情况 2：finish_reason 非空 → 生成完毕，推送完整代码
            String finishReason = choices.get(0).path("finish_reason").asText("");
            if (!finishReason.isEmpty()) {
                String fullCode = stripFences ? stripCodeFences(codeBuffer.toString()) : codeBuffer.toString();
                log.info("LLM 生成完毕 - finish_reason: {}, 总代码长度: {} 字符",
                        finishReason, fullCode.length());
                sink.next(SseMessage.complete(fullCode));
            }
        }
    }

    /**
     * 解析 Anthropic Claude 格式的 SSE 事件。
     *
     * <p>Claude 的流式响应事件类型：</p>
     * <ul>
     *   <li>{@code content_block_delta} — 文本增量，delta.text 为代码片段</li>
     *   <li>{@code message_delta} — 消息级别状态，delta.stop_reason 非空表示完成</li>
     *   <li>{@code message_start}、{@code content_block_start/stop}、{@code message_stop} — 生命周期事件，跳过</li>
     * </ul>
     */
    private void parseAnthropicEvent(JsonNode root, StringBuilder codeBuffer,
                                     reactor.core.publisher.SynchronousSink<SseMessage> sink,
                                     boolean stripFences) {
        String type = root.path("type").asText("");

        switch (type) {
            case "content_block_delta" -> {
                // 提取文本增量：delta.type=text_delta 时，delta.text 为代码片段
                JsonNode delta = root.path("delta");
                String deltaType = delta.path("type").asText("");
                if ("text_delta".equals(deltaType)) {
                    String text = delta.path("text").asText("");
                    if (!text.isEmpty()) {
                        codeBuffer.append(text);
                        log.trace("Anthropic code_chunk，内容长度: {} 字符，累积总长: {} 字符",
                                text.length(), codeBuffer.length());
                        sink.next(SseMessage.codeChunk(text));
                    }
                }
            }
            case "message_delta" -> {
                // 检查 stop_reason：非空表示生成完毕
                String stopReason = root.path("delta").path("stop_reason").asText("");
                if (!stopReason.isEmpty()) {
                    String fullCode = stripFences ? stripCodeFences(codeBuffer.toString()) : codeBuffer.toString();
                    log.info("Anthropic 生成完毕 - stop_reason: {}, 总代码长度: {} 字符",
                            stopReason, fullCode.length());
                    sink.next(SseMessage.complete(fullCode));
                }
            }
            case "error" -> {
                // Anthropic 流内错误事件
                String errorMsg = root.path("error").path("message").asText("未知错误");
                log.error("Anthropic 流内错误: {}", errorMsg);
                sink.next(SseMessage.error("LLM 错误: " + errorMsg, false));
            }
            default -> log.trace("跳过 Anthropic 生命周期事件: {}", type);
        }
    }

    /**
     * 清理 LLM 输出中的 markdown 代码块格式。
     *
     * <p>LLM 有时会在 JSX 代码外面包裹 {@code ```jsx ... ```} 格式，
     * 这些 markdown 标记会导致前端 Babel 编译失败。在后端统一清理，
     * 确保推送给前端的代码是纯 JSX。</p>
     */
    private String stripCodeFences(String code) {
        if (code == null || code.isBlank()) {
            return code;
        }
        String cleaned = code.trim();

        // 去除开头的 markdown 代码块标记
        cleaned = CODE_FENCE_START.matcher(cleaned).replaceFirst("");
        // 去除结尾的 markdown 代码块标记
        cleaned = CODE_FENCE_END.matcher(cleaned).replaceFirst("");

        return cleaned.trim();
    }
}
