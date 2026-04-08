package com.seede.llm;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 系统提示词管理器
 *
 * <p>负责从 classpath 中加载提示词模板文件（位于 resources/prompts/ 目录），
 * 替换模板变量后返回最终提示词字符串，并通过内存缓存避免重复磁盘 IO。</p>
 *
 * <p>支持的模板文件（白名单校验）：</p>
 * <ul>
 *   <li>poster-generate.md — 初次生成海报的提示词，变量：{{width}}、{{height}}</li>
 *   <li>poster-chat.md — 对话优化海报的提示词，变量：{{width}}、{{height}}、{{canvasState}}</li>
 *   <li>poster-roll.md — 元素重新生成的提示词，变量：{{width}}、{{height}}</li>
 * </ul>
 *
 * <p>安全说明：模板名称通过 {@link #ALLOWED_TEMPLATES} 白名单校验，
 * 防止路径遍历攻击（如 "../../../etc/passwd"）。
 * 变量值中的 {{ 和 }} 会被转义，防止用户输入污染其他占位符。</p>
 *
 * <p>缓存策略：使用 {@link ConcurrentHashMap} 线程安全地缓存已加载的模板原文，
 * 应用生命周期内模板只从磁盘读取一次。</p>
 */
@Component
public class SystemPromptManager {

    private static final Logger log = LoggerFactory.getLogger(SystemPromptManager.class);

    /** 允许加载的提示词模板文件名白名单，防止路径遍历攻击 */
    private static final Set<String> ALLOWED_TEMPLATES = Set.of(
            "poster-generate.md", "poster-chat.md", "poster-roll.md",
            "image-prompt.md", "poster-analyze.md"
    );

    /** 模板内容缓存：templateName → 原始模板文本（未替换变量） */
    private final Map<String, String> cache = new ConcurrentHashMap<>();

    /**
     * 加载并渲染提示词模板。
     *
     * <p>首次调用会从 classpath 读取文件并缓存；后续调用直接使用缓存。
     * 变量替换使用 {{variableName}} 语法。</p>
     *
     * @param templateName 模板文件名（必须在 ALLOWED_TEMPLATES 白名单内）
     * @param variables    模板变量键值对，键对应模板中的 {{key}} 占位符
     * @return 替换完所有变量后的最终提示词字符串
     * @throws IllegalArgumentException 若 templateName 不在白名单内
     * @throws RuntimeException         若模板文件不存在或读取失败
     */
    public String loadPrompt(String templateName, Map<String, String> variables) {
        log.debug("加载提示词模板: {}, 变量数量: {}", templateName, variables.size());

        // 从缓存获取模板原文（若未缓存则触发磁盘读取）
        String template = cache.computeIfAbsent(templateName, name -> {
            log.info("模板 '{}' 未命中缓存，从 classpath 加载", name);
            return readTemplate(name);
        });

        // 依次替换所有模板变量
        // 变量值先转义其中的 {{ / }}，防止用户输入（如 canvasState）污染其他占位符
        String result = template;
        for (Map.Entry<String, String> entry : variables.entrySet()) {
            String value = entry.getValue() != null
                    ? entry.getValue().replace("{{", "{ {").replace("}}", "} }")
                    : "";
            result = result.replace("{{" + entry.getKey() + "}}", value);
            log.trace("替换变量 '{}', 值长度: {} 字符", entry.getKey(),
                    entry.getValue() != null ? entry.getValue().length() : 0);
        }

        log.debug("提示词渲染完成: {}, 最终长度: {} 字符", templateName, result.length());
        return result;
    }

    /**
     * 从 classpath 读取模板文件原文。
     *
     * <p>此方法仅在缓存未命中时调用，通过 ALLOWED_TEMPLATES 白名单
     * 防止加载白名单之外的任意文件。</p>
     *
     * @param name 模板文件名
     * @return 模板文件的完整文本内容
     * @throws IllegalArgumentException 若文件名不在白名单内
     * @throws IllegalStateException    若模板文件内容为空
     * @throws RuntimeException         若文件读取发生 IO 异常
     */
    private String readTemplate(String name) {
        // 白名单校验：只允许加载已知的提示词文件，防止路径遍历
        if (!ALLOWED_TEMPLATES.contains(name)) {
            log.error("拒绝加载非白名单模板: {}", name);
            throw new IllegalArgumentException("不允许的模板名称: " + name);
        }

        try {
            log.debug("从 classpath 读取模板文件: prompts/{}", name);
            ClassPathResource resource = new ClassPathResource("prompts/" + name);
            String content = resource.getContentAsString(StandardCharsets.UTF_8);

            // 校验文件内容非空，避免使用空模板生成无意义请求
            if (content == null || content.isBlank()) {
                log.error("模板文件为空: {}", name);
                throw new IllegalStateException("模板文件为空: " + name);
            }

            log.info("模板文件读取成功: {}, 大小: {} 字符", name, content.length());
            return content;
        } catch (IOException e) {
            log.error("读取模板文件失败: {}", name, e);
            throw new RuntimeException("Failed to load prompt template: " + name, e);
        }
    }
}
