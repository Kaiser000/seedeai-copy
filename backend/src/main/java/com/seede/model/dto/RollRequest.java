package com.seede.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

/**
 * 元素重新生成请求 DTO（Roll）
 *
 * <p>对应接口：POST /api/posters/roll</p>
 *
 * <p>字段说明：</p>
 * <ul>
 *   <li>{@code elementDescription} — 要重新生成的元素描述，必填；
 *       LLM 根据此描述生成符合整体风格的新元素</li>
 *   <li>{@code canvasContext}      — 当前完整海报的 JSX 代码（可选）；
 *       提供给 LLM 以保持新元素与整体风格一致</li>
 *   <li>{@code width}              — 画布宽度（像素）</li>
 *   <li>{@code height}             — 画布高度（像素）</li>
 * </ul>
 */
public class RollRequest {

    /** 要重新生成的元素描述，不能为空（如"标题文字"、"背景图案"） */
    @NotBlank(message = "elementDescription 不能为空")
    private String elementDescription;

    /**
     * 完整画布 JSX 代码（可选），用于提供整体风格上下文。
     * 服务层对 null 值做了兜底处理（替换为空字符串）
     */
    private String canvasContext;

    /** 画布宽度（像素），必须为正整数 */
    @Positive(message = "width 必须为正整数")
    private int width;

    /** 画布高度（像素），必须为正整数 */
    @Positive(message = "height 必须为正整数")
    private int height;

    public String getElementDescription() { return elementDescription; }
    public void setElementDescription(String elementDescription) { this.elementDescription = elementDescription; }
    public String getCanvasContext() { return canvasContext; }
    public void setCanvasContext(String canvasContext) { this.canvasContext = canvasContext; }
    public int getWidth() { return width; }
    public void setWidth(int width) { this.width = width; }
    public int getHeight() { return height; }
    public void setHeight(int height) { this.height = height; }
}
