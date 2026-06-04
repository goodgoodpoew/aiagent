# 03 前端文本流 v2 接入计划

> 执行标注：2026-06-04 已开始执行。当前阶段保持 v1 `sendChatStream()` 不删除，主聊天页迁移到 v2 envelope。

## 动机

后端 v2 文本流就绪后，前端主聊天页需要从 v1 chunk 解析切换到 v2 event envelope。目标是主业务路径不再读取 `choices`，而是按 `message.part.*` 事件更新消息。

## 修改原因

- 当前 `antdXStudy/src/service/chat.ts` 同时解析 `session.created`、`message.created`、`error`、`done` 和 OpenAI 风格 `choices`。
- 当前 Redux 只有 `appendAssistantDelta()`，只能表达 assistant 文本追加，无法表达 part、reasoning、tool、error。
- 前端主聊天页需要跟后端 v2 协议建立一致状态。

## 修改位置

前端新增：

- [x] `antdXStudy/src/service/chat-stream-v2.ts`（已新增 `sendChatStreamV2()`，只解析 v2 `StreamEventEnvelope`）
- [x] `antdXStudy/src/service/stream-protocol.ts`（已补齐前端事件 data 类型）

前端修改：

- [x] `antdXStudy/src/store/types.ts`（已有 `ChatMessage.parts` 类型入口，本次保持兼容）
- [x] `antdXStudy/src/store/messageStore/index.ts`（已新增 `applyStreamEvent()`）
- [x] `antdXStudy/src/store/adapters/messageAdapter.ts`（已支持 `metadata.parts` 恢复和 stream snapshot 映射）
- [x] `antdXStudy/src/store/chatThunks.ts`（主聊天页发送已切到 v2 请求体）
- [x] `antdXStudy/src/pages/base/components/BaseLayout.tsx`（已优先渲染 text parts 聚合文本）

## 目标

- 新增 `sendChatStreamV2()`。
- 主聊天页发送 `ChatStreamRequestV2`。
- Redux 能处理 `message.part.started / delta / completed`。
- 主聊天页不再读取 `chunk.choices`。
- v1 `sendChatStream()` 保留给示例页或回滚。

## 实施方案

1. 新增 `sendChatStreamV2()`：【已完成】

- 请求地址：`http://localhost:3001/api/ai/chat/stream/v2`。
- 请求体使用 `protocol / requestId / clientMessageId / input.parts / runtime`。
- 解析 SSE 后把完整 `StreamEventEnvelope` 交给 `handlers.onEvent(event)`。
- 只处理 HTTP 层失败，不处理 provider 原始格式。

2. 修改 `sendCurrentMessage()`：【已完成】

- 从 `query` 构造 text part。
- 从已上传附件构造 file part。
- 继续生成 `requestId` 和 `clientMessageId`。
- 乐观消息仍保留，但后续由 `message.created` 对账。

3. 新增 reducer：【已完成】

```ts
applyStreamEvent(state, action: PayloadAction<StreamEventEnvelope>)
```

处理规则：

- [x] `session.created`：交给 thunk 同步 session store。
- [x] `message.created`：替换乐观消息 ID，写入服务端消息。
- [x] `message.part.started`：在 assistant message 中创建 part。
- [x] `message.part.delta`：按 `messageId + partId` 合并文本，同时更新 `content` 投影。
- [x] `message.part.completed`：标记 part 完成。
- [x] `message.completed`：用完整 message 对账。
- [x] `stream.completed`：清理 `streamingMessageId`。
- [x] `stream.failed`：标记错误并写入 error part。

4. 消息渲染保持兼容：【已完成】

- 如果 message 有 text parts，优先渲染 parts 聚合文本。
- 如果没有 parts，则继续渲染 `content`。

## 产出

- [x] `chat-stream-v2.ts`。
- [x] `applyStreamEvent()`。
- [x] `ChatMessage.parts` 前端类型。
- [x] 主聊天页可通过 v2 完成纯文本流式对话。

## 验收

- [x] 主聊天页发送新消息时，请求体包含 `protocol: aiagent.stream.v2`。
- [ ] 浏览器收到 v2 SSE 后能实时显示 assistant 文本。（待联调运行验证）
- [x] 前端主业务路径不再读取 `chunk.choices`。
- [x] 新会话 draft ID 能被真实 session ID 替换。
- [x] 乐观 user/assistant message ID 能被真实 ID 替换。
- [x] 刷新页面后旧消息仍能显示。（已从 `metadata.parts` 恢复并回退 `content`）
- [x] 前端构建通过。（已执行 `pnpm build`）

## 风险与注意事项

- [x] 不要删除 v1 `sendChatStream()`。
- [x] `chat-shared.ts` 的 Ant Design X 示例适配暂时不改。
- [x] reducer 需要容忍重复事件，避免重连或异常情况下重复追加文本。（已记录 processed event id）
- [x] `message.completed` 到达时应做最终对账，避免流中丢 chunk 后 UI 与后端不一致。
