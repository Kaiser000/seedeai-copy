package com.seede;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * Seede AI 应用主入口
 *
 * <p>系统功能：接收用户的海报设计描述，通过 LLM 生成 React/Tailwind JSX 代码，
 * 经前端渲染后输出为可视化海报。</p>
 *
 * <p>主要流程：用户输入 → LLM 生成 JSX → 前端渲染 → PNG 输出</p>
 */
@SpringBootApplication
public class SeedeApplication {

    private static final Logger log = LoggerFactory.getLogger(SeedeApplication.class);

    public static void main(String[] args) {
        log.info("========================================");
        log.info("Seede AI 应用正在启动...");
        log.info("========================================");

        ConfigurableApplicationContext ctx = SpringApplication.run(SeedeApplication.class, args);

        // 启动完成后打印关键配置信息，方便排查环境问题
        String port = ctx.getEnvironment().getProperty("server.port", "8080");
        String appName = ctx.getEnvironment().getProperty("spring.application.name", "seede-ai");
        String activeProfiles = String.join(", ", ctx.getEnvironment().getActiveProfiles());

        log.info("========================================");
        log.info("应用启动成功");
        log.info("  应用名称: {}", appName);
        log.info("  服务端口: {}", port);
        log.info("  激活配置: {}", activeProfiles.isEmpty() ? "default" : activeProfiles);
        log.info("  健康检查: http://localhost:{}/api/health", port);
        log.info("========================================");
    }
}
