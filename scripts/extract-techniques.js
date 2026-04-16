#!/usr/bin/env node
/**
 * 从模板库中提取高频设计手法片段 → technique-snippets.json
 *
 * 提取的不是结构（板式库已做），而是**元素级的设计智慧**：
 * 偏移边框、段内高亮、引用框、区块变色、标签药丸、分色标题、浮层角标等。
 */

const fs = require("fs");
const path = require("path");

const RES_DIR = path.join(__dirname, "../backend/src/main/resources");
const allItems = JSON.parse(fs.readFileSync(path.join(RES_DIR, "all_items.json"), "utf8"));

const templates = allItems.filter(t => t.sourceCode && t.sourceCode.length > 3000);
console.log(`分析 ${templates.length} 个模板...\n`);

// ═══════════════════════════════════════════════════════════════
// 手法检测器：每种手法定义检测规则 + 片段提取逻辑
// ═══════════════════════════════════════════════════════════════

const techniqueDetectors = [
  {
    id: "offset-border-frame",
    name: "偏移边框（图片立体感）",
    description: "在图片后面用 absolute 定位一个偏移的 border 框，制造叠层立体效果",
    detect: (sc) => /absolute[^>]*(?:border-\[?\d+|border-[248])[^>]*(?:translate|top-|left-|-top|-left)/s.test(sc),
    extract: (sc) => {
      const m = sc.match(/<div[^>]*absolute[^>]*(?:border-\[?\d+|border-[248])[^>]*(?:translate[^>]*|(?:top|left)-[^>]*)>[^<]*<\/div>/);
      return m ? m[0] : null;
    },
    tags: ["image", "decoration", "layering"]
  },
  {
    id: "inline-text-highlight",
    name: "段内文字高亮（border-b 下划线强调）",
    description: "在段落内用 <span> + border-b 高亮关键词，打破纯文本的单调",
    detect: (sc) => /<span[^>]*border-b/.test(sc),
    extract: (sc) => {
      const m = sc.match(/<span[^>]*border-b[^>]*>[^<]{1,30}<\/span>/);
      return m ? m[0] : null;
    },
    tags: ["text", "emphasis"]
  },
  {
    id: "quote-callout-box",
    name: "引用/提示框（border-l + 浅色底）",
    description: "左侧粗竖线 + 浅色背景的引用框，用于 Tip、引用、注意事项",
    detect: (sc) => /border-l-\[?\d+/.test(sc) && /rounded-[23]xl/.test(sc),
    extract: (sc) => {
      const lines = sc.split("\n");
      for (let i = 0; i < lines.length; i++) {
        if (/border-l-\[?\d+/.test(lines[i])) {
          const block = lines.slice(i, Math.min(i + 8, lines.length)).join("\n");
          if (block.includes("</div>")) return block.substring(0, block.indexOf("</div>", block.indexOf("</div>") + 1) + 6);
        }
      }
      return null;
    },
    tags: ["text", "callout", "decoration"]
  },
  {
    id: "section-dark-shift",
    name: "区块深色切换（整个 section 背景变暗/变黑）",
    description: "某个 section 整体使用深色背景 + 白色文字，和其他浅色 section 形成强烈对比",
    detect: (sc) => {
      // 检测是否有深色 section 和浅色 section 共存
      const hasDark = /(?:bg-\[#[0-3][^]]*\]|bg-(?:gray|slate|zinc|neutral)-[89]\d{2}|bg-black|bg-\[#(?:0|1|2)[0-9a-f]{5}\])/.test(sc);
      const hasLight = /(?:bg-\[#[fFeE][^]]*\]|bg-white|bg-(?:gray|slate)-[12]\d{2})/.test(sc);
      return hasDark && hasLight;
    },
    extract: (sc) => {
      const m = sc.match(/<section[^>]*(?:bg-\[#[0-3][^"]*\]|bg-(?:gray|slate|zinc)-[89]\d{2}|bg-black)[^>]*>/);
      return m ? m[0] + "\n  {/* 深色 section：文字用 text-white，和前后浅色 section 形成反差 */}\n</section>" : null;
    },
    tags: ["section", "contrast", "mood-shift"]
  },
  {
    id: "pill-tag",
    name: "药丸标签（rounded-full + border + tracking）",
    description: "圆角药丸形的标签/徽章，常用于英文标签、状态标记、分类标签",
    detect: (sc) => /rounded-full[^>]*(?:border|tracking|uppercase)/.test(sc) || /(?:border|tracking|uppercase)[^>]*rounded-full/.test(sc),
    extract: (sc) => {
      const m = sc.match(/<(?:span|div)[^>]*rounded-full[^>]*(?:border|tracking)[^>]*>[^<]{1,40}<\/(?:span|div)>/);
      return m ? m[0] : null;
    },
    tags: ["label", "decoration"]
  },
  {
    id: "split-color-title",
    name: "分色标题（同一 h1 内多色）",
    description: "标题内不同文字使用不同颜色，如第一行用主色、第二行用黑色",
    detect: (sc) => /<h[12][^>]*>[\s\S]*?<span[^>]*(?:text-|color:)[^>]*>[\s\S]*?<\/h[12]>/.test(sc),
    extract: (sc) => {
      const m = sc.match(/<h[12][^>]*>[\s\S]*?<span[^>]*(?:text-|color:)[^>]*>[^<]*<\/span>[\s\S]*?<\/h[12]>/);
      return m ? m[0].substring(0, 200) : null;
    },
    tags: ["text", "title", "emphasis"]
  },
  {
    id: "image-overlay-badge",
    name: "图片浮层角标（absolute + bg-black/70）",
    description: "浮在图片上方的半透明信息标签，如地名、推荐理由、价格",
    detect: (sc) => {
      return /<img[\s\S]{0,300}absolute[^>]*(?:bg-black\/|bg-white\/|backdrop)[^>]*>[^<]+</.test(sc) ||
             /absolute[^>]*(?:bg-black\/|bg-white\/)[^>]*>[\s\S]{0,200}<img/.test(sc);
    },
    extract: (sc) => {
      const m = sc.match(/<div[^>]*absolute[^>]*(?:bg-black\/|bg-white\/)\d+[^>]*>[^<]{1,60}<\/div>/);
      return m ? m[0] : null;
    },
    tags: ["image", "label", "layering"]
  },
  {
    id: "large-border-radius",
    name: "超大圆角（>= 40px）",
    description: "使用 rounded-[40px] 以上的圆角，比标准 rounded-3xl(24px) 更柔和",
    detect: (sc) => /rounded-\[(?:[4-9]\d|[1-9]\d{2,})px\]/.test(sc),
    extract: (sc) => {
      const m = sc.match(/rounded-\[(?:[4-9]\d|[1-9]\d{2,})px\]/);
      return m ? m[0] : null;
    },
    tags: ["style", "softness"]
  },
  {
    id: "svg-decoration",
    name: "SVG 装饰图形（叶子、波浪、几何）",
    description: "用 SVG path 画装饰性图形，作为背景层的点缀",
    detect: (sc) => /<svg[^>]*>[\s\S]*?<path/.test(sc),
    extract: (sc) => {
      const m = sc.match(/<div[^>]*(?:absolute|opacity)[^>]*>[\s]*<svg[^>]*>[\s\S]*?<\/svg>[\s]*<\/div>/);
      return m ? m[0].substring(0, 300) : null;
    },
    tags: ["decoration", "background"]
  },
  {
    id: "gradient-overlay-fade",
    name: "渐变消隐蒙版（from-color via-transparent）",
    description: "用渐变让图片底部平滑过渡到背景色，比纯色蒙版更自然",
    detect: (sc) => /bg-gradient-to-[tb][^"]*(?:via-transparent|from-transparent)/.test(sc),
    extract: (sc) => {
      const m = sc.match(/<div[^>]*bg-gradient-to-[tb][^"]*(?:via-transparent|from-transparent)[^>]*\/>/);
      return m ? m[0] : null;
    },
    tags: ["image", "overlay", "transition"]
  },
  {
    id: "numbered-circle",
    name: "编号圆圈（01-04 彩色序号）",
    description: "圆形或方形的编号标记，用于列表项的视觉锚点",
    detect: (sc) => /(?:rounded-full|rounded-xl)[^>]*(?:flex items-center justify-center|text-center)[\s\S]{0,100}(?:0[1-9]|[1-9]\d)/.test(sc),
    extract: (sc) => {
      const m = sc.match(/<div[^>]*(?:rounded-full|rounded-xl)[^>]*(?:flex[^>]*items-center[^>]*justify-center)[^>]*>[\s\S]*?(?:0[1-9]|[1-9]\d)[\s\S]*?<\/div>/);
      return m ? m[0].substring(0, 200) : null;
    },
    tags: ["list", "number", "decoration"]
  },
  {
    id: "vertical-accent-bar",
    name: "竖线强调条（section 标题前的粗色条）",
    description: "在标题前放一个窄高的色条作为视觉锚点，比装饰线更有力",
    detect: (sc) => /w-[1-4]\s+h-\[?(?:\d{2,3}|[2-9]\d)/.test(sc) || /w-\[?[2-8]px\][^"]*h-\[?\d{2,}/.test(sc),
    extract: (sc) => {
      const m = sc.match(/<div[^>]*w-[1-4]\s+h-\[?\d{2,}[^>]*\/?>/) || sc.match(/<div[^>]*w-\[?[2-8]px\][^>]*h-\[?\d{2,}[^>]*\/?>/);
      return m ? m[0] : null;
    },
    tags: ["decoration", "title", "accent"]
  },
  {
    id: "dashed-divider",
    name: "虚线分隔（border-dashed）",
    description: "虚线边框用于优惠券切割线、分隔线等，增加纸质感",
    detect: (sc) => /border-dashed|borderStyle.*dashed/.test(sc),
    extract: (sc) => {
      const m = sc.match(/<div[^>]*(?:border-dashed|borderStyle[^}]*dashed)[^>]*\/?>/);
      return m ? m[0] : null;
    },
    tags: ["decoration", "divider", "coupon"]
  },
  {
    id: "bilingual-title",
    name: "中英双语标题",
    description: "中文主标题配英文副标签，增加国际感和视觉层次",
    detect: (sc) => /[A-Z][A-Z\s]{3,}/.test(sc) && /[\u4e00-\u9fff]{2,}/.test(sc) && /tracking-(?:widest|wider|\[)/.test(sc),
    extract: () => null, // 这个手法是模式级的，不是单个标签
    tags: ["text", "bilingual", "style"]
  },
  {
    id: "image-filter",
    name: "图片 CSS filter（sepia/contrast/brightness）",
    description: "给图片加滤镜调色，统一氛围感",
    detect: (sc) => /filter.*(?:sepia|contrast|brightness|saturate|hue-rotate)/.test(sc),
    extract: (sc) => {
      const m = sc.match(/filter:\s*'[^']*'/);
      return m ? "style={{ " + m[0] + " }}" : null;
    },
    tags: ["image", "mood", "filter"]
  },
];

// ═══════════════════════════════════════════════════════════════
// 逐模板检测
// ═══════════════════════════════════════════════════════════════

const techniqueStats = {};
for (const det of techniqueDetectors) {
  techniqueStats[det.id] = { ...det, count: 0, examples: [] };
}

for (const t of templates) {
  const sc = t.sourceCode;
  for (const det of techniqueDetectors) {
    if (det.detect(sc)) {
      const stat = techniqueStats[det.id];
      stat.count++;
      if (stat.examples.length < 3) {
        const snippet = det.extract(sc);
        if (snippet) {
          stat.examples.push({
            source: t.name,
            snippet: snippet.substring(0, 400),
          });
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// 输出
// ═══════════════════════════════════════════════════════════════

const results = Object.values(techniqueStats)
  .sort((a, b) => b.count - a.count)
  .map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    frequency: t.count,
    pctOfTemplates: Math.round(t.count / templates.length * 100) + "%",
    tags: t.tags,
    examples: t.examples,
  }));

console.log("=== 设计手法频率 ===\n");
for (const r of results) {
  console.log(`  ${r.pctOfTemplates.padStart(4)} (${String(r.frequency).padStart(3)}) ${r.name}`);
}

// 写入文件
fs.writeFileSync(
  path.join(RES_DIR, "technique-snippets.json"),
  JSON.stringify(results, null, 2),
  "utf8"
);
console.log(`\n✓ 写入 technique-snippets.json (${results.length} 种手法, ${results.reduce((s, r) => s + r.examples.length, 0)} 个片段)`);
