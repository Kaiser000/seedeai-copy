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
            log.warn("╔══════════════════════════════════════════════════════════════╗");
            log.warn("║ 图片生成功能已禁用（IMAGE_GENERATE_ENABLED=false）             ║");
            log.warn("║ 生成的海报将使用 picsum.photos 随机占位图，图片内容与主题无关  ║");
            log.warn("║ 若要启用真实图片生成，请设 IMAGE_GENERATE_ENABLED=true          ║");
            log.warn("║ 并配置 IMAGE_GENERATE_API_KEY（火山引擎 Seedream 密钥）       ║");
            log.warn("╚══════════════════════════════════════════════════════════════╝");
            return;
        }

        if (apiKey == null || apiKey.isBlank()) {
            log.warn("╔══════════════════════════════════════════════════════════════╗");
            log.warn("║ ⚠️  IMAGE_GENERATE_API_KEY 未配置，图片生成功能自动降级为禁用  ║");
            log.warn("║ 生成的海报将使用 picsum.photos 随机占位图（与主题无关）       ║");
            log.warn("║ → 这就是「海报图片和主题不符 / 生成图片不符合实际」问题的根因 ║");
            log.warn("║ 解决：在启动环境变量中设置 IMAGE_GENERATE_API_KEY=<火山密钥>  ║");
            log.warn("╚══════════════════════════════════════════════════════════════╝");
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
