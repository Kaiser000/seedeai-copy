package com.seede.controller;

import com.seede.model.dto.ApiResponse;
import com.seede.model.dto.TemplateDetail;
import com.seede.model.dto.TemplateInfo;
import com.seede.service.TemplateService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;

import java.util.List;

/**
 * 模板接口 — 模板列表、搜索、推荐和详情查询
 *
 * <p>提供以下端点：</p>
 * <ul>
 *   <li>GET /api/templates — 模板列表（支持分类筛选和关键词搜索）</li>
 *   <li>GET /api/templates/categories — 所有分类列表</li>
 *   <li>GET /api/templates/recommend — 随机推荐高质量模板</li>
 *   <li>GET /api/templates/{id} — 模板完整详情（含 sourceCode）</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/templates")
public class TemplateController {

    private static final Logger log = LoggerFactory.getLogger(TemplateController.class);

    /** 列表接口默认返回数量 */
    private static final int DEFAULT_LIMIT = 20;

    /** 列表接口最大返回数量 */
    private static final int MAX_LIMIT = 100;

    private final TemplateService templateService;

    public TemplateController(TemplateService templateService) {
        this.templateService = templateService;
    }

    /**
     * 获取模板列表，支持分类筛选和关键词搜索。
     *
     * @param category 分类名称（可选，如 "电商产品"、"健康医疗"）
     * @param keyword  搜索关键词（可选，匹配名称和描述）
     * @param limit    返回数量上限（默认 20，最大 100）
     * @return 模板摘要列表
     */
    @GetMapping
    public Mono<ApiResponse<List<TemplateInfo>>> list(
            @RequestParam(required = false) String category,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false, defaultValue = "20") int limit) {

        int safeLimit = Math.min(Math.max(limit, 1), MAX_LIMIT);
        log.info("模板列表请求: category={}, keyword={}, limit={}", category, keyword, safeLimit);

        List<TemplateInfo> result;
        if (keyword != null && !keyword.isBlank()) {
            // 关键词搜索优先
            result = templateService.search(keyword, safeLimit);
        } else {
            // 分类筛选
            result = templateService.listByCategory(category, safeLimit);
        }

        log.info("模板列表返回: {} 条", result.size());
        return Mono.just(ApiResponse.success(result));
    }

    /**
     * 获取所有模板分类。
     *
     * @return 分类名称列表
     */
    @GetMapping("/categories")
    public Mono<ApiResponse<List<String>>> categories() {
        return Mono.just(ApiResponse.success(templateService.getCategories()));
    }

    /**
     * 随机推荐高质量模板。
     *
     * @param count 推荐数量（默认 6）
     * @return 随机推荐的模板列表
     */
    @GetMapping("/recommend")
    public Mono<ApiResponse<List<TemplateInfo>>> recommend(
            @RequestParam(required = false, defaultValue = "6") int count) {

        int safeCount = Math.min(Math.max(count, 1), DEFAULT_LIMIT);
        log.info("模板推荐请求: count={}", safeCount);

        List<TemplateInfo> result = templateService.recommend(safeCount);
        return Mono.just(ApiResponse.success(result));
    }

    /**
     * 获取模板完整详情（含 sourceCode）。
     *
     * @param id 模板 id
     * @return 模板详情，不存在时返回 404
     */
    @GetMapping("/{id}")
    public Mono<ApiResponse<TemplateDetail>> detail(@PathVariable String id) {
        log.info("模板详情请求: id={}", id);

        return templateService.getDetail(id)
                .map(detail -> Mono.just(ApiResponse.success(detail)))
                .orElseGet(() -> {
                    log.warn("模板不存在: id={}", id);
                    return Mono.just(ApiResponse.error(404, "模板不存在"));
                });
    }
}
