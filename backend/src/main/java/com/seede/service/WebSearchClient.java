package com.seede.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.seede.config.WebSearchConfig;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URI;

import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.time.Duration;
import java.util.*;

/**
 * 联网搜索客户端
 *
 * <p>调用讯飞 CBM 搜索 API，通过 HMAC-SHA256 签名鉴权。
 * 返回搜索结果列表，每条包含标题、摘要、URL。</p>
 *
 * <p>使用 WebClient 实现非阻塞调用，符合 WebFlux 架构要求。</p>
 */
@Component
public class WebSearchClient {

    private static final Logger log = LoggerFactory.getLogger(WebSearchClient.class);

    private final WebSearchConfig config;
    private final WebClient webClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public WebSearchClient(WebSearchConfig config) {
        this.config = config;
        this.webClient = WebClient.builder()
                .defaultHeader("Content-Type", "application/json; charset=utf-8")
                .build();
    }

    /**
     * 判断搜索功能是否可用。
     */
    public boolean isEnabled() {
        return config.isEnabled();
    }

    /**
     * 搜索结果 DTO。
     */
    public record SearchResult(String title, String content, String url) {}

    /**
     * 执行联网搜索。
     *
     * @param keywords 搜索关键词
     * @return 搜索结果列表（Mono），失败时返回空列表而非抛异常
     */
    public Mono<List<SearchResult>> search(String keywords) {
        if (!config.isEnabled()) {
            log.debug("联网搜索未启用，跳过");
            return Mono.just(Collections.emptyList());
        }

        if (keywords == null || keywords.isBlank()) {
            return Mono.just(Collections.emptyList());
        }

        log.info("开始联网搜索: keywords={}, enabled={}, appId={}, apiUrl={}",
                keywords, config.isEnabled(), config.getAppId(), config.getApiUrl());

        try {
            // 构建签名 URL
            URI signedUri = buildSignedUrl();

            // 构建请求体
            String requestBody = buildRequestBody(keywords);

            log.info("联网搜索请求: signedUri={}", signedUri);
            log.info("联网搜索请求体: {}", requestBody);

            return webClient.post()
                    .uri(signedUri)
                    .bodyValue(requestBody)
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofMillis(config.getTimeoutMs()))
                    .doOnNext(body -> log.info("联网搜索原始响应: 长度={}字符, 内容={}",
                            body.length(), body.substring(0, Math.min(body.length(), 1000))))
                    .map(this::parseResponse)
                    .doOnNext(results -> {
                        log.info("联网搜索完成: keywords={}, 结果数={}", keywords, results.size());
                        for (int i = 0; i < results.size(); i++) {
                            SearchResult r = results.get(i);
                            log.info("  搜索结果[{}]: title={}, contentLen={}, url={}",
                                    i, r.title(), r.content().length(), r.url());
                        }
                    })
                    .onErrorResume(e -> {
                        log.error("联网搜索失败: keywords={}, errorType={}, error={}",
                                keywords, e.getClass().getSimpleName(), e.getMessage(), e);
                        return Mono.just(Collections.emptyList());
                    });

        } catch (Exception e) {
            log.error("构建搜索请求失败: {}", e.getMessage(), e);
            return Mono.just(Collections.emptyList());
        }
    }

    /**
     * 构建带 HMAC-SHA256 签名的请求 URL。
     *
     * <p>签名算法与讯飞 CBM 搜索 API 鉴权规范一致：</p>
     * <ol>
     *   <li>构造待签名字符串：host + date + request-line</li>
     *   <li>HMAC-SHA256 签名后 Base64 编码</li>
     *   <li>组装 authorization 字符串后整体 Base64 编码</li>
     *   <li>将 authorization、date、host 作为 URL query 参数</li>
     * </ol>
     */
    private URI buildSignedUrl() throws Exception {
        URI uri = new URI(config.getApiUrl());
        String host = uri.getHost();
        String path = uri.getPath();

        // 生成 GMT 时间戳
        SimpleDateFormat sdf = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss z", Locale.US);
        sdf.setTimeZone(TimeZone.getTimeZone("GMT"));
        String date = sdf.format(new Date());

        // 构造待签名字符串
        String originSign = "host: " + host + "\n"
                + "date: " + date + "\n"
                + "POST " + path + " HTTP/1.1";

        // HMAC-SHA256 签名
        String signature = hmacSha256(originSign, config.getApiSecret());

        // 构造 authorization
        String authorization = "api_key=\"" + config.getApiKey()
                + "\", algorithm=\"hmac-sha256\", headers=\"host date request-line\", signature=\""
                + signature + "\"";

        // Base64 编码 authorization
        String authBase64 = Base64.getEncoder().encodeToString(
                authorization.getBytes(StandardCharsets.UTF_8));

        // 使用 UriComponentsBuilder 构建 URI，由它统一处理编码，避免双重编码
        // 使用 http 协议，与原讯飞 SDK 实现一致
        URI signedUri = org.springframework.web.util.UriComponentsBuilder.newInstance()
                .scheme("http")
                .host(host)
                .path(path)
                .queryParam("authorization", authBase64)
                .queryParam("date", date)
                .queryParam("host", host)
                .build()
                .encode()
                .toUri();

        log.info("签名 URL 构建完成: host={}, path={}, date={}", host, path, date);
        return signedUri;
    }

    /**
     * 构建搜索请求体 JSON。
     */
    private String buildRequestBody(String keywords) throws Exception {
        ObjectNode body = objectMapper.createObjectNode();
        body.put("appId", config.getAppId());
        body.put("auditQuestionDesc", "");
        body.put("limit", String.valueOf(config.getResultLimit()));
        body.put("name", keywords);
        body.put("pipeline_name", "pl_map_agg_search_biz");
        body.put("sid", "cht000b160f@dx19208f0c15eb80a550");
        body.put("timestamp", System.currentTimeMillis());
        body.put("uId", "6f9d7b8e-24c7-4f8c-8eb5-9fe8c4ffb554");
        body.put("open_rerank", true);
        body.put("disable_crawler", true);
        body.put("disable_highlight", true);
        body.put("full_text", true);
        return objectMapper.writeValueAsString(body);
    }

    /**
     * 解析搜索响应 JSON，提取文档列表。
     */
    private List<SearchResult> parseResponse(String responseBody) {
        try {
            JsonNode root = objectMapper.readTree(responseBody);
            String errCode = root.path("err_code").asText("");

            if (!"0".equals(errCode)) {
                String errMsg = root.path("err_msg").asText(root.path("message").asText("unknown"));
                log.warn("搜索 API 返回错误: err_code={}, err_msg={}, 完整响应={}",
                        errCode, errMsg, responseBody.substring(0, Math.min(responseBody.length(), 500)));
                return Collections.emptyList();
            }

            JsonNode documents = root.path("data").path("documents");
            if (!documents.isArray() || documents.isEmpty()) {
                log.info("搜索 API 无结果返回");
                return Collections.emptyList();
            }

            List<SearchResult> results = new ArrayList<>();
            // 只取前 3 条高质量结果，减少 token 消耗同时保证信息充足
            int limit = Math.min(config.getResultLimit(), 3);

            for (int i = 0; i < documents.size() && results.size() < limit; i++) {
                JsonNode doc = documents.get(i);
                String title = doc.path("name").asText(doc.path("title").asText(""));
                // 优先使用正文内容（content），比摘要（summary）信息更完整
                String content = doc.path("content").asText("");
                if (content.isBlank()) {
                    content = doc.path("summary").asText("");
                }
                String url = doc.path("url").asText("");

                // 跳过无内容的结果
                if (title.isBlank() && content.isBlank()) continue;

                // 正文内容截断到 800 字符，保留更多有效信息（如价格、参数、日期）
                if (content.length() > 800) {
                    content = content.substring(0, 800) + "...";
                }

                results.add(new SearchResult(title, content, url));
            }

            return results;

        } catch (Exception e) {
            log.error("解析搜索响应失败: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    /**
     * HMAC-SHA256 签名，输出 Base64 编码。
     */
    private static String hmacSha256(String plainText, String secretKey) throws Exception {
        byte[] keyBytes = secretKey.getBytes(StandardCharsets.UTF_8);
        SecretKeySpec spec = new SecretKeySpec(keyBytes, "HmacSHA256");
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(spec);
        byte[] rawHmac = mac.doFinal(plainText.getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(rawHmac);
    }

    /**
     * 将搜索结果格式化为可注入 LLM prompt 的文本。
     *
     * @param results 搜索结果列表
     * @return 格式化的搜索参考信息
     */
    public static String formatForPrompt(List<SearchResult> results) {
        if (results == null || results.isEmpty()) {
            return "";
        }

        StringBuilder sb = new StringBuilder();
        sb.append("══════════════════════════════════════════\n");
        sb.append("【联网搜索参考资料】以下信息来自实时网络搜索，请提取其中的真实数据融入设计方案。\n");
        sb.append("使用规则：\n");
        sb.append("1. 提取价格、时间、地点、产品参数等真实数据，替代虚构内容\n");
        sb.append("2. 将搜索内容提炼为适合海报展示的精炼文案，不要直接复制原文\n");
        sb.append("3. 不要在海报中显示来源 URL 或「参考 1」等标注\n");
        sb.append("══════════════════════════════════════════\n\n");

        for (int i = 0; i < results.size(); i++) {
            SearchResult r = results.get(i);
            sb.append("--- 参考 ").append(i + 1).append("：").append(r.title()).append(" ---\n");
            if (!r.content().isBlank()) {
                sb.append(r.content()).append("\n");
            }
            sb.append("\n");
        }

        return sb.toString();
    }

    /**
     * 将搜索结果序列化为 JSON 字符串，供前端展示。
     */
    public String resultsToJson(List<SearchResult> results) {
        try {
            ArrayNode arr = objectMapper.createArrayNode();
            for (SearchResult r : results) {
                ObjectNode node = objectMapper.createObjectNode();
                node.put("title", r.title());
                node.put("content", r.content().length() > 100
                        ? r.content().substring(0, 100) + "..." : r.content());
                node.put("url", r.url());
                arr.add(node);
            }
            return objectMapper.writeValueAsString(arr);
        } catch (Exception e) {
            log.error("序列化搜索结果失败: {}", e.getMessage());
            return "[]";
        }
    }
}
