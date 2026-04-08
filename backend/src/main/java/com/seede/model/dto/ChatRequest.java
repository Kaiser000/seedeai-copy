package com.seede.model.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Positive;

import java.util.List;

/**
 * 对话优化海报请求 DTO
 *
 * <p>对应接口：POST /api/posters/chat</p>
 *
 * <p>字段说明：</p>
 * <ul>
 *   <li>{@code canvasState}  — 当前海报的完整 JSX 代码，注入提示词模板供 LLM 理解上下文</li>
 *   <li>{@code userMessage}  — 用户本轮的自然语言修改指令，必填</li>
 *   <li>{@code chatHistory}  — 历史对话列表（可选），实现多轮连续修改</li>
 *   <li>{@code width}        — 画布宽度（像素）</li>
 *   <li>{@code height}       — 画布高度（像素）</li>
 * </ul>
 */
public class ChatRequest {

    /**
     * 当前画布的完整 JSX 代码，可为 null（首次对话时无画布状态）
     * 服务层对 null 值做了兜底处理（替换为空字符串）
     */
    private String canvasState;

    /** 用户本轮修改指令，不能为空 */
    @NotBlank(message = "userMessage 不能为空")
    private String userMessage;

    /**
     * 历史对话列表（可选），每条消息包含 role 和 content。
     * role 仅允许 "user" 或 "assistant"，服务层会过滤非法 role 以防注入攻击。
     */
    private List<ChatMessageDto> chatHistory;

    /** 画布宽度（像素），必须为正整数 */
    @Positive(message = "width 必须为正整数")
    private int width;

    /** 画布高度（像素），必须为正整数 */
    @Positive(message = "height 必须为正整数")
    private int height;

    /** 指定使用的 LLM 模型名称（可选）。为空时使用后端默认配置的模型 */
    private String modelName;

    public String getCanvasState() { return canvasState; }
    public void setCanvasState(String canvasState) { this.canvasState = canvasState; }
    public String getUserMessage() { return userMessage; }
    public void setUserMessage(String userMessage) { this.userMessage = userMessage; }
    public List<ChatMessageDto> getChatHistory() { return chatHistory; }
    public void setChatHistory(List<ChatMessageDto> chatHistory) { this.chatHistory = chatHistory; }
    public int getWidth() { return width; }
    public void setWidth(int width) { this.width = width; }
    public int getHeight() { return height; }
    public void setHeight(int height) { this.height = height; }
    public String getModelName() { return modelName; }
    public void setModelName(String modelName) { this.modelName = modelName; }

    /**
     * 单条历史对话消息
     *
     * <p>role 取值：</p>
     * <ul>
     *   <li>{@code "user"}      — 用户消息</li>
     *   <li>{@code "assistant"} — 模型回复</li>
     * </ul>
     */
    public static class ChatMessageDto {
        private String role;
        private String content;

        public String getRole() { return role; }
        public void setRole(String role) { this.role = role; }
        public String getContent() { return content; }
        public void setContent(String content) { this.content = content; }
    }
}
