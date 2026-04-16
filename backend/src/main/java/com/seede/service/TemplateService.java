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

    /** 随机数生成器 — 用于 RAG 评分扰动和池内抽样，保证每次请求结果多样 */
    private final Random random = new Random();

    /** 元数据列表（按 quality 降序），用于列表/搜索 */
    private List<TemplateInfo> metadataList = Collections.emptyList();

    /** 完整数据索引（id → JsonNode），用于按需获取 sourceCode */
    private Map<String, JsonNode> fullDataIndex = Collections.emptyMap();

    /** 分类列表缓存 */
    private List<String> categories = Collections.emptyList();

    /** 板式库（layout-patterns.json） */
    private List<JsonNode> layoutPatterns = Collections.emptyList();

    /** 情绪库（emotion-exemplars.json） */
    private List<JsonNode> emotionExemplars = Collections.emptyList();

    /** 配色库（color-palettes.json） */
    private List<JsonNode> colorPalettes = Collections.emptyList();

    /** 手法库（technique-snippets.json） */
    private List<JsonNode> techniqueSnippets = Collections.emptyList();

    /**
     * 启动时加载模板数据和四大库到内存。
     * 如果文件缺失不影响主流程启动，仅日志警告。
     */
    @PostConstruct
    public void init() {
        loadMetadata();
        loadFullData();
        loadLibraries();
        log.info("模板服务初始化完成: 元数据 {} 条, 完整数据 {} 条, 分类 {} 个, 板式 {} 条, 情绪 {} 条, 配色 {} 条, 手法 {} 条",
                metadataList.size(), fullDataIndex.size(), categories.size(),
                layoutPatterns.size(), emotionExemplars.size(), colorPalettes.size(),
                techniqueSnippets.size());
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
     * 加载三大库文件（板式库、情绪库、配色库）。
     * 这些由离线脚本 scripts/analyze-templates.js 从全量模板中预提取生成。
     * 缺失时不影响主流程，但会降低生成的风格多样性。
     */
    private void loadLibraries() {
        layoutPatterns = loadJsonArray("layout-patterns.json");
        emotionExemplars = loadJsonArray("emotion-exemplars.json");
        colorPalettes = loadJsonArray("color-palettes.json");
        techniqueSnippets = loadJsonArray("technique-snippets.json");
    }

    /** 加载 classpath 下的 JSON 数组文件，缺失时返回空列表 */
    private List<JsonNode> loadJsonArray(String filename) {
        try {
            ClassPathResource resource = new ClassPathResource(filename);
            if (!resource.exists()) {
                log.warn("{} 不存在，对应的库功能不可用", filename);
                return Collections.emptyList();
            }
            try (InputStream is = resource.getInputStream()) {
                JsonNode array = objectMapper.readTree(is);
                if (array.isArray()) {
                    List<JsonNode> list = new ArrayList<>();
                    for (JsonNode node : array) list.add(node);
                    log.info("加载 {}: {} 条", filename, list.size());
                    return list;
                }
            }
        } catch (IOException e) {
            log.error("加载 {} 失败: {}", filename, e.getMessage());
        }
        return Collections.emptyList();
    }

    // ═══════════════════════════════════════════════════════════════
    // 库查询接口（供 PosterGenerateService 注入到 enriched prompt）
    // ═══════════════════════════════════════════════════════════════

    /**
     * 按 format + topLayout + 特征匹配最相关的板式模式。
     * 返回 JSON 字符串，直接可注入到 prompt 中。
     *
     * @param format    长图/常规/方形
     * @param category  分类（用于二级匹配）
     * @param count     返回数量
     * @return 匹配的板式 JSON 列表
     */
    public List<JsonNode> getLayoutPatterns(String format, String category, int count) {
        if (layoutPatterns.isEmpty()) return Collections.emptyList();

        // 打分：format 精确匹配 100 分，category 包含匹配 30 分，frequency 加权
        List<Map.Entry<JsonNode, Integer>> scored = new ArrayList<>();
        for (JsonNode p : layoutPatterns) {
            int score = 0;
            if (format != null && format.equals(p.path("format").asText(""))) score += 100;
            if (category != null && p.path("compatibleCategories").toString().contains(category)) score += 30;
            score += p.path("frequency").asInt(0); // 高频板式优先
            score += random.nextInt(21); // 随机扰动保证多样性
            scored.add(Map.entry(p, score));
        }

        scored.sort((a, b) -> b.getValue() - a.getValue());

        // 从 top pool 中随机选
        int poolSize = Math.min(count * 4, scored.size());
        List<Map.Entry<JsonNode, Integer>> pool = new ArrayList<>(scored.subList(0, poolSize));
        Collections.shuffle(pool);
        return pool.stream().limit(count).map(Map.Entry::getKey).collect(Collectors.toList());
    }

    /**
     * 按情绪名查找情绪库条目。
     *
     * @param emotion 情绪名（如 "高端奢华"）
     * @return 匹配的情绪条目，未找到时返回 null
     */
    public JsonNode getEmotionExemplar(String emotion) {
        if (emotion == null || emotionExemplars.isEmpty()) return null;
        String cleaned = emotion.replaceAll("[/·、，,\\s]", "");
        for (JsonNode e : emotionExemplars) {
            String emo = e.path("emotion").asText("");
            if (cleaned.contains(emo) || emo.contains(cleaned)) return e;
        }
        return null;
    }

    /** 标记为"必选"的手法标签 — 带有这些 tag 的手法优先注入，确保高级背景、圆角容器、
     *  时间轴等关键手法不被高频池淹没（新增手法 frequency=0 会被阈值过滤，通过 tag 保底）。 */
    private static final Set<String> ESSENTIAL_TAGS = Set.of("background", "premium", "layout", "timeline");

    /**
     * 获取设计手法片段，采用双池策略保证关键手法覆盖：
     * <ul>
     *   <li>Pool 1 — 必选池：带有 {@link #ESSENTIAL_TAGS} 标签的手法，至少注入 2 条</li>
     *   <li>Pool 2 — 高频池：频率 ≥ 15% 的模板级手法，填满剩余槽位</li>
     * </ul>
     *
     * @param count 返回数量（建议 6-10）
     * @return 混合的手法列表
     */
    public List<JsonNode> getTechniqueSnippets(int count) {
        if (techniqueSnippets.isEmpty()) return Collections.emptyList();

        // 分离两个池
        List<JsonNode> essentialPool = new ArrayList<>();
        List<JsonNode> highFreqPool = new ArrayList<>();
        int threshold = templates_15pct_threshold();

        for (JsonNode t : techniqueSnippets) {
            boolean isEssential = false;
            JsonNode tags = t.path("tags");
            if (tags.isArray()) {
                for (JsonNode tag : tags) {
                    if (ESSENTIAL_TAGS.contains(tag.asText(""))) {
                        isEssential = true;
                        break;
                    }
                }
            }
            if (isEssential) {
                essentialPool.add(t);
            } else if (t.path("frequency").asInt(0) >= threshold) {
                highFreqPool.add(t);
            }
        }

        // 从必选池随机取 2 条（不足则全取）
        Collections.shuffle(essentialPool);
        int essentialCount = Math.min(2, Math.min(essentialPool.size(), count));
        List<JsonNode> result = new ArrayList<>(essentialPool.subList(0, essentialCount));

        // 从高频池随机填满剩余槽位
        int remaining = count - result.size();
        if (remaining > 0 && !highFreqPool.isEmpty()) {
            Collections.shuffle(highFreqPool);
            result.addAll(highFreqPool.subList(0, Math.min(remaining, highFreqPool.size())));
        }

        // 兜底：如果两个池合计不够 count，从全量列表补充
        if (result.size() < count) {
            Set<String> usedIds = new HashSet<>();
            for (JsonNode r : result) usedIds.add(r.path("id").asText(""));
            for (JsonNode t : techniqueSnippets) {
                if (result.size() >= count) break;
                if (!usedIds.contains(t.path("id").asText(""))) {
                    result.add(t);
                    usedIds.add(t.path("id").asText(""));
                }
            }
        }

        log.debug("手法注入: essential={}, highFreq={}, total={}",
                essentialCount, result.size() - essentialCount, result.size());
        return result;
    }

    /** 15% 的模板数量阈值 */
    private int templates_15pct_threshold() {
        return Math.max(1, (int) (metadataList.size() * 0.15));
    }

    /**
     * 按配色策略 + 色温匹配配色方案。
     *
     * @param strategy    配色策略（monochromatic/complementary/split-complementary/analogous），可为空
     * @param isDarkTheme 是否深色主题
     * @param count       返回数量
     * @return 匹配的配色方案列表
     */
    public List<JsonNode> getColorPalettes(String strategy, boolean isDarkTheme, int count) {
        if (colorPalettes.isEmpty()) return Collections.emptyList();

        String theme = isDarkTheme ? "dark" : "light";
        List<JsonNode> matched = new ArrayList<>();
        List<JsonNode> fallback = new ArrayList<>();

        for (JsonNode p : colorPalettes) {
            boolean themeMatch = theme.equals(p.path("theme").asText(""));
            boolean strategyMatch = strategy != null && strategy.equals(p.path("strategy").asText(""));

            if (strategyMatch && themeMatch) matched.add(p);
            else if (themeMatch) fallback.add(p);
        }

        // 优先返回策略+主题精确匹配，不够用 fallback 补
        List<JsonNode> result = new ArrayList<>(matched);
        if (result.size() < count) {
            Collections.shuffle(fallback);
            for (JsonNode f : fallback) {
                if (result.size() >= count) break;
                result.add(f);
            }
        }
        if (result.size() > count) {
            Collections.shuffle(result);
            result = result.subList(0, count);
        }

        return result;
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
     * <p>评分策略（加权打分 + 随机扰动 + 分类去重保证多样性）：</p>
     * <ul>
     *   <li>画布格式匹配（长图/常规/方形）：最高权重 100 分</li>
     *   <li>情绪模糊匹配（"高端/奢华" ↔ "高端奢华"）：50 分</li>
     *   <li>场景/分类关键词匹配：30 分</li>
     *   <li>质量分加权：直接加 quality 值（通常 9-10）</li>
     *   <li>随机扰动：±20 分，打破得分相近时的固定排序</li>
     * </ul>
     *
     * <p>从扩大的 top pool（count×8）中抽样，并对返回结果做分类去重：
     * 2 条样本尽量来自不同 category，避免风格同质化。</p>
     *
     * @param scene   分析阶段输出的 gene.scene（如 "社交媒体长图" / "促销/电商"），可为空
     * @param emotion 分析阶段输出的 gene.emotion（如 "高端/奢华"），可为空
     * @param width   目标画布宽度
     * @param height  目标画布高度
     * @param count   需要返回的样本数量（建议 1-3）
     * @return 匹配的模板详情列表（含完整 sourceCode），经过 shuffle + 分类去重保证多样性
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

        // 对所有模板打分（含随机扰动，打破得分相近时的固定排序）
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

            // 5. 随机扰动（±20），让得分接近的模板每次排序不同
            score += random.nextInt(41) - 20;

            scored.add(new ScoredTemplate(t, score));
        }

        // 按得分降序
        scored.sort((a, b) -> Integer.compare(b.score, a.score));

        // 从扩大的 top pool（count×8）中抽样，比之前的 count×4 覆盖更多候选
        int poolSize = Math.min(Math.max(count * 8, 16), scored.size());
        List<ScoredTemplate> topPool = new ArrayList<>(scored.subList(0, poolSize));
        Collections.shuffle(topPool);

        // 分类去重选择：尽量让返回的样本来自不同 category，避免风格同质化
        List<TemplateDetail> result = selectWithCategoryDiversity(topPool, count);

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
     *   <li>随机扰动：±20 分，打破得分相近时的固定排序</li>
     * </ul>
     *
     * <p>对于新增情绪（如 复古怀旧、赛博未来 等，模板库中暂无对应标签），
     * 评分自动退化为 category+format 匹配，配色和风格差异由 prompt 中的 gene 参数驱动。</p>
     *
     * <p>从扩大的 top pool（count×8）中抽样，并做分类去重保证多样性。</p>
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

            // 随机扰动（±20），让得分接近的模板每次排序不同
            score += random.nextInt(41) - 20;

            scored.add(new ScoredTemplate(t, score));
        }

        scored.sort((a, b) -> Integer.compare(b.score, a.score));

        // 扩大 top pool（count×8），比之前的 count×4 覆盖更多候选
        int qualifiedCount = (int) scored.stream().filter(s -> s.score >= 100).count();
        int poolSize = Math.max(count * 8, Math.min(qualifiedCount, 20));
        poolSize = Math.min(poolSize, scored.size());
        if (poolSize <= 0) {
            return Collections.emptyList();
        }

        List<ScoredTemplate> topPool = new ArrayList<>(scored.subList(0, poolSize));
        Collections.shuffle(topPool);

        // 分类去重选择：尽量让返回的样本来自不同 category，避免风格同质化
        List<TemplateDetail> result = selectWithCategoryDiversity(topPool, count);

        log.info("结构化模板检索完成: 返回 {} 条样本, ids={}",
                result.size(),
                result.stream().map(TemplateDetail::getId).collect(Collectors.toList()));
        return result;
    }

    /**
     * 从候选池中选择模板，保证分类多样性。
     *
     * <p>策略：优先选择与已选模板 category 不同的候选。当所有候选 category 都已出现过时，
     * 退化为按顺序选择（此时 pool 已经 shuffle 过，等效随机）。</p>
     *
     * <p>例如：pool 中有 [综合海报A, 综合海报B, 电商产品C, 品牌故事D]，count=2，
     * 选中 A（综合海报）后，会跳过 B（同分类），优先选 C 或 D。</p>
     *
     * @param pool  已 shuffle 的候选池
     * @param count 需要返回的数量
     * @return 分类尽量不重复的模板详情列表
     */
    private List<TemplateDetail> selectWithCategoryDiversity(List<ScoredTemplate> pool, int count) {
        List<TemplateDetail> result = new ArrayList<>();
        Set<String> usedCategories = new HashSet<>();

        // 第一轮：优先选不同 category 的模板
        for (ScoredTemplate s : pool) {
            if (result.size() >= count) break;
            String cat = s.info.getCategory() != null ? s.info.getCategory() : "";
            if (usedCategories.contains(cat)) continue;
            Optional<TemplateDetail> detail = getDetail(s.info.getId());
            if (detail.isPresent()) {
                result.add(detail.get());
                usedCategories.add(cat);
            }
        }

        // 第二轮：如果不同 category 的模板不够 count 个，允许重复 category
        if (result.size() < count) {
            Set<String> usedIds = result.stream()
                    .map(TemplateDetail::getId)
                    .collect(Collectors.toSet());
            for (ScoredTemplate s : pool) {
                if (result.size() >= count) break;
                if (usedIds.contains(s.info.getId())) continue;
                Optional<TemplateDetail> detail = getDetail(s.info.getId());
                if (detail.isPresent()) {
                    result.add(detail.get());
                    usedIds.add(s.info.getId());
                }
            }
        }

        return result;
    }

    /**
     * 按画布宽高比分类格式。长图是小红书/公众号常见的 1080x3688 长页，
     * 方形适合 Instagram 类社交图，常规是标准竖版海报 1080x1920。
     * height=0 表示自适应长图模式，直接归入"长图"。
     */
    private String classifyFormat(int width, int height) {
        if (width <= 0) return "常规";
        // height=0 → 自适应长图模式
        if (height <= 0) return "长图";
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
