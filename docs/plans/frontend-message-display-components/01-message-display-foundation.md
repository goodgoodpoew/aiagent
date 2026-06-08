# 01 消息展示基础组件

> 执行标注（2026-06-07）：已完成 `message-display` 目录、part 分组、token 样式桥、assistant/user 入口；`pnpm test:components` 与 `pnpm build` 已通过；未做浏览器视觉验证。

## 修改位置

新增：
- [x] `antdXStudy/src/pages/base/components/message-display/`（消息展示组件目录）
- [x] `antdXStudy/src/pages/base/components/message-display/partGroups.ts`（part 分组）
- [x] `antdXStudy/src/pages/base/components/message-display/messageDisplayStyle.ts`（token 到 CSS 变量）
- [x] `antdXStudy/src/pages/base/components/message-display/message-display.css`（展示样式）
- [x] `antdXStudy/src/pages/base/components/message-display/MessageText.tsx`（文本渲染）
- [x] `antdXStudy/src/pages/base/components/message-display/MessageAttachments.tsx`（附件展示）
- [x] `antdXStudy/src/pages/base/components/message-display/AssistantMessageContent.tsx`（assistant 消息入口）
- [x] `antdXStudy/src/pages/base/components/message-display/UserMessageContent.tsx`（用户消息入口）

修改：
- [x] `antdXStudy/src/pages/base/components/AnswerProcessPanel.tsx`（实际复用，未迁移）
- [x] `antdXStudy/src/pages/base/components/MessagePartsRenderer.tsx`（兼容导出）

## 目的

建立独立消息展示组件基础，让 assistant/user 消息内容都能在新目录内完成渲染。

## 动机

当前消息展示散落在页面与单个 renderer 中，后续增加任务、引用、步骤、工具调用时会继续压重 `BaseLayout`。

## 修改原因

- `BaseLayout` 直接读取用户消息 metadata 并拼装附件标签，页面职责过宽。
- `MessagePartsRenderer` 同时负责 part 分类、过程面板、附件、markdown，扩展点不清晰。

## 实施方案

1. [x] 新增 `partGroups.ts`，集中按 `MessagePart['type']` 分出文本、文件、过程、引用、错误和其他。
2. [x] 新增 `messageDisplayStyle.ts`，通过 `theme.useToken()` 生成 CSS 变量。
3. [x] 新增 `MessageText`、`MessageAttachments`、`AssistantMessageContent`、`UserMessageContent`。
4. [x] 保留旧 `MessagePartsRenderer.tsx` 兼容导出到 assistant 入口。

## 产出

- [x] 一个可独立维护的消息展示组件目录。
- [x] assistant 与 user 消息都有独立内容组件。
- [x] token 驱动的 CSS 变量样式基础。

## 验收

- [x] 无 parts 的 assistant 消息仍渲染旧 content 文本。
- [x] v2 text/file/process parts 仍能显示。
- [x] 用户消息附件 metadata 可显示。
- [x] 不修改 `src/.umi`，不改 SSE v2 协议。

## 风险与注意事项

- 本步不要改 Redux 数据结构。
- 旧测试仍可能引用 `MessagePartsRenderer`，需要保留兼容出口。
- 样式不要写死主题色，优先使用 token 注入变量。
