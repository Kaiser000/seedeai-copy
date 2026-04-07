# Seede AI 工作流程逆向分析

## 实例来源

提示词：`2026年个人所得税退税提醒`（含详细结构化内容）

## 4 阶段流水线

### 阶段 1：需求分析

触发标志：`<seede-thinking>` 标签内容

```
正在为您设计一份 2026 年度个人所得税退税指南长图。
采用专业、清晰的政策解读风格，针对广东/清远地区进行视觉优化。
```

**本质**：LLM 的 Chain-of-Thought 推理步骤，在生成代码前先确定：
- 设计风格（权威/政务风）
- 配色基调（深蓝 + 红色强调）
- 目标尺寸（1080px 宽信息长图）
- 内容结构（几个 Section，每个 Section 的侧重点）

---

### 阶段 2：页面布局（核心阶段）

**输出物**：完整的 React + Tailwind CSS JSX 代码

关键特征：
1. **固定宽度 1080px**，高度由内容自动撑开（本例为 3688px）
2. **直接使用 Tailwind 类名**控制间距、颜色、字体大小
3. **数据硬编码**进 JSX，不分离数据与视图
4. **外部资源引用**：FontAwesome 图标（`fas fa-*`）、Google Fonts
5. **`data-lines` 属性**标记多行文字截断提示（供渲染引擎处理）
6. **`data-type="qrcode"`**标记需要生成二维码的元素

关键代码片段分析：
```jsx
// 固定画布尺寸
<div style={{ width: '1080px', height: '3688px', backgroundColor: colors.bg }}>

// 品牌色系统（LLM 根据内容自动决定）
const colors = {
  primary: '#1E40AF',  // 深蓝，权威感
  accent: '#DC2626',   // 红色，重点提示
  ...
};

// 字体系统（中文设计常用字体）
const fonts = {
  headline: { fontFamily: '"Alibaba PuHuiTi 3.0 115 Black"', fontWeight: 900 },
  body: { fontFamily: '"Noto Sans"', fontWeight: 400 },
};
```

---

### 阶段 3：设计合成

阶段 2 输出的布局结构树（层级列表）：
```
形状（Section容器）
  图片（图标）
  文本（标题）
  形状（卡片）
    文本（序号）
    文本（主标题）
    文本（副标题）
```

**推断技术方案**：

```
JSX 代码
  ↓ esbuild 编译（浏览器端或 Node.js）
  ↓ 注入 HTML 模板（含 CDN 资源）
  ↓ Puppeteer 无头 Chrome 渲染
  ↓ page.screenshot({ fullPage: true })
  ↓ PNG Buffer
```

布局树是 Puppeteer 截图前，对渲染后 DOM 的结构化描述，用于：
- 用户预览编辑（知道有哪些可编辑元素）
- 后续微调时定位元素

---

### 阶段 4：图像处理

对 Puppeteer 截图做后处理：
- **超分**：提升清晰度（Real-ESRGAN 或 sharp resize）
- **压缩**：控制文件大小
- **水印**：按订阅计划决定是否添加水印

---

## 关键架构洞察

| 洞察 | 说明 |
|---|---|
| **LLM 即模板引擎** | 不维护模板库，每次重新生成完整布局代码 |
| **Tailwind 是桥梁** | LLM 训练数据中 Tailwind 覆盖广，生成质量高且稳定 |
| **React 是中间层** | 利用组件化让 LLM 生成结构更规范，而非直接生成 HTML |
| **截图而非导出** | 渲染引擎用浏览器截图，复用了 CSS 渲染能力，无需自建排版引擎 |
| **编辑即重新生成** | 用户点击元素修改时，大概率是重新调用 LLM 生成新代码，而非真正的 DOM 编辑 |
