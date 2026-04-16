package com.seede.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

/**
 * 海报生成请求 DTO
 *
 * <p>对应接口：POST /api/posters/generate</p>
 *
 * <p>字段说明：</p>
 * <ul>
 *   <li>{@code prompt}  — 用户对海报的自然语言设计描述，LLM 根据此描述生成 JSX 代码</li>
 *   <li>{@code width}   — 画布宽度（像素），注入提示词模板 {{width}} 占位符</li>
 *   <li>{@code height}  — 画布高度（像素），注入提示词模板 {{height}} 占位符</li>
 * </ul>
 */
public class GenerateRequest {

    /** 设计描述，不能为空；LLM 据此生成海报的视觉风格和内容 */
    @NotBlank(message = "prompt 不能为空")
    private String prompt;

    /** 画布宽度（像素），必须为正整数 */
    @Positive(message = "width 必须为正整数")
    private int width;

    /** 画布高度（像素）。正整数表示固定高度；0 表示自适应长图模式（高度由 LLM 自行决定） */
    @jakarta.validation.constraints.Min(value = 0, message = "height 必须 ≥ 0（0 = 自适应长图）")
    private int height;

    /** 指定使用的 LLM 模型名称（可选）。为空时使用后端默认配置的模型 */
    private String modelName;

    public String getPrompt() { return prompt; }
    public void setPrompt(String prompt) { this.prompt = prompt; }
    public int getWidth() { return width; }
    public void setWidth(int width) { this.width = width; }
    public int getHeight() { return height; }
    public void setHeight(int height) { this.height = height; }
    public String getModelName() { return modelName; }
    public void setModelName(String modelName) { this.modelName = modelName; }
}
