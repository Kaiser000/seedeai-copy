package com.seede.config;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * Seedream 图片生成 API 配置
 *
 * <p>通过 {@code image-generate.*} 前缀绑定火山引擎 Seedream 模型的配置项。
 * 支持环境变量覆盖，适合 Docker/K8s 部署。</p>
 */
@Configuration
@ConfigurationProperties(prefix = "image-generate")
public class ImageGenerateConfig {

    private static final Logger log = LoggerFactory.getLogger(ImageGenerateConfig.class);

    /** 火山引擎图片生成 API 端点 */
    private String apiUrl = "https://ark.cn-beijing.volces.com/api/v3/images/generations";

    /** API 鉴权密钥（Bearer Token） */
    private String apiKey = "";

    /** 模型名称 */
    private String modelName = "doubao-seedream-4-0-250828";

    /** 是否启用图片生成（关闭后跳过图片生成阶段，直接使用占位图） */
    private boolean enabled = false;

    @PostConstruct
    public void validate() {
        if (!enabled) {
            log.info("图片生成功能已禁用，将使用占位图");
            return;
        }

        if (apiKey == null || apiKey.isBlank()) {
            log.warn("image-generate.api-key 未配置，图片生成功能将禁用");
            enabled = false;
            return;
        }

        String maskedKey = apiKey.length() > 4
                ? apiKey.substring(0, 4) + "****(" + apiKey.length() + "位)"
                : "****";
        log.info("图片生成配置校验通过 - apiUrl: {}, modelName: {}, apiKey: {}",
                apiUrl, modelName, maskedKey);
    }

    public String getApiUrl() { return apiUrl; }
    public void setApiUrl(String apiUrl) { this.apiUrl = apiUrl; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public String getModelName() { return modelName; }
    public void setModelName(String modelName) { this.modelName = modelName; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
}
