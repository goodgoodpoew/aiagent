# 04 消息 parts 持久化与历史兼容计划

## 动机

v2 流式事件解决的是运行态结构化问题，但刷新页面后必须能恢复同样的结构化消息。当前数据库只有 `Message.content` 和 `Message.metadata`，短期不适合立刻拆表，因此需要先用 `metadata.parts` 建立兼容持久化方案。

## 修改原因

- 当前 `Message.content` 只能保存纯文本，无法保存 reasoning、tool、file、reference、error 等 part。
- 当前历史消息接口返回后，前端只能得到 `content`。
- 如果 v2 完成后不持久化 parts，刷新页面会丢失结构化信息。
- 直接拆 MessagePart 表风险较高，当前阶段没有必要。

## 修改位置

后端：

- [x] `ai-proxy-server/src/message/message.service.ts`（已新增 v2 完成/失败方法，并兼容旧 `completeAssistantMessageWithParts()`）
- [x] `ai-proxy-server/src/message/dto/create-message.dto.ts`（已新增 `MessageMetadataV2` / `MESSAGE_PROTOCOL_V2`）
- [x] `ai-proxy-server/src/session/session.service.ts`（已复核：现有 `attachFilesToMessage()` 继续承担 MessageFile 关联，无需改 schema）
- [x] `ai-proxy-server/src/message/message-filter.util.ts`（已补充从 `metadata.parts` 回投影 text 的兼容逻辑）
- [x] `ai-proxy-server/src/conversation/conversation-application.service.ts`（已将 v2 input parts 映射为 user message parts）
- [x] `ai-proxy-server/src/ai-proxy/chat-context.service.ts`（执行补充：实际 user message 创建在此处完成，已写入 metadata.parts）
- [x] `ai-proxy-server/src/streaming/services/stream-orchestrator.service.ts`（执行补充：实际 v2 完成/失败调用在此处接入）

前端：

- [x] `antdXStudy/src/store/adapters/messageAdapter.ts`（已读取 `metadata.parts`，旧消息自动补 text part）
- [x] `antdXStudy/src/store/types.ts`（已补充 `parts` / 历史状态投影字段）
- [x] `antdXStudy/src/service/message.ts`（已复核：消息接口无需改动，adapter 层完成兼容）
- [x] `antdXStudy/src/store/messageStore/index.ts`（执行补充：加载历史消息时恢复 `metadata.status` 到运行态）

## 目标

- assistant 完成时写入 `metadata.parts`。
- user message 创建时也能保存 input parts。
- `content` 保持为可展示文本投影。
- 历史旧消息自动补齐 text part。
- 不修改 Prisma schema。

## 实施方案

1. 后端新增消息元数据结构：

```ts
interface MessageMetadataV2 {
  protocol?: 'aiagent.message.v2';
  status?: 'pending' | 'sending' | 'streaming' | 'done' | 'failed' | 'cancelled';
  parts?: MessagePart[];
  provider?: string;
  model?: string;
  usage?: TokenUsage;
  error?: unknown;
}
```

执行标注：已完成。实际常量为 `MESSAGE_PROTOCOL_V2 = 'aiagent.message.v2'`，流式 SSE 协议仍保留 `aiagent.stream.v2`。

2. 新增 `completeAssistantMessageV2()`：

- 入参包含 `content`、`parts`、`provider`、`model`、`usage`。
- 写入 `content`。
- 写入 `metadata.protocol = aiagent.message.v2`。
- 写入 `metadata.parts`。
- 写入 `metadata.status = done`。

执行标注：已完成。并保留 `completeAssistantMessageWithParts()` 作为兼容入口，内部转调 `completeAssistantMessageV2()`；更新 metadata 时会先合并旧字段，避免覆盖 `requestId` 等信息。

3. 新增 `failAssistantMessageV2()`：

- 写入错误文案到 `content`。
- 写入 error part。
- 写入 `metadata.status = failed`。

执行标注：已完成。v2 流失败时会写入用户友好 `content`、`metadata.parts` error part、`provider/model/error/failedAt`。

4. user message 创建：

- v2 请求中的 `input.parts` 写入 user message metadata。
- `content` 为所有 text part 拼接后的文本投影。
- file part 同步保留当前 `MessageFile` 关联逻辑。

执行标注：已完成。偏错纠正：实际创建入口在 `ChatContextService.prepareContext()`，由 `ConversationApplicationService` 先把 `input.parts` 转成带服务端 messageId 的 `MessagePart[]` 后传入；`MessageFile` 关联仍沿用 `SessionService.attachFilesToMessage()`。

5. 前端 `messageAdapter`：

- 如果后端返回 `metadata.parts`，映射为 `message.parts`。
- 如果没有 `metadata.parts`，从 `content` 生成单个 text part。
- 如果 `metadata.status` 存在，同步到运行态或展示态。

执行标注：已完成。`loadMessagesSuccess` 会把 adapter 投影出来的状态写回 `statusByMessageId`。

## 产出

- 后端消息完成/失败 v2 方法。
- user/assistant 消息都能保存 parts。
- 前端历史消息能读取 parts。
- 旧消息兼容转换逻辑。

执行标注：代码已完成，后端与前端构建均已通过。

## 验收

- v2 assistant 完成后，数据库 `Message.content` 有完整文本。
- v2 assistant 完成后，数据库 `Message.metadata.parts` 有 text part。
- v2 user message 的 `metadata.parts` 包含 text/file parts。
- 历史旧消息没有 `metadata.parts` 时，前端仍正常显示。
- 消息列表接口返回的数据经 adapter 后都有可渲染 parts。
- 不需要执行 Prisma migration。
- 后端和前端构建通过。

执行标注：已执行 `ai-proxy-server pnpm build` 与 `antdXStudy pnpm build`，均通过；本计划不需要 Prisma migration。

## 风险与注意事项

- metadata 里不要保存 provider 原始完整响应，避免泄漏敏感信息和膨胀数据。
- `content` 是投影，不是所有 part 的字符串化结果。
- error part 可以进入 `content` 的用户友好文案，但 tool/reasoning 不应默认拼入 `content`。
- 如果 metadata 已有旧字段，更新时要合并，不要覆盖 requestId、clientMessageId、attachments 等已有信息。
