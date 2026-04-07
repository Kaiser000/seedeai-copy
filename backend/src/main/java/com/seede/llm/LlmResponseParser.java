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

    /**
     * 将原始 LLM 响应行流解析为 SSE 消息流。
     *
     * @param rawStream LlmClient 返回的原始文本行 Flux
     * @return 解析后的 {@link SseMessage} Flux，事件类型为 code_chunk、complete 或 error
     */
    public Flux<SseMessage> parseStream(Flux<String> rawStream) {
        // 使用 Flux.defer 确保每次订阅都创建独立的 codeBuffer 实例
        // 防止并发请求或重试时共享同一 StringBuilder 导致代码串混
        return Flux.defer(() -> {
            // 累积所有 code_chunk 内容，在 complete 事件时一并返回完整代码
            StringBuilder codeBuffer = new StringBuilder();
            log.debug("开始解析 LLM 响应流（新订阅，独立 codeBuffer）");

            return rawStream
                    // 过滤空行，避免无效解析
                    .filter(line -> !line.isBlank())
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
                                    log.info("LLM 生成完毕 - finish_reason: {}, 总代码长度: {} 字符",
                                            finishReason, codeBuffer.length());
                                    sink.next(SseMessage.complete(codeBuffer.toString()));
                                }
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
}
