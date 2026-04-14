package com.seede.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.config.CorsRegistry;
import org.springframework.web.reactive.config.WebFluxConfigurer;

import jakarta.annotation.PostConstruct;
import java.util.Arrays;

/**
 * Web 全局配置
 *
 * <p>当前职责：配置 CORS（跨域资源共享）策略，允许前端（Vite 开发服务器）
 * 跨域调用后端 API。</p>
 *
 * <p>CORS 策略说明：</p>
 * <ul>
 *   <li>匹配路径：{@code /api/**}（所有 API 接口）</li>
 *   <li>允许来源：通过配置项 {@code cors.allowed-origins} 控制，默认为本地 Vite 端口</li>
 *   <li>允许方法：GET、POST、PUT、DELETE</li>
 *   <li>允许请求头：不限制（{@code *}），适配 Content-Type、Authorization 等常用头</li>
 * </ul>
 *
 * <p>生产部署时，应将 {@code cors.allowed-origins} 设置为实际前端域名，
 * 避免允许所有来源带来的安全风险。</p>
 */
@Configuration
public class WebConfig implements WebFluxConfigurer {

    private static final Logger log = LoggerFactory.getLogger(WebConfig.class);

    /**
     * 允许跨域的前端来源模式列表（支持通配符 *）
     * 通过 application.yml 的 cors.allowed-origin-patterns 配置
     * 例如 http://10.10.*:5173 可匹配同网段所有 IP，避免 DHCP 分配 IP 变化后需要重新配置
     */
    @Value("${cors.allowed-origin-patterns:http://localhost:5173}")
    private String[] allowedOriginPatterns;

    /**
     * 启动时打印 CORS 配置信息，便于排查跨域问题
     */
    @PostConstruct
    public void logConfig() {
        log.info("CORS 配置 - 允许来源模式: {}", Arrays.toString(allowedOriginPatterns));
    }

    /**
     * 注册 CORS 映射规则
     *
     * <p>将规则应用到 /api/** 路径，允许来自配置来源的跨域请求。
     * SSE（text/event-stream）接口同样受此规则保护。</p>
     *
     * @param registry Spring WebFlux 的 CORS 注册器
     */
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        log.debug("注册 CORS 映射规则: /api/**");
        registry.addMapping("/api/**")
                // 使用 pattern 匹配，支持通配符（如 http://10.10.*:5173），适配动态 IP
                .allowedOriginPatterns(allowedOriginPatterns)
                // 允许标准 REST 方法
                .allowedMethods("GET", "POST", "PUT", "DELETE")
                // 允许所有请求头，前端可自由携带 Content-Type、Authorization 等
                .allowedHeaders("*");
        log.debug("CORS 规则注册完成");
    }
}
