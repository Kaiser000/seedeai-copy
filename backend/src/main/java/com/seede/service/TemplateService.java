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

    // ═══════════════════════════════════════════════════════════════
    // RAG 风格相似模板检索（供代码生成阶段做 few-shot 参考）
    // ═══════════════════════════════════════════════════════════════

    /**
     * 按用户意图和画布尺寸检索相似的高质量模板，用作 few-shot 参考。
     *
     * <p>评分策略（加权打分 + 随机抽样保证多样性）：</p>
     * <ul>
     *   <li>画布格式匹配（长图/常规/方形）：最高权重 100 分</li>
     *   <li>情绪模糊匹配（"高端/奢华" ↔ "高端奢华"）：50 分</li>
     *   <li>场景/分类关键词匹配：30 分</li>
     *   <li>质量分加权：直接加 quality 值（通常 9-10）</li>
     * </ul>
     *
     * <p>最终从 top pool 中随机抽取 count 条，避免输入相似时总返回同样的样本，保证样式多样性。</p>
     *
     * @param scene   分析阶段输出的 gene.scene（如 "社交媒体长图" / "促销/电商"），可为空
     * @param emotion 分析阶段输出的 gene.emotion（如 "高端/奢华"），可为空
     * @param width   目标画布宽度
     * @param height  目标画布高度
     * @param count   需要返回的样本数量（建议 1-3）
     * @return 匹配的模板详情列表（含完整 sourceCode），按评分降序但经过 shuffle 保证多样性
     */
    public List<TemplateDetail> recommendSimilar(String scene, String emotion, int width, int height, int count) {
        if (metadataList.isEmpty() || count <= 0) {
            log.debug("相似模板检索跳过: metadata 为空或 count={}", count);
            return Collections.emptyList();
        }

        String targetFormat = classifyFormat(width, height);
        String normalizedEmotion = normalizeEmotion(emotion);
        String sceneLower = scene == null ? "" : scene.toLowerCase();

        log.info("相似模板检索: targetFormat={}, normalizedEmotion={}, scene={}",
                targetFormat, normalizedEmotion, scene);

        // 对所有模板打分
        List<ScoredTemplate> scored = new ArrayList<>();
        for (TemplateInfo t : metadataList) {
            int score = 0;

            // 1. 格式匹配（最重要，避免把长图参考样本喂给常规海报）
            String tFormat = classifyFormat(t.getWidth(), t.getHeight());
            if (targetFormat.equals(tFormat)) {
                score += 100;
            }

            // 2. 情绪匹配
            if (normalizedEmotion != null && normalizedEmotion.equals(t.getEmotion())) {
                score += 50;
            }

            // 3. 场景/分类关键词匹配
            String cat = t.getCategory() == null ? "" : t.getCategory().toLowerCase();
            String tName = t.getName() == null ? "" : t.getName().toLowerCase();
            if (!sceneLower.isEmpty()) {
                if (sceneLower.contains(cat) || cat.contains(sceneLower)) {
                    score += 30;
                } else if (tName.contains(sceneLower) || sceneLower.contains(tName)) {
                    score += 15;
                }
            }

            // 4. 质量加权（1-10）
            score += t.getQuality();

            scored.add(new ScoredTemplate(t, score));
        }

        // 按得分降序
        scored.sort((a, b) -> Integer.compare(b.score, a.score));

        // 从 top pool 中随机抽样，保证多样性（输入相近时不会总返回同样的 2 条）
        int poolSize = Math.min(Math.max(count * 4, 8), scored.size());
        List<ScoredTemplate> topPool = new ArrayList<>(scored.subList(0, poolSize));
        Collections.shuffle(topPool);

        List<TemplateDetail> result = new ArrayList<>();
        for (ScoredTemplate s : topPool) {
            if (result.size() >= count) break;
            Optional<TemplateDetail> detail = getDetail(s.info.getId());
            detail.ifPresent(result::add);
        }

        log.info("相似模板检索完成: 返回 {} 条样本, 样本 id={}",
                result.size(),
                result.stream().map(TemplateDetail::getId).collect(Collectors.toList()));
        return result;
    }

    /**
     * 按结构化 templateHint 检索相似模板（检索质量更高、更可控）。
     *
     * <p>相比 {@link #recommendSimilar}，本方法直接使用分析阶段 LLM 从固定词表中选出的 category/emotion/format，
     * 避免了模糊匹配。匹配策略：</p>
     * <ul>
     *   <li>完全匹配（category + emotion + format 全部一致）：300 分</li>
     *   <li>类别匹配 + 情绪匹配但格式不同：200 分</li>
     *   <li>仅类别匹配或仅情绪匹配：100 分</li>
     *   <li>仅格式匹配：50 分</li>
     *   <li>质量分加权：直接加 quality 值</li>
     * </ul>
     *
     * <p>从 top pool 中随机抽样保证多样性。若没有任何模板匹配格式，自动退化为按类别+情绪匹配的 top 样本。</p>
     *
     * @param category 固定词表中的分类，如 "电商产品"；空字符串视为不约束
     * @param emotion  固定词表中的情绪，如 "高端奢华"；空字符串视为不约束
     * @param format   固定词表中的格式：长图/常规/方形；空字符串视为不约束
     * @param count    返回的样本数量
     * @return 匹配模板的完整详情列表
     */
    public List<TemplateDetail> recommendByHint(String category, String emotion, String format, int count) {
        if (metadataList.isEmpty() || count <= 0) {
            return Collections.emptyList();
        }

        String cat = category == null ? "" : category.trim();
        String emo = emotion == null ? "" : emotion.trim();
        String fmt = format == null ? "" : format.trim();

        log.info("结构化模板检索: category={}, emotion={}, format={}", cat, emo, fmt);

        List<ScoredTemplate> scored = new ArrayList<>();
        for (TemplateInfo t : metadataList) {
            int score = 0;
            boolean catMatch = !cat.isEmpty() && cat.equals(t.getCategory());
            boolean emoMatch = !emo.isEmpty() && emo.equals(t.getEmotion());
            boolean fmtMatch = !fmt.isEmpty() && fmt.equals(classifyFormat(t.getWidth(), t.getHeight()));

            if (catMatch && emoMatch && fmtMatch) {
                score += 300;
            } else if (catMatch && emoMatch) {
                score += 200;
            } else if (catMatch || emoMatch) {
                score += 100;
            } else if (fmtMatch) {
                score += 50;
            }

            score += t.getQuality();
            scored.add(new ScoredTemplate(t, score));
        }

        scored.sort((a, b) -> Integer.compare(b.score, a.score));

        // top pool 至少取 count*4 但不超过得分 ≥100 的数量，保证质量门槛
        int qualifiedCount = (int) scored.stream().filter(s -> s.score >= 100).count();
        int poolSize = Math.max(count * 4, Math.min(qualifiedCount, 12));
        poolSize = Math.min(poolSize, scored.size());
        if (poolSize <= 0) {
            return Collections.emptyList();
        }

        List<ScoredTemplate> topPool = new ArrayList<>(scored.subList(0, poolSize));
        Collections.shuffle(topPool);

        List<TemplateDetail> result = new ArrayList<>();
        for (ScoredTemplate s : topPool) {
            if (result.size() >= count) break;
            Optional<TemplateDetail> detail = getDetail(s.info.getId());
            detail.ifPresent(result::add);
        }

        log.info("结构化模板检索完成: 返回 {} 条样本, ids={}",
                result.size(),
                result.stream().map(TemplateDetail::getId).collect(Collectors.toList()));
        return result;
    }

    /**
     * 按画布宽高比分类格式。长图是小红书/公众号常见的 1080x3688 长页，
     * 方形适合 Instagram 类社交图，常规是标准竖版海报 1080x1920。
     */
    private String classifyFormat(int width, int height) {
        if (width <= 0) return "常规";
        double ratio = (double) height / width;
        if (ratio >= 2.5) return "长图";
        if (ratio <= 1.3) return "方形";
        return "常规";
    }

    /**
     * 情绪标准化：把分析阶段的 "高端/奢华" 或 "高端 · 奢华" 映射到 metadata 里的 "高端奢华"。
     * 实现方式：去掉分隔符后与已知情绪做双向 contains 匹配。
     */
    private String normalizeEmotion(String emotion) {
        if (emotion == null || emotion.isBlank()) return null;
        String cleaned = emotion.replaceAll("[/·、，,\\s]", "");
        for (TemplateInfo t : metadataList) {
            String known = t.getEmotion();
            if (known == null || known.isBlank()) continue;
            if (cleaned.contains(known) || known.contains(cleaned)) {
                return known;
            }
        }
        return null;
    }

    /**
     * 打分用的内部结构，仅在 recommendSimilar 内使用。
     */
    private static class ScoredTemplate {
        final TemplateInfo info;
        final int score;

        ScoredTemplate(TemplateInfo info, int score) {
            this.info = info;
            this.score = score;
        }
    }
}
