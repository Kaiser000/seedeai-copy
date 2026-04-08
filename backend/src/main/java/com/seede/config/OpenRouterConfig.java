package com.seede.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * OpenRouter API 配置属性
 *
 * <p>OpenRouter 是一个聚合多家 LLM 提供商的 API 网关，
 * 支持通过统一接口调用 OpenAI、Anthropic、Google 等多个模型。</p>
 *
 * <p>配置示例（application.yml）：</p>
 * <pre>
 * openrouter:
 *   api-url:  ${OPENROUTER_API_URL:https://openrouter.ai/api/v1/chat/completions}
 *   api-key:  ${OPENROUTER_API_KEY:}
 * </pre>
 *
 * <p>当 api-key 非空时自动启用 OpenRouter 支持，前端可选择 OpenRouter 上的模型。</p>
 */
@Configuration
@ConfigurationProperties(prefix = "openrouter")
public class OpenRouterConfig {

    private static final Logger log = LoggerFactory.getLogger(OpenRouterConfig.class);

    /** OpenRouter API 端点地址 */
    private String apiUrl = "https://openrouter.ai/api/v1/chat/completions";

    /** OpenRouter API 鉴权密钥，通过环境变量 OPENROUTER_API_KEY 注入 */
    private String apiKey = "";

    /**
     * 初始化后打印配置状态（不校验 apiKey，因为 OpenRouter 是可选功能）
     */
    @PostConstruct
    public void init() {
        boolean enabled = isEnabled();
        log.info("OpenRouter 配置 - enabled: {}, apiUrl: {}", enabled, apiUrl);
        if (enabled) {
            String maskedKey = apiKey.length() > 4
                    ? apiKey.substring(0, 4) + "****(" + apiKey.length() + "位)"
                    : "****";
            log.info("OpenRouter API Key: {}", maskedKey);
        }
    }

    /**
     * 判断 OpenRouter 是否已配置启用（api-key 非空即启用）
     */
    public boolean isEnabled() {
        return apiKey != null && !apiKey.isBlank();
    }

    public String getApiUrl() { return apiUrl; }
    public void setApiUrl(String apiUrl) { this.apiUrl = apiUrl; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
}
