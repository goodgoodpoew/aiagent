# 02 Bubble role 集成

> 执行标注（2026-06-07）：已完成 Bubble role 到 `AssistantMessageContent` / `UserMessageContent` 的迁移；`pnpm test:components` 与 `pnpm build` 已通过；未做浏览器视觉验证。

## 修改位置

修改：
- [x] `antdXStudy/src/pages/base/components/BaseLayout.tsx`（迁移 `bubbleRole` 内容渲染）

## 目的

让 `BaseLayout` 只负责把 `ChatMessage` 交给消息展示组件，不再内联拼装用户/assistant 消息内容。

## 动机

`Bubble.List` 是 Ant Design X 聊天消息列表入口，页面应只配置 role 关系，具体内容展示交给独立组件。

## 修改原因

- 当前 assistant role 直接引用旧 `MessagePartsRenderer`。
- 当前 user role 内联解析 `metadata.attachments` 并渲染 tag。

## 实施方案

1. [x] 从 `message-display` 导入 `AssistantMessageContent` 与 `UserMessageContent`。
2. [x] 更新 `bubbleRole`：assistant/user 分别调用对应组件。
3. [x] 删除 `BaseLayout` 中不再使用的 `getMessageTextProjection` 引用；`Tag` 和 `ChatMessage` 仍被页面其他逻辑使用。

## 产出

- [x] 更轻的 `BaseLayout` Bubble role 配置。
- [x] 页面和消息展示职责分离。

## 验收

- [x] 空状态、会话列表、消息列表仍正常显示。
- [x] 用户消息和 assistant 消息仍通过 `Bubble.List` 渲染。
- [x] 流式中输入区禁用行为不变。

## 风险与注意事项

- 本步不要拆会话侧栏、会话文件栏或 Sender。
- `Bubble.List` 的 role 配置保持原有 placement。
- 避免引入新的 UI 库或脱离 Ant Design X。
