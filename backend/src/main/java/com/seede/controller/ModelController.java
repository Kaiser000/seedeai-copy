package com.seede.controller;

import com.seede.config.LlmConfig;
import com.seede.config.OpenRouterConfig;
import com.seede.model.dto.ModelInfo;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.ArrayList;
import java.util.List;

/**
 * 模型列表接口
 *
 * <p>返回可用的 LLM 模型列表，供前端模型选择器使用。</p>
 * <ul>
 *   <li>始终包含当前配置的默认模型（标记为 isDefault=true）</li>
 *   <li>当 OpenRouter 已配置时，额外返回 OpenRouter 上的热门模型</li>
 * </ul>
 */
@RestController
@RequestMapping("/api")
public class ModelController {

    private static final Logger log = LoggerFactory.getLogger(ModelController.class);

    private final LlmConfig llmConfig;
    private final OpenRouterConfig openRouterConfig;

    public ModelController(LlmConfig llmConfig, OpenRouterConfig openRouterConfig) {
        this.llmConfig = llmConfig;
        this.openRouterConfig = openRouterConfig;
    }

    /**
     * 获取可用模型列表
     *
     * <p>GET /api/models</p>
     *
     * @return 模型信息列表，第一个元素始终是当前默认模型
     */
    @GetMapping("/models")
    public List<ModelInfo> listModels() {
        log.debug("获取可用模型列表");

        List<ModelInfo> models = new ArrayList<>();

        // 始终将当前配置的默认模型作为第一个选项
        models.add(new ModelInfo(
                llmConfig.getModelName(),
                llmConfig.getModelName() + "（默认）",
                "默认",
                true
        ));

        // 仅在 OpenRouter 已配置时返回额外模型
        if (openRouterConfig.isEnabled()) {
            log.debug("OpenRouter 已启用，添加 OpenRouter 模型列表");

            // ── Anthropic Claude 系列 ──
            models.add(new ModelInfo("anthropic/claude-sonnet-4.6", "Claude Sonnet 4.6", "Anthropic", false));
            models.add(new ModelInfo("anthropic/claude-opus-4.6", "Claude Opus 4.6", "Anthropic", false));

            // ── OpenAI GPT 系列 ──
            models.add(new ModelInfo("openai/gpt-5.4", "GPT-5.4", "OpenAI", false));
            models.add(new ModelInfo("openai/gpt-5.4-mini", "GPT-5.4 Mini", "OpenAI", false));
            models.add(new ModelInfo("openai/gpt-5.4-nano", "GPT-5.4 Nano", "OpenAI", false));

            // ── Google Gemini 系列 ──
            models.add(new ModelInfo("google/gemini-3.1-pro-preview", "Gemini 3.1 Pro", "Google", false));
            models.add(new ModelInfo("google/gemini-3-flash-preview", "Gemini 3 Flash", "Google", false));

            // ── xAI Grok 系列 ──
            models.add(new ModelInfo("x-ai/grok-4.20", "Grok 4.20", "xAI", false));

            // ── Qwen 通义千问系列 ──
            models.add(new ModelInfo("qwen/qwen3.6-plus", "Qwen3.6 Plus", "Qwen", false));
            models.add(new ModelInfo("qwen/qwen3.5-flash-02-23", "Qwen3.5 Flash", "Qwen", false));
            models.add(new ModelInfo("qwen/qwen3-max-thinking", "Qwen3 Max Thinking", "Qwen", false));

            // ── Z.ai GLM 系列（通过 OpenRouter） ──
            models.add(new ModelInfo("z-ai/glm-5.1", "GLM 5.1", "Z.ai", false));
            models.add(new ModelInfo("z-ai/glm-5", "GLM 5", "Z.ai", false));
            models.add(new ModelInfo("z-ai/glm-5-turbo", "GLM 5 Turbo", "Z.ai", false));
            models.add(new ModelInfo("z-ai/glm-4.7", "GLM 4.7", "Z.ai", false));
            models.add(new ModelInfo("z-ai/glm-4.7-flash", "GLM 4.7 Flash", "Z.ai", false));

            // ── Mistral 系列 ──
            models.add(new ModelInfo("mistralai/mistral-small-2603", "Mistral Small 4", "Mistral", false));
        }

        log.info("返回模型列表: {} 个模型（OpenRouter {}）",
                models.size(), openRouterConfig.isEnabled() ? "已启用" : "未启用");
        return models;
    }
}
