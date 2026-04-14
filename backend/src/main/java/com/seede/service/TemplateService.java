package com.seede.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.seede.model.dto.TemplateDetail;
import com.seede.model.dto.TemplateInfo;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 模板服务 — 加载和检索模板元数据与完整代码
 *
 * <p>启动时从 classpath 加载两个 JSON 文件：</p>
 * <ul>
 *   <li>{@code template-metadata.json} — 290+ 个模板的摘要信息（分类、情绪、色彩等）</li>
 *   <li>{@code all_items.json} — 所有模板的完整数据（含 sourceCode），按 id 建索引</li>
 * </ul>
 *
 * <p>提供分类列表、筛选搜索、随机推荐和详情查询等能力。</p>
 */
@Service
public class TemplateService {

    private static final Logger log = LoggerFactory.getLogger(TemplateService.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 元数据列表（按 quality 降序），用于列表/搜索 */
    private List<TemplateInfo> metadataList = Collections.emptyList();

    /** 完整数据索引（id → JsonNode），用于按需获取 sourceCode */
    private Map<String, JsonNode> fullDataIndex = Collections.emptyMap();

    /** 分类列表缓存 */
    private List<String> categories = Collections.emptyList();

    /**
     * 启动时加载模板数据到内存。
     * 如果文件缺失不影响主流程启动，仅日志警告。
     */
    @PostConstruct
    public void init() {
        loadMetadata();
        loadFullData();
        log.info("模板服务初始化完成: 元数据 {} 条, 完整数据 {} 条, 分类 {} 个",
                metadataList.size(), fullDataIndex.size(), categories.size());
    }

    /**
     * 加载元数据索引文件。
     */
    private void loadMetadata() {
        try {
            ClassPathResource resource = new ClassPathResource("template-metadata.json");
            if (!resource.exists()) {
                log.warn("template-metadata.json 不存在，模板推荐功能不可用");
                return;
            }
            try (InputStream is = resource.getInputStream()) {
                metadataList = objectMapper.readValue(is, new TypeReference<List<TemplateInfo>>() {});
                log.info("加载模板元数据: {} 条", metadataList.size());

                // 提取去重的分类列表
                categories = metadataList.stream()
                        .map(TemplateInfo::getCategory)
                        .distinct()
                        .sorted()
                        .collect(Collectors.toList());
            }
        } catch (IOException e) {
            log.error("加载 template-metadata.json 失败: {}", e.getMessage());
        }
    }

    /**
     * 加载完整模板数据，按 id 建索引。
     */
    private void loadFullData() {
        try {
            ClassPathResource resource = new ClassPathResource("all_items.json");
            if (!resource.exists()) {
                log.warn("all_items.json 不存在，模板详情查询不可用");
                return;
            }
            try (InputStream is = resource.getInputStream()) {
                JsonNode array = objectMapper.readTree(is);
                Map<String, JsonNode> index = new HashMap<>();
                if (array.isArray()) {
                    for (JsonNode node : array) {
                        String id = node.path("id").asText("");
                        if (!id.isEmpty()) {
                            index.put(id, node);
                        }
                    }
                }
                fullDataIndex = index;
                log.info("加载完整模板数据: {} 条", fullDataIndex.size());
            }
        } catch (IOException e) {
            log.error("加载 all_items.json 失败: {}", e.getMessage());
        }
    }

    /**
     * 获取所有分类列表。
     */
    public List<String> getCategories() {
        return categories;
    }

    /**
     * 按分类筛选模板列表。
     *
     * @param category 分类名称，null 或空字符串返回全部
     * @param limit    返回数量上限，默认 20
     * @return 模板摘要列表（按质量评分降序）
     */
    public List<TemplateInfo> listByCategory(String category, int limit) {
        return metadataList.stream()
                .filter(t -> category == null || category.isEmpty() || category.equals(t.getCategory()))
                .limit(limit)
                .collect(Collectors.toList());
    }

    /**
     * 关键词搜索模板（匹配名称和描述）。
     *
     * @param keyword 搜索关键词
     * @param limit   返回数量上限
     * @return 匹配的模板列表
     */
    public List<TemplateInfo> search(String keyword, int limit) {
        if (keyword == null || keyword.isBlank()) {
            return listByCategory(null, limit);
        }
        String lowerKeyword = keyword.toLowerCase();
        return metadataList.stream()
                .filter(t -> {
                    String name = t.getName() != null ? t.getName().toLowerCase() : "";
                    String desc = t.getDescription() != null ? t.getDescription().toLowerCase() : "";
                    String cat = t.getCategory() != null ? t.getCategory().toLowerCase() : "";
                    return name.contains(lowerKeyword)
                            || desc.contains(lowerKeyword)
                            || cat.contains(lowerKeyword);
                })
                .limit(limit)
                .collect(Collectors.toList());
    }

    /**
     * 随机推荐指定数量的高质量模板。
     * 从质量评分 top 50% 中随机选取，保证推荐质量。
     *
     * @param count 推荐数量
     * @return 随机推荐的模板列表
     */
    public List<TemplateInfo> recommend(int count) {
        if (metadataList.isEmpty()) {
            return Collections.emptyList();
        }
        // 从前 50% 高质量模板中随机选取
        int pool = Math.max(count * 3, metadataList.size() / 2);
        List<TemplateInfo> candidates = metadataList.subList(0, Math.min(pool, metadataList.size()));
        List<TemplateInfo> shuffled = new ArrayList<>(candidates);
        Collections.shuffle(shuffled);
        return shuffled.subList(0, Math.min(count, shuffled.size()));
    }

    /**
     * 根据 id 获取模板完整详情（含 sourceCode）。
     *
     * @param id 模板 id
     * @return 模板详情，不存在时返回 Optional.empty()
     */
    public Optional<TemplateDetail> getDetail(String id) {
        JsonNode node = fullDataIndex.get(id);
        if (node == null) {
            return Optional.empty();
        }

        // 先从元数据中获取摘要信息
        TemplateInfo meta = metadataList.stream()
                .filter(t -> id.equals(t.getId()))
                .findFirst()
                .orElse(null);

        TemplateDetail detail = new TemplateDetail();
        detail.setId(id);
        detail.setName(node.path("name").asText(""));
        detail.setDescription(node.path("description").asText(""));
        detail.setPrompt(node.path("prompt").asText(""));
        detail.setSourceCode(node.path("sourceCode").asText(""));

        // 从元数据补充分类和情绪信息
        if (meta != null) {
            detail.setCategory(meta.getCategory());
            detail.setEmotion(meta.getEmotion());
            detail.setWidth(meta.getWidth());
            detail.setHeight(meta.getHeight());
            detail.setColors(meta.getColors());
            detail.setQuality(meta.getQuality());
        }

        return Optional.of(detail);
    }

    /**
     * 模板服务是否可用（数据已加载）。
     */
    public boolean isAvailable() {
        return !metadataList.isEmpty();
    }
}
