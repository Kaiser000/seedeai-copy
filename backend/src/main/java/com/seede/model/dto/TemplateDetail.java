package com.seede.model.dto;

/**
 * 模板完整详情 DTO
 *
 * <p>包含完整 sourceCode，用于用户选择模板后加载到编辑器中。
 * 继承 TemplateInfo 的所有摘要字段，额外携带原始 prompt 和完整代码。</p>
 */
public class TemplateDetail extends TemplateInfo {

    /** 生成该模板时的原始用户 prompt */
    private String prompt;

    /** 完整的 React+Tailwind JSX 源代码 */
    private String sourceCode;

    public TemplateDetail() {}

    public String getPrompt() { return prompt; }
    public void setPrompt(String prompt) { this.prompt = prompt; }

    public String getSourceCode() { return sourceCode; }
    public void setSourceCode(String sourceCode) { this.sourceCode = sourceCode; }
}
