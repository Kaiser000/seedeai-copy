package com.seede.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;

/**
 * 图片代理控制器 — 解决外部图片的 CORS 限制
 *
 * <p>前端 canvas 操作（fabric.js）需要图片支持 CORS。
 * 外部 CDN（如 Seedream 图片生成 API 返回的 URL）通常不提供 CORS 头。
 * 通过后端代理下载图片并返回给前端，绕过浏览器 CORS 限制。</p>
 *
 * <p>安全措施：仅代理 HTTPS 协议的 URL，防止作为开放代理被滥用。</p>
 */
@RestController
@RequestMapping("/api/proxy")
public class ImageProxyController {

    private static final Logger log = LoggerFactory.getLogger(ImageProxyController.class);

    private final WebClient webClient;

    public ImageProxyController() {
        this.webClient = WebClient.builder()
                .codecs(configurer -> configurer
                        .defaultCodecs()
                        // 允许最大 10MB 的图片响应
                        .maxInMemorySize(10 * 1024 * 1024))
                .build();
    }

    /**
     * 代理下载外部图片并返回，附带浏览器缓存头。
     *
     * @param url 外部图片 URL（需 URL 编码），仅支持 HTTPS
     * @return 图片二进制数据，带正确的 Content-Type 和缓存头
     */
    @GetMapping("/image")
    public Mono<ResponseEntity<byte[]>> proxyImage(@RequestParam String url) {
        // 安全检查：仅允许 HTTPS URL
        if (!url.startsWith("https://")) {
            log.warn("拒绝非 HTTPS 图片代理请求: {}", url);
            return Mono.just(ResponseEntity.badRequest().build());
        }

        log.info("代理图片请求: {}", url.substring(0, Math.min(100, url.length())));

        return webClient.get()
                .uri(url)
                .retrieve()
                .bodyToMono(byte[].class)
                .timeout(Duration.ofSeconds(30))
                .map(bytes -> {
                    // 根据文件头和 URL 猜测 MIME 类型
                    MediaType contentType = guessMediaType(url, bytes);
                    log.debug("代理图片返回: {} bytes, type={}", bytes.length, contentType);

                    return ResponseEntity.ok()
                            .contentType(contentType)
                            // 浏览器缓存 24 小时，减少重复请求
                            .cacheControl(CacheControl.maxAge(Duration.ofHours(24)).cachePublic())
                            .body(bytes);
                })
                .onErrorResume(e -> {
                    log.error("代理图片下载失败: url={}, error={}", url, e.getMessage());
                    return Mono.just(ResponseEntity.notFound().build());
                });
    }

    /**
     * 根据文件头（magic bytes）和 URL 后缀猜测图片 MIME 类型。
     * 优先使用文件头判断，更准确；URL 后缀作为回退。
     */
    private MediaType guessMediaType(String url, byte[] bytes) {
        // 检查文件头 magic bytes
        if (bytes.length >= 12) {
            // PNG: 89 50 4E 47
            if (bytes[0] == (byte) 0x89 && bytes[1] == (byte) 0x50
                    && bytes[2] == (byte) 0x4E && bytes[3] == (byte) 0x47) {
                return MediaType.IMAGE_PNG;
            }
            // JPEG: FF D8 FF
            if (bytes[0] == (byte) 0xFF && bytes[1] == (byte) 0xD8) {
                return MediaType.IMAGE_JPEG;
            }
            // GIF: 47 49 46
            if (bytes[0] == (byte) 0x47 && bytes[1] == (byte) 0x49 && bytes[2] == (byte) 0x46) {
                return MediaType.IMAGE_GIF;
            }
            // WebP: RIFF....WEBP
            if (bytes[0] == (byte) 0x52 && bytes[1] == (byte) 0x49
                    && bytes[2] == (byte) 0x46 && bytes[3] == (byte) 0x46
                    && bytes[8] == (byte) 0x57 && bytes[9] == (byte) 0x45
                    && bytes[10] == (byte) 0x42 && bytes[11] == (byte) 0x50) {
                return MediaType.valueOf("image/webp");
            }
        }

        // 回退：检查 URL 中的扩展名
        String lowerUrl = url.toLowerCase();
        if (lowerUrl.contains(".png")) return MediaType.IMAGE_PNG;
        if (lowerUrl.contains(".gif")) return MediaType.IMAGE_GIF;
        if (lowerUrl.contains(".webp")) return MediaType.valueOf("image/webp");
        if (lowerUrl.contains(".svg")) return MediaType.valueOf("image/svg+xml");

        // 默认返回 JPEG（AI 生成图片最常见的格式）
        return MediaType.IMAGE_JPEG;
    }
}
