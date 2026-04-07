# Story 2.5: 一键导出 PNG

Status: done

## Story

As a 海报设计用户,
I want 将编辑好的海报一键导出为高质量 PNG 图片,
So that 我能直接使用这张图片发布到社交媒体或发送给他人。

## Acceptance Criteria

1. **Given** 画布上有已编辑的海报内容 **When** 用户点击工具栏的"导出"按钮 **Then** 系统将 Fabric.js 画布导出为 PNG 图片 **And** 导出分辨率不低于 1080px 宽度 **And** 触发浏览器下载，文件名包含时间戳（如 `seede-poster-20260402.png`）
2. **Given** 画布上有已编辑的海报内容 **When** 导出 PNG 图片完成 **Then** 导出的图片与画布所见完全一致（所见即所得）**And** 色彩、文字内容、字体、布局均无偏差 **And** 中文文字在导出图片中显示正常，无乱码
3. **Given** 画布为空或仅有背景 **When** 用户点击导出按钮 **Then** 仍然正常导出当前画布内容

## Tasks / Subtasks

- [x] Task 1: useExport Hook (AC: #1, #2, #3)
  - [x] 创建 `features/editor/hooks/useExport.ts`
  - [x] 使用 `canvas.toDataURL({ format: 'png', multiplier })` 导出
  - [x] 计算 multiplier 确保导出宽度 ≥ 1080px：`multiplier = Math.max(1, 1080 / canvas.width)`
  - [x] 生成下载链接并触发浏览器下载
- [x] Task 2: 导出文件名 (AC: #1)
  - [x] 文件名格式：`seede-poster-YYYYMMDD.png`
  - [x] 使用当前日期生成时间戳
- [x] Task 3: Toolbar 导出按钮 (AC: #1)
  - [x] 在 Toolbar 添加"导出"按钮（shadcn/ui Button + Download 图标）
  - [x] 点击触发 useExport 的导出逻辑
  - [x] 导出过程中按钮显示 loading 状态
- [x] Task 4: 导出质量保障 (AC: #2)
  - [x] 确保中文字体已加载到 Canvas 环境（依赖 fontLoader）
  - [x] 验证导出图片中文字正常、颜色准确、布局一致
- [x] Task 5: 空画布导出 (AC: #3)
  - [x] 画布为空或仅有背景时，导出按钮仍可用
  - [x] 正常导出当前画布内容（即便是空白或纯背景）

## Dev Notes

### 架构约束
- Fabric.js `canvas.toDataURL()` 是核心导出方法
- 导出分辨率通过 `multiplier` 参数控制，确保宽度 ≥ 1080px（NFR4）
- 导出图片必须所见即所得（NFR4、NFR5），色彩、文字、布局无偏差
- 中文字体必须在导出前已加载到 Canvas 环境（依赖 Story 1.5 fontLoader）
- `useExport` hook 位于 `features/editor/hooks/`

### 关键技术点
- `canvas.toDataURL({ format: 'png', multiplier: N })` — multiplier 控制缩放倍率
- 导出大图时可能有性能开销，建议添加 loading 状态
- 下载触发：创建临时 `<a>` 标签，设置 href 为 dataURL，触发 click

### 定义常量
- `MIN_EXPORT_WIDTH = 1080`（在 engine/types.ts 或 shared/constants 中）

### 依赖 Story 2.1-2.4 产物
- Fabric.js canvas 实例
- Toolbar 组件
- 画布上已渲染并编辑的海报元素

### Project Structure Notes
```
features/editor/
├── hooks/useExport.ts        # PNG 导出逻辑
└── components/Toolbar.tsx    # 添加导出按钮
```

### References
- [Source: architecture.md#需求到架构映射] — FR20 导出 → features/editor/
- [Source: architecture.md#完整项目目录结构] — useExport.ts 位置
- [Source: prd.md#非功能需求] — 导出分辨率 ≥ 1080px，所见即所得
- [Source: epics.md#Story 2.5] — 完整验收标准

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)
### Debug Log References
### Completion Notes List
- Story 2.5 implemented: PNG export via canvas.toDataURL with multiplier for minimum 1080px width, timestamped filename, toolbar export button with loading state.
### File List
- src/features/editor/hooks/useExport.ts
- src/features/editor/components/Toolbar.tsx
