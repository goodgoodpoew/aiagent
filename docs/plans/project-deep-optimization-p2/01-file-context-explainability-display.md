# 01 文件上下文可解释展示

> 执行标注（2026-06-08）：已完成用户消息附件上下文事实展示；`pnpm test:components -- MessagePartsRenderer.component.spec.tsx`、`pnpm test:unit -- builtin-tool.adapter native-agent-engine.service`、前后端 `pnpm build` 已通过；浏览器已验证本地应用可加载到 `/login`，未构造真实附件消息做气泡视觉验收。

## 修改位置

新增：

- [x] 无新增业务模块；必要时仅在现有组件内增加轻量类型与渲染。

修改：

- [x] `antdXStudy/src/pages/base/components/message-display/UserMessageContent.tsx`（读取并展示附件上下文事实）
- [x] `antdXStudy/src/pages/base/components/message-display/MessageAttachments.tsx`（支持附件状态、原因和 token 估算）
- [x] `antdXStudy/src/pages/base/components/message-display/message-display.css`（补充状态与说明样式）
- [x] `antdXStudy/src/pages/base/components/MessagePartsRenderer.component.spec.tsx`（补充组件测试）
- [x] `docs/project-deep-optimization-priority-plan.md`（同步 P2-2 执行状态）
- [x] `docs/evaluation/project-deep-optimization-impl-review.md`（追加实现锐评）

## 目的

让用户在历史消息和当前消息中看到本轮附件是否进入模型上下文、约占多少 token、未进入上下文的原因。

## 动机

P2 的核心是用户可解释性。后端已经在用户消息 metadata 中记录 `attachments` 与 `unavailableAttachments`，前端继续只展示附件名会隐藏“模型到底读没读”的关键事实。

## 修改原因

- 当前用户消息只展示 `metadata.attachments`，未展示 `unavailableAttachments`。
- `attachments` 中已有 `tokenEstimate`，但 UI 未展示，用户无法感知文件上下文成本。
- 附件读取失败或未解析时，用户看不到“未进入上下文原因”，容易误以为模型已经读过文件。

## 实施方案

1. [x] 扩展 `MessageAttachmentItem`，增加 `status`、`reason`、`tokenEstimate`、`mimeType`。
2. [x] `UserMessageContent` 合并 `attachments` 与 `unavailableAttachments`，按原有 metadata 事实渲染，不推断缺失字段。
3. [x] `MessageAttachments` 按状态展示已读取、未进入上下文和普通附件，补充 token/大小/原因摘要。
4. [x] 补充组件测试，覆盖已读取 token 展示和不可用原因展示。
5. [x] 更新 P2-2 计划状态与实现锐评。

## 产出

- [x] 用户消息附件区域可显示“已读取”“未进入上下文”等状态。
- [x] 可读附件显示 token 估算，不可读附件显示原因。
- [x] 组件测试覆盖关键展示逻辑。

## 验收

- [x] 带 `metadata.attachments[].tokenEstimate` 的用户消息展示 token 估算。
- [x] 带 `metadata.unavailableAttachments[]` 的用户消息展示“未进入上下文”和原因。
- [x] 既有普通附件展示与 assistant file parts 展示不回归。
- [x] `pnpm test:components -- MessagePartsRenderer.component.spec.tsx` 通过。

## 风险与注意事项

- 本步不改后端 schema、不改 SSE v2 协议、不新增重试/取消动作。
- metadata 来自历史持久化，前端只做容错读取，避免因为旧消息缺字段而报错。
- UI 文案使用简体中文，样式继续通过现有 CSS 变量接 Ant Design token。
