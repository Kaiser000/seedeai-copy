package com.seede.model.dto;

/**
 * 模型信息 DTO — 供前端模型选择器使用
 *
 * <p>每个模型包含：</p>
 * <ul>
 *   <li>{@code id}       — 模型唯一标识符（如 "openai/gpt-5.4"、"glm-5"）</li>
 *   <li>{@code name}     — 人类可读的显示名称</li>
 *   <li>{@code provider} — 模型提供商（如 "OpenAI"、"Anthropic"、"默认"）</li>
 *   <li>{@code isDefault} — 是否为当前配置的默认模型</li>
 * </ul>
 */
public class ModelInfo {

    private String id;
    private String name;
    private String provider;
    private boolean isDefault;

    public ModelInfo() {}

    public ModelInfo(String id, String name, String provider, boolean isDefault) {
        this.id = id;
        this.name = name;
        this.provider = provider;
        this.isDefault = isDefault;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
    public boolean isDefault() { return isDefault; }
    public void setDefault(boolean isDefault) { this.isDefault = isDefault; }
}
