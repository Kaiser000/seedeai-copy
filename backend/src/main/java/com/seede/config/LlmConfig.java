package com.seede.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

import java.net.URI;

/**
 * LLM API 配置属性
 *
 * <p>通过 Spring Boot 的 {@code @ConfigurationProperties} 机制，
 * 将 application.yml 中 {@code llm.*} 前缀的属性绑定到此类字段。
 * 支持通过环境变量覆盖，适合 Docker/K8s 部署场景：</p>
 *
 * <pre>
 * llm:
 *   api-url:   ${LLM_API_URL:https://open.bigmodel.cn/api/paas/v4/chat/completions}
 *   api-key:   ${LLM_API_KEY:}
 *   model-name: ${LLM_MODEL:glm-4-flash}
 * </pre>
 *
 * <p>安全说明：{@link #validate()} 在 Bean 初始化完成后立即执行校验，
 * 若关键配置缺失或格式非法，则快速失败（Fail-Fast），防止应用以无效配置启动后才在运行时报错。</p>
 */
@Configuration
@ConfigurationProperties(prefix = "llm")
public class LlmConfig {

    private static final Logger log = LoggerFactory.getLogger(LlmConfig.class);

    /** LLM API 端点地址，默认为智谱 GLM-4 */
    private String apiUrl = "https://open.bigmodel.cn/api/paas/v4/chat/completions";

    /** LLM API 鉴权密钥，必填，通过环境变量 LLM_API_KEY 注入 */
    private String apiKey = "";

    /** 使用的模型名称，默认为 glm-4-flash（低延迟版本） */
    private String modelName = "glm-4-flash";

    /**
     * 配置校验（Bean 初始化后自动执行）
     *
     * <p>校验项：</p>
     * <ol>
     *   <li>apiKey 不能为空，否则所有 LLM 请求都会因鉴权失败而报错</li>
     *   <li>apiUrl 必须是合法的 URI 格式，且包含协议 scheme</li>
     * </ol>
     *
     * @throws IllegalStateException 若校验未通过
     */
    @PostConstruct
    public void validate() {
        log.info("校验 LLM 配置 - apiUrl: {}, modelName: {}", apiUrl, modelName);

        // 校验 API Key：空值会导致所有请求返回 401，在启动时尽早发现
        if (apiKey == null || apiKey.isBlank()) {
            log.error("LLM 配置校验失败：llm.api-key 未配置");
            throw new IllegalStateException("llm.api-key 未配置，请设置环境变量 LLM_API_KEY");
        }

        // 校验 API URL：格式非法会导致 WebClient 初始化失败
        try {
            URI uri = new URI(apiUrl);
            if (uri.getScheme() == null) {
                log.error("LLM 配置校验失败：apiUrl 缺少协议 scheme: {}", apiUrl);
                throw new IllegalStateException("llm.api-url 格式无效: " + apiUrl);
            }
        } catch (Exception e) {
            log.error("LLM 配置校验失败：apiUrl 格式无效: {}", apiUrl, e);
            throw new IllegalStateException("llm.api-url 格式无效: " + apiUrl, e);
        }

        // 隐藏 apiKey 敏感信息，只打印前4位和长度
        String maskedKey = apiKey.length() > 4
                ? apiKey.substring(0, 4) + "****(" + apiKey.length() + "位)"
                : "****";
        log.info("LLM 配置校验通过 - apiUrl: {}, modelName: {}, apiKey: {}",
                apiUrl, modelName, maskedKey);
    }

    public String getApiUrl() { return apiUrl; }
    public void setApiUrl(String apiUrl) { this.apiUrl = apiUrl; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public String getModelName() { return modelName; }
    public void setModelName(String modelName) { this.modelName = modelName; }
}
