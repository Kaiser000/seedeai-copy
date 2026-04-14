package com.seede.model.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/**
 * 模板摘要信息 DTO
 *
 * <p>用于模板列表/推荐接口返回，不包含完整 sourceCode（避免传输过大）。
 * 前端用此信息展示模板卡片，用户选择后再通过 id 获取完整代码。</p>
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public class TemplateInfo {

    /** 模板唯一标识 */
    private String id;

    /** 模板名称 */
    private String name;

    /** 模板描述 */
    private String description;

    /** 分类（如 电商产品、健康医疗、旅游行程 等） */
    private String category;

    /** 情绪类型（如 高端奢华、紧急促销、温暖治愈 等） */
    private String emotion;

    /** 画布宽度 */
    private int width;

    /** 画布高度 */
    private int height;

    /** 主要色彩（HEX 值数组） */
    private String[] colors;

    /** 质量评分（内部排序用） */
    private int quality;

    // --- 构造器 ---

    public TemplateInfo() {}

    // --- Getter / Setter ---

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }

    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }

    public String getCategory() { return category; }
    public void setCategory(String category) { this.category = category; }

    public String getEmotion() { return emotion; }
    public void setEmotion(String emotion) { this.emotion = emotion; }

    public int getWidth() { return width; }
    public void setWidth(int width) { this.width = width; }

    public int getHeight() { return height; }
    public void setHeight(int height) { this.height = height; }

    public String[] getColors() { return colors; }
    public void setColors(String[] colors) { this.colors = colors; }

    public int getQuality() { return quality; }
    public void setQuality(int quality) { this.quality = quality; }
}
