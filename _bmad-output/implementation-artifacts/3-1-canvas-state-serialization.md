# Story 3.1: 画布状态序列化

Status: done

## Story

As a 系统,
I want 将当前画布的完整状态序列化为 LLM 可理解的结构化描述,
So that AI 能基于用户手动编辑后的实时状态进行智能优化。

## Acceptance Criteria

1. **Given** Fabric.js 画布上有若干元素（包含用户手动编辑后的状态）**When** 调用 `canvasSerializer` 序列化当前画布 **Then** 输出包含每个元素的结构化描述：元素类型（text/shape/image）、位置（x, y）、尺寸（width, height）、内容（文字内容或图片 URL）、样式（颜色、字号、背景色等）**And** 输出格式为 LLM 可直接作为上下文输入的文本格式 **And** 序列化结果反映用户手动编辑后的实时状态（非初始生成状态）
2. **Given** 画布上有嵌套的分组元素 **When** 序列化执行 **Then** 层级关系在输出中正确表达
3. **Given** canvasSerializer 模块已实现 **When** 运行 `canvasSerializer.test.ts` 单元测试 **Then** 各种元素类型和组合场景的序列化结果正确，测试全部通过

## Tasks / Subtasks

- [x] Task 1: canvasSerializer 服务 (AC: #1)
  - [x] 创建 `features/generation/services/canvasSerializer.ts`
  - [x] `serializeCanvas(canvas: fabric.Canvas): string`
  - [x] 遍历画布所有对象，提取每个元素的结构化描述
  - [x] 输出格式：LLM 可直接理解的文本（如 JSON 或 Markdown 表格）
- [x] Task 2: 元素类型序列化 (AC: #1)
  - [x] 文本元素（fabric.Textbox）：类型、位置(left,top)、尺寸(width,height)、文字内容(text)、样式(fill,fontSize,fontFamily,fontWeight)
  - [x] 形状元素（fabric.Rect）：类型、位置、尺寸、填充色(fill)、边框(stroke,strokeWidth)
  - [x] 图片元素（fabric.Image）：类型、位置、尺寸、图片源(src)
- [x] Task 3: 嵌套/分组元素序列化 (AC: #2)
  - [x] 处理 fabric.Group 类型
  - [x] 递归序列化子元素
  - [x] 输出中表达层级关系（缩进或嵌套结构）
- [x] Task 4: 实时状态保证 (AC: #1)
  - [x] 序列化时直接读取 Fabric.js 对象的当前属性值
  - [x] 确保反映用户拖拽、缩放、文字编辑、样式修改后的最新状态
- [x] Task 5: 单元测试 (AC: #3)
  - [x] 创建 `__tests__/features/generation/canvasSerializer.test.ts`
  - [x] 测试文本元素序列化
  - [x] 测试形状元素序列化
  - [x] 测试图片元素序列化
  - [x] 测试分组元素序列化
  - [x] 测试空画布序列化
  - [x] 测试混合元素组合

## Dev Notes

### 架构约束
- `canvasSerializer.ts` 位于 `features/generation/services/`
- 同时服务 FR17（Roll 单元素）和 FR18（对话优化），是两者共用的基础模块
- 序列化必须捕捉用户手动编辑后的实时状态，不能缓存初始生成结果
- 输出格式需 LLM 友好——建议使用结构化 JSON 文本，包含语义化字段名

### 序列化输出格式建议
```json
{
  "canvasSize": { "width": 1080, "height": 1920 },
  "elements": [
    {
      "type": "text",
      "position": { "x": 100, "y": 200 },
      "size": { "width": 400, "height": 60 },
      "content": "五一狂欢购",
      "style": { "color": "#FF0000", "fontSize": 48, "fontFamily": "AlibabaPuHuiTi", "fontWeight": "bold" }
    },
    {
      "type": "shape",
      "position": { "x": 0, "y": 0 },
      "size": { "width": 1080, "height": 1920 },
      "style": { "fill": "#F0F0FF", "stroke": "none" }
    }
  ]
}
```

### 测试要求（核心管线相关）
- `canvasSerializer.test.ts` 是架构文档指定的核心管线测试之一

### 依赖 Epic 1 和 Epic 2 产物
- Fabric.js canvas 实例及其上的元素
- 用户编辑后的画布状态

### Project Structure Notes
```
features/generation/
└── services/canvasSerializer.ts

__tests__/features/generation/
└── canvasSerializer.test.ts
```

### References
- [Source: architecture.md#完整项目目录结构] — canvasSerializer.ts 位置
- [Source: architecture.md#测试优先级约定] — canvasSerializer 需要测试
- [Source: architecture.md#需求到架构映射] — FR19 画布序列化
- [Source: epics.md#Story 3.1] — 完整验收标准

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)
### Debug Log References
### Completion Notes List
- Story 3.1 implemented: Canvas state serializer producing LLM-friendly structured JSON, handling text/shape/image/group elements with real-time state capture.
### File List
- src/features/generation/services/canvasSerializer.ts
- __tests__/features/generation/canvasSerializer.test.ts
