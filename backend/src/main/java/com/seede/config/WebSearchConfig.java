package com.seede.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * 联网搜索配置属性
 *
 * <p>将 application.yml 中 {@code web-search.*} 前缀的属性绑定到此类字段。
 * 搜索功能为可选：enabled=false 时跳过搜索阶段，不影响核心生成流程。</p>
 *
 * <pre>
 * web-search:
 *   enabled: true
 *   api-url: https://cbm-search-api.cn-huabei-1.xf-yun.com/biz/search
 *   app-id: xxx
 *   api-key: xxx
 *   api-secret: xxx
 * </pre>
 */
@Configuration
@ConfigurationProperties(prefix = "web-search")
public class WebSearchConfig {

    private static final Logger log = LoggerFactory.getLogger(WebSearchConfig.class);

    /** 是否启用联网搜索 */
    private boolean enabled = false;

    /** 搜索 API 地址 */
    private String apiUrl = "https://cbm-search-api.cn-huabei-1.xf-yun.com/biz/search";

    /** 应用 ID */
    private String appId = "";

    /** API Key（用于 HMAC 签名） */
    private String apiKey = "";

    /** API Secret（用于 HMAC 签名） */
    private String apiSecret = "";

    /** 搜索结果数量限制 */
    private int resultLimit = 5;

    /** 请求超时（毫秒） */
    private int timeoutMs = 5000;

    @PostConstruct
    public void validate() {
        log.info("联网搜索配置: enabled={}, apiUrl={}, appId={}, resultLimit={}, timeoutMs={}",
                enabled, apiUrl, appId, resultLimit, timeoutMs);

        if (!enabled) {
            log.info("联网搜索未启用（web-search.enabled=false）");
            return;
        }
        if (apiKey == null || apiKey.isBlank()) {
            log.warn("联网搜索已启用但 api-key 为空，将自动禁用");
            enabled = false;
            return;
        }

        String maskedKey = apiKey.length() > 4
                ? apiKey.substring(0, 4) + "****(" + apiKey.length() + "位)"
                : "****";
        String maskedSecret = apiSecret != null && apiSecret.length() > 4
                ? apiSecret.substring(0, 4) + "****(" + apiSecret.length() + "位)"
                : "****";
        log.info("联网搜索配置校验通过 - appId: {}, apiKey: {}, apiSecret: {}",
                appId, maskedKey, maskedSecret);
    }

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getApiUrl() { return apiUrl; }
    public void setApiUrl(String apiUrl) { this.apiUrl = apiUrl; }
    public String getAppId() { return appId; }
    public void setAppId(String appId) { this.appId = appId; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public String getApiSecret() { return apiSecret; }
    public void setApiSecret(String apiSecret) { this.apiSecret = apiSecret; }
    public int getResultLimit() { return resultLimit; }
    public void setResultLimit(int resultLimit) { this.resultLimit = resultLimit; }
    public int getTimeoutMs() { return timeoutMs; }
    public void setTimeoutMs(int timeoutMs) { this.timeoutMs = timeoutMs; }
}
