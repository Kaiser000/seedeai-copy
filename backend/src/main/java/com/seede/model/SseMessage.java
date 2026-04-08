package com.seede.model;

/**
 * SSE（Server-Sent Events）消息载体
 *
 * <p>所有从后端推送到前端的 SSE 事件均使用此类序列化为 JSON。
 * 前端根据 {@code type} 字段判断事件类型并执行对应的 UI 更新逻辑。</p>
 *
 * <p>事件类型定义：</p>
 * <ul>
 *   <li>{@code thinking} — 处理中状态提示，content 为中文状态描述（如"正在分析需求..."）</li>
 *   <li>{@code code_chunk} — LLM 生成的 JSX 代码片段，前端应追加到代码缓冲区实时渲染</li>
 *   <li>{@code complete} — 生成完毕，content 为完整的 JSX 代码字符串</li>
 *   <li>{@code error} — 发生错误，content 为用户可读的错误描述，
 *       {@code retryable=true} 时前端可提供重试按钮</li>
 * </ul>
 *
 * <p>典型事件序列：</p>
 * <pre>
 * thinking("正在分析设计需求...")
 * code_chunk("import React...")
 * code_chunk("const Poster = () =>...")
 * ...
 * complete("import React...(完整JSX)")
 * </pre>
 */
public class SseMessage {

    /** 事件类型：thinking | code_chunk | complete | error */
    private String type;

    /** 事件内容：状态描述文字 / 代码片段 / 完整代码 / 错误信息 */
    private String content;

    /**
     * 仅在 type=error 时使用，指示前端是否可以重试此操作。
     * {@code true} 表示属于临时性错误（如网络超时），可重试；
     * {@code false} 表示属于永久性错误（如配置错误），重试无意义。
     */
    private Boolean retryable;

    /** Jackson 反序列化使用的无参构造器 */
    public SseMessage() {}

    public SseMessage(String type, String content) {
        this.type = type;
        this.content = content;
    }

    public SseMessage(String type, String content, Boolean retryable) {
        this.type = type;
        this.content = content;
        this.retryable = retryable;
    }

    /**
     * 创建 thinking 事件，通知前端当前处理步骤。
     *
     * @param content 处理步骤描述（如"正在分析设计需求..."）
     */
    public static SseMessage thinking(String content) {
        return new SseMessage("thinking", content);
    }

    /**
     * 创建 code_chunk 事件，携带 LLM 实时生成的代码片段。
     *
     * @param content 代码片段（可能是半个标签或不完整的语句，前端应追加显示）
     */
    public static SseMessage codeChunk(String content) {
        return new SseMessage("code_chunk", content);
    }

    /**
     * 创建 complete 事件，携带生成完毕的完整 JSX 代码。
     *
     * @param content 完整的 React/Tailwind JSX 代码字符串
     */
    public static SseMessage complete(String content) {
        return new SseMessage("complete", content);
    }

    /**
     * 创建 code_complete 事件，携带代码生成阶段完成的完整 JSX 代码。
     * 此事件表示代码已生成完毕，但后续可能还有图片生成等阶段。
     *
     * @param content 完整的 React/Tailwind JSX 代码字符串（含占位图 URL）
     */
    public static SseMessage codeComplete(String content) {
        return new SseMessage("code_complete", content);
    }

    /**
     * 创建 image_analyzing 事件，通知前端正在分析海报中的图片需求。
     *
     * @param content 分析描述（如"检测到 3 张图片需要生成"）
     */
    public static SseMessage imageAnalyzing(String content) {
        return new SseMessage("image_analyzing", content);
    }

    /**
     * 创建 image_generating 事件，通知前端正在生成某张图片。
     *
     * @param content 生成描述（如"正在生成第 1 张图片：自然风景背景"）
     */
    public static SseMessage imageGenerating(String content) {
        return new SseMessage("image_generating", content);
    }

    /**
     * 创建 image_complete 事件，通知前端某张图片已生成完毕。
     *
     * @param content JSON 格式的图片信息（包含 index、url、prompt）
     */
    public static SseMessage imageComplete(String content) {
        return new SseMessage("image_complete", content);
    }

    /**
     * 创建 analysis_chunk 事件，携带需求分析阶段的流式文本片段。
     *
     * @param content 分析文本片段（如设计思路、配色方案等）
     */
    public static SseMessage analysisChunk(String content) {
        return new SseMessage("analysis_chunk", content);
    }

    /**
     * 创建 analysis_complete 事件，标记需求分析阶段完成。
     *
     * @param content 完整的分析文本
     */
    public static SseMessage analysisComplete(String content) {
        return new SseMessage("analysis_complete", content);
    }

    /**
     * 创建 layout_complete 事件，携带页面布局阶段解析出的元素列表。
     *
     * @param content JSON 格式的元素列表（如 {@code {"elements":[{"type":"text","label":"标题"}]}}）
     */
    public static SseMessage layoutComplete(String content) {
        return new SseMessage("layout_complete", content);
    }

    /**
     * 创建 error 事件，通知前端发生错误。
     *
     * @param content   用户可读的错误描述
     * @param retryable 是否为可重试错误（true=网络/超时等临时错误；false=配置/解析等永久错误）
     */
    public static SseMessage error(String content, boolean retryable) {
        return new SseMessage("error", content, retryable);
    }

    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public Boolean getRetryable() { return retryable; }
    public void setRetryable(Boolean retryable) { this.retryable = retryable; }
}
