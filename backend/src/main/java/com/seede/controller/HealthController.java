package com.seede.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 健康检查接口
 *
 * <p>供运维监控、负载均衡器或 Kubernetes 存活探针调用，
 * 确认服务进程已正常启动并能处理请求。</p>
 */
@RestController
public class HealthController {

    private static final Logger log = LoggerFactory.getLogger(HealthController.class);

    /**
     * 健康检查端点
     *
     * <p>GET /api/health</p>
     * <p>返回 {"status": "UP"} 表示服务正常；HTTP 200 即视为健康。</p>
     *
     * @return 包含 status 字段的 Map，值固定为 "UP"
     */
    @GetMapping("/api/health")
    public Map<String, String> health() {
        log.debug("收到健康检查请求");
        Map<String, String> response = Map.of("status", "UP");
        log.debug("健康检查返回: {}", response);
        return response;
    }
}
