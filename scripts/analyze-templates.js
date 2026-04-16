#!/usr/bin/env node
/**
 * 模板结构分析脚本 v2 — 从 324 个模板中提取大结构特征并聚类
 *
 * 输出三个库文件（写入 backend/src/main/resources/）：
 *   - layout-patterns.json  板式库
 *   - emotion-exemplars.json 情绪库
 *   - color-palettes.json   配色库
 *
 * 用法：node scripts/analyze-templates.js
 */

const fs = require("fs");
const path = require("path");

const RES_DIR = path.join(__dirname, "../backend/src/main/resources");
const allItems = JSON.parse(fs.readFileSync(path.join(RES_DIR, "all_items.json"), "utf8"));
const metadata = JSON.parse(fs.readFileSync(path.join(RES_DIR, "template-metadata.json"), "utf8"));

const metaIndex = {};
for (const m of metadata) metaIndex[m.id] = m;

console.log(`加载 ${allItems.length} 个模板, ${metadata.length} 条元数据\n`);

// ═══════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════

function hexToHSL(hex) {
  try {
    hex = hex.replace("#", "");
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    if (hex.length !== 6) return null;
    const r = parseInt(hex.substr(0, 2), 16) / 255;
    const g = parseInt(hex.substr(2, 2), 16) / 255;
    const b = parseInt(hex.substr(4, 2), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// Phase 1: 逐模板提取结构特征
// ═══════════════════════════════════════════════════════════════

function extractStructure(template) {
  const sc = template.sourceCode || "";
  const meta = metaIndex[template.id] || {};
  const width = meta.width || 1080;
  const height = meta.height || 1920;
  const ratio = height / Math.max(1, width);

  const result = {
    id: template.id,
    name: template.name || "",
    category: meta.category || "综合海报",
    emotion: meta.emotion || "专业权威",
    width, height,
    format: ratio >= 2.5 ? "长图" : ratio <= 1.3 ? "方形" : "常规",
    quality: meta.quality || 0,
    codeLength: sc.length,
    tokenPattern: null,
    sections: [],
    sectionCount: 0,
    imageCount: 0,
    topLayout: "",
    hasCardGrid: false,
    hasDataDriven: false,
    decorativePatterns: [],
    colorScheme: null,
  };

  if (!sc) return result;

  // ── Token 提取 ──────────────────────────────────────────
  // 多种写法：const colors = { ... }, const theme = { ... }
  const colorMatch = sc.match(/const\s+(?:colors|theme|palette)\s*=\s*\{([\s\S]*?)(?:\n\s*\};|\n\s*\})/);
  if (colorMatch) {
    const block = colorMatch[1];
    const pairs = [...block.matchAll(/(\w+)\s*:\s*['"]([^'"]+)['"]/g)];
    const colors = {};
    for (const p of pairs) colors[p[1]] = p[2];
    if (Object.keys(colors).length > 0) {
      result.colorScheme = colors;
      result.tokenPattern = `colors(${Object.keys(colors).length})`;
    }
  }

  const typoMatch = sc.match(/const\s+(?:typography|fonts|font)\s*=\s*\{/);
  if (typoMatch) {
    const block = sc.substring(typoMatch.index, typoMatch.index + 800);
    const levels = (block.match(/\b(?:h1|h2|h3|body|caption|numeric|title|subtitle|heading)\b\s*:/g) || []).length;
    result.tokenPattern = (result.tokenPattern || "") + `+typo(${levels})`;
  }

  // ── Section 检测（v2：多策略融合）────────────────────────
  // 优先级：<section>/<header>/<footer> 标签 > h-[Npx] 带高度的顶层容器 > 注释分隔
  const sectionTags = [...sc.matchAll(/<(section|header|footer|main)[\s>]/g)];
  const heightDivs = [...sc.matchAll(/(?:className="[^"]*h-\[(\d+)px\][^"]*"|style=\{\{[^}]*height:\s*['"](\d+)(?:px)?['"][^}]*\}\})/g)];
  const comments = [...sc.matchAll(/\{\/\*\s*(.+?)\s*\*\/\}/g)];

  // 用 section 标签 + heightDivs 来识别顶层 section
  // 简化策略：按注释分割，然后分析每段的特征
  const sectionMarkers = [];
  for (const c of comments) {
    const name = c[1].trim();
    // 跳过非 section 注释（如 "渐变背景"、"蒙版" 这类小注释）
    if (name.length < 2 || name.length > 40) continue;
    sectionMarkers.push({ pos: c.index, name });
  }

  // 对每个 section 分析其包含的内容
  for (let i = 0; i < sectionMarkers.length; i++) {
    const start = sectionMarkers[i].pos;
    const end = i + 1 < sectionMarkers.length ? sectionMarkers[i + 1].pos : Math.min(start + 2000, sc.length);
    const chunk = sc.substring(start, end);

    const role = classifySectionRole(chunk, sectionMarkers[i].name);
    const layout = detectLayout(chunk);
    const hasImg = /<img\s/.test(chunk);
    const hasGrid = /grid-cols-\d/.test(chunk);
    const hasMap = /\.map\(/.test(chunk);

    // 提取高度（如有）
    const hMatch = chunk.match(/h-\[(\d+)px\]/) || chunk.match(/height:\s*['"](\d+)/);
    const heightPx = hMatch ? parseInt(hMatch[1]) : 0;
    const heightPct = height > 0 && heightPx > 0 ? Math.round(heightPx / height * 100) : 0;

    result.sections.push({
      name: sectionMarkers[i].name,
      role,
      layout,
      heightPct,
      hasImage: hasImg,
      hasGrid,
      hasDataDriven: hasMap,
    });
  }

  result.sectionCount = result.sections.length || 1;

  // ── 顶层布局 ───────────────────────────────────────────
  const topCls = sc.match(/(?:return\s*\(\s*)?<div[^>]*className="([^"]*)"/);
  if (topCls) {
    const cls = topCls[1];
    if (cls.includes("flex-col") || cls.includes("flex flex-col")) result.topLayout = "flex-col";
    else if (cls.includes("relative")) result.topLayout = "absolute";
    else result.topLayout = "flow";
  } else {
    result.topLayout = "flow";
  }

  // ── 其他特征 ───────────────────────────────────────────
  result.imageCount = (sc.match(/<img\s/g) || []).length;
  result.hasCardGrid = /grid-cols-[23456]/.test(sc);
  result.hasDataDriven = /\.map\(/.test(sc);

  const deco = [];
  if (/h-px|h-0\.5/.test(sc)) deco.push("divider-line");
  if (/rounded-full/.test(sc) && /w-\d+\s+h-\d+/.test(sc)) deco.push("circle-badge");
  if (/bg-gradient-to-/.test(sc)) deco.push("gradient");
  if (/rotate/.test(sc)) deco.push("rotation");
  if (/tracking-wide/.test(sc)) deco.push("wide-tracking");
  if (/uppercase|textTransform/.test(sc)) deco.push("uppercase-label");
  if (/absolute/.test(sc) && /(?:top|bottom|left|right)-/.test(sc)) deco.push("absolute-element");
  result.decorativePatterns = deco;

  return result;
}

/** 根据 section 内容和注释名推断其角色 */
function classifySectionRole(code, name) {
  const lower = name.toLowerCase();
  // 名字匹配
  if (/header|头部|主视觉|hero|banner|封面/.test(lower)) return "hero";
  if (/footer|底部|联系|地址|版权/.test(lower)) return "footer";
  if (/cta|行动|二维码|qr|扫码|按钮/.test(lower)) return "cta";
  if (/亮点|特色|卖点|优势|feature/.test(lower)) return "features";
  if (/商品|产品|推荐|product/.test(lower)) return "products";
  if (/嘉宾|讲师|团队|speaker|team/.test(lower)) return "people";
  if (/时间|日程|timeline|流程|schedule/.test(lower)) return "timeline";
  if (/规则|条款|rule|notice|注意/.test(lower)) return "rules";
  if (/优惠|折扣|coupon|福利/.test(lower)) return "promotion";

  // 内容匹配
  if (/grid-cols-[234]/.test(code) && /<img\s/.test(code)) return "card-grid";
  if (/grid-cols-[234]/.test(code)) return "grid-content";
  if (/<img\s/.test(code) && /absolute.*inset-0/.test(code)) return "hero";
  if (/\.map\(/.test(code) && !/<img\s/.test(code)) return "data-list";

  return "content";
}

/** 检测代码片段的布局模式 */
function detectLayout(code) {
  const first200 = code.substring(0, 300);
  if (/grid-cols-\d/.test(first200)) {
    const m = first200.match(/grid-cols-(\d)/);
    return `grid-${m ? m[1] : "N"}col`;
  }
  if (/flex-row/.test(first200)) return "flex-row";
  if (/flex-col|flex flex-col/.test(first200)) return "flex-col";
  if (/absolute/.test(first200) && /relative/.test(first200)) return "absolute";
  return "flex-col";
}

// 分析所有模板
const structures = allItems
  .filter(t => t.sourceCode && t.sourceCode.length > 1000)
  .map(extractStructure);

console.log(`分析完成: ${structures.length} 个有效模板\n`);

// ═══════════════════════════════════════════════════════════════
// Phase 2: 板式聚类 → layout-patterns.json
// ═══════════════════════════════════════════════════════════════

function buildLayoutPatterns(structures) {
  // 粗粒度签名：format × topLayout × sectionCountBucket × 特征标记
  function signature(s) {
    const secBucket = s.sectionCount <= 3 ? "1-3" :
      s.sectionCount <= 6 ? "4-6" :
      s.sectionCount <= 10 ? "7-10" : "10+";
    const features = [];
    if (s.hasCardGrid) features.push("grid");
    if (s.imageCount >= 3) features.push("img-rich");
    if (s.hasDataDriven) features.push("data");
    return `${s.format}|${s.topLayout}|${secBucket}|${features.sort().join("+")}`;
  }

  // 按签名聚类
  const clusters = {};
  for (const s of structures) {
    const sig = signature(s);
    if (!clusters[sig]) clusters[sig] = [];
    clusters[sig].push(s);
  }

  // 转为板式对象
  const patterns = [];
  for (const [sig, templates] of Object.entries(clusters)) {
    if (templates.length < 2) continue; // 过滤低频

    const best = templates.sort((a, b) => b.quality - a.quality)[0];
    const [format, topLayout, secBucket] = sig.split("|");

    // 提取 section role 序列的最常见模式
    const roleSeqs = {};
    for (const t of templates) {
      const seq = t.sections.map(s => s.role).join(" → ");
      roleSeqs[seq] = (roleSeqs[seq] || 0) + 1;
    }
    const topRoleSeq = Object.entries(roleSeqs).sort((a, b) => b[1] - a[1])[0];

    // 统计 section 角色频率（有多少比例的模板包含该角色）
    const rolePresence = {};
    for (const t of templates) {
      const roles = new Set(t.sections.map(s => s.role));
      for (const role of roles) {
        rolePresence[role] = (rolePresence[role] || 0) + 1;
      }
    }
    const commonRoles = Object.entries(rolePresence)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([role, count]) => ({ role, pctOfTemplates: Math.round(count / templates.length * 100) + "%" }));

    // 统计装饰
    const decoFreq = {};
    for (const t of templates) {
      for (const d of t.decorativePatterns) decoFreq[d] = (decoFreq[d] || 0) + 1;
    }
    const commonDeco = Object.entries(decoFreq)
      .filter(([, v]) => v >= templates.length * 0.3)
      .sort((a, b) => b[1] - a[1])
      .map(([k]) => k);

    const avgImgs = Math.round(templates.reduce((s, t) => s + t.imageCount, 0) / templates.length);
    const avgSections = Math.round(templates.reduce((s, t) => s + t.sectionCount, 0) / templates.length);

    patterns.push({
      patternId: `layout-${patterns.length + 1}`,
      signature: sig,
      frequency: templates.length,
      format,
      topLayout,
      sectionCountBucket: secBucket,
      avgSectionCount: avgSections,
      avgImageCount: avgImgs,
      typicalRoleSequence: topRoleSeq ? topRoleSeq[0] : "",
      commonSectionRoles: commonRoles,
      commonDecorations: commonDeco,
      compatibleCategories: [...new Set(templates.map(t => t.category))],
      compatibleEmotions: [...new Set(templates.map(t => t.emotion))],
      representativeId: best.id,
      representativeName: best.name,
      templateIds: templates.map(t => t.id),
    });
  }

  return patterns.sort((a, b) => b.frequency - a.frequency);
}

const layoutPatterns = buildLayoutPatterns(structures);
const coveredTemplates = new Set(layoutPatterns.flatMap(p => p.templateIds));
console.log(`板式聚类: ${layoutPatterns.length} 个板式模式, 覆盖 ${coveredTemplates.size} / ${structures.length} 模板`);
console.log("  Top 10:");
for (const p of layoutPatterns.slice(0, 10)) {
  console.log(`    [${String(p.frequency).padStart(3)} 模板] ${p.signature}`);
  if (p.typicalRoleSequence) console.log(`             roles: ${p.typicalRoleSequence.substring(0, 60)}`);
}
console.log();

// ═══════════════════════════════════════════════════════════════
// Phase 3: 情绪库 → emotion-exemplars.json
// ═══════════════════════════════════════════════════════════════

function buildEmotionExemplars(structures) {
  const groups = {};
  for (const s of structures) {
    if (!groups[s.emotion]) groups[s.emotion] = [];
    groups[s.emotion].push(s);
  }

  const exemplars = [];
  for (const [emotion, templates] of Object.entries(groups)) {
    const sorted = templates.sort((a, b) => b.quality - a.quality);
    const reps = sorted.filter(r => r.colorScheme).slice(0, 5);

    const tokenExemplars = reps.map(r => ({
      colors: r.colorScheme,
      category: r.category,
      source: r.name,
    }));

    // 装饰手法频率
    const decoFreq = {};
    for (const t of templates) {
      for (const d of t.decorativePatterns) decoFreq[d] = (decoFreq[d] || 0) + 1;
    }
    const typicalDeco = Object.entries(decoFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k, v]) => ({ pattern: k, frequency: Math.round(v / templates.length * 100) + "%" }));

    // 布局偏好
    const layoutFreq = {};
    for (const t of templates) layoutFreq[t.topLayout] = (layoutFreq[t.topLayout] || 0) + 1;
    const preferredLayouts = Object.entries(layoutFreq)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => ({ layout: k, frequency: Math.round(v / templates.length * 100) + "%" }));

    // 格式偏好
    const formatFreq = {};
    for (const t of templates) formatFreq[t.format] = (formatFreq[t.format] || 0) + 1;

    exemplars.push({
      emotion,
      templateCount: templates.length,
      tokenExemplars,
      typicalDecorations: typicalDeco,
      preferredLayouts,
      formatDistribution: formatFreq,
      avgSectionCount: Math.round(templates.reduce((s, t) => s + t.sectionCount, 0) / templates.length),
      avgImageCount: Math.round(templates.reduce((s, t) => s + t.imageCount, 0) / templates.length),
    });
  }

  return exemplars.sort((a, b) => b.templateCount - a.templateCount);
}

const emotionExemplars = buildEmotionExemplars(structures);
console.log(`情绪库: ${emotionExemplars.length} 种情绪`);
for (const e of emotionExemplars) {
  console.log(`  ${e.emotion}: ${e.templateCount} 模板, ${e.tokenExemplars.length} Token 示例`);
}
console.log();

// ═══════════════════════════════════════════════════════════════
// Phase 4: 配色库 → color-palettes.json
// ═══════════════════════════════════════════════════════════════

function buildColorPalettes(structures) {
  const palettes = [];
  for (const s of structures) {
    if (!s.colorScheme) continue;
    const colors = s.colorScheme;
    const primaryHex = colors.primary || colors.bg || Object.values(colors)[0];
    if (!primaryHex || !primaryHex.startsWith("#")) continue;
    const hsl = hexToHSL(primaryHex);
    if (!hsl) continue;

    const accentHex = colors.accent || colors.secondary;
    let strategy = "monochromatic";
    if (accentHex && accentHex.startsWith("#")) {
      const accentHsl = hexToHSL(accentHex);
      if (accentHsl) {
        const hueDiff = Math.abs(hsl.h - accentHsl.h);
        const nd = Math.min(hueDiff, 360 - hueDiff);
        if (nd > 150 && nd < 210) strategy = "complementary";
        else if ((nd > 120 && nd <= 150) || nd > 210) strategy = "split-complementary";
        else if (nd > 10 && nd <= 60) strategy = "analogous";
      }
    }

    let temperature = "neutral";
    if (hsl.h < 70 || hsl.h >= 330) temperature = "warm";
    else if (hsl.h >= 70 && hsl.h < 170) temperature = "green";
    else if (hsl.h >= 170 && hsl.h < 260) temperature = "blue";
    else temperature = "purple";

    const bgHex = colors.bg || colors.paper || "#FFFFFF";
    const bgHsl = hexToHSL(bgHex);
    const isDark = bgHsl ? bgHsl.l < 40 : false;

    palettes.push({
      templateId: s.id,
      templateName: s.name,
      category: s.category,
      emotion: s.emotion,
      quality: s.quality,
      strategy, temperature,
      isDarkTheme: isDark,
      primaryHue: hsl.h,
      colors,
    });
  }

  // 按策略+色温+明暗分组
  const groups = {};
  for (const p of palettes) {
    const key = `${p.strategy}|${p.temperature}|${p.isDarkTheme ? "dark" : "light"}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  }

  const result = [];
  for (const [key, items] of Object.entries(groups)) {
    const sorted = items.sort((a, b) => b.quality - a.quality);
    const [strategy, temperature, theme] = key.split("|");
    result.push({
      strategy, temperature, theme,
      count: items.length,
      exemplars: sorted.slice(0, 3).map(p => ({
        colors: p.colors,
        source: p.templateName,
        category: p.category,
        emotion: p.emotion,
        primaryHue: p.primaryHue,
      })),
    });
  }

  return result.sort((a, b) => b.count - a.count);
}

const colorPalettes = buildColorPalettes(structures);
console.log(`配色库: ${colorPalettes.length} 个配色组`);
for (const p of colorPalettes.slice(0, 6)) {
  console.log(`  ${p.strategy} | ${p.temperature} | ${p.theme}: ${p.count} 模板`);
}
console.log();

// ═══════════════════════════════════════════════════════════════
// 输出
// ═══════════════════════════════════════════════════════════════

fs.writeFileSync(path.join(RES_DIR, "layout-patterns.json"), JSON.stringify(layoutPatterns, null, 2), "utf8");
fs.writeFileSync(path.join(RES_DIR, "emotion-exemplars.json"), JSON.stringify(emotionExemplars, null, 2), "utf8");
fs.writeFileSync(path.join(RES_DIR, "color-palettes.json"), JSON.stringify(colorPalettes, null, 2), "utf8");

console.log(`✓ layout-patterns.json  (${layoutPatterns.length} 条)`);
console.log(`✓ emotion-exemplars.json (${emotionExemplars.length} 条)`);
console.log(`✓ color-palettes.json   (${colorPalettes.length} 条)`);

console.log("\n═══ 总结 ═══");
console.log(`板式库: ${layoutPatterns.length} 种板式, 覆盖 ${coveredTemplates.size} / ${structures.length} 模板 (${(coveredTemplates.size / structures.length * 100).toFixed(1)}%)`);
console.log(`情绪库: ${emotionExemplars.length} 种情绪, 含 ${emotionExemplars.reduce((s, e) => s + e.tokenExemplars.length, 0)} 个 Token 示例`);
console.log(`配色库: ${colorPalettes.length} 个配色组, 含 ${colorPalettes.reduce((s, p) => s + p.exemplars.length, 0)} 个具体方案`);
