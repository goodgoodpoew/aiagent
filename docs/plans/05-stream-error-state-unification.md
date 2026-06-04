# 05 流式错误与状态统一计划

> 执行标注（2026-06-04）：已按本计划完成 v2 `stream.failed` 统一、前端 `failed` 状态收敛、error part 渲染和失败消息持久化补强。执行中发现原实现已部分落地 v2，但错误事件仍是 `{ error: ... }` 嵌套结构、前端仍使用 `error` 运行态，并且缺少 `MessagePartsRenderer.tsx`；本次已做偏错纠正。

## 动机

当前流式错误可能出现在 HTTP 非 2xx、SSE `event:error`、chunk `status:error`、`choices.message.content` 错误文案、前端 catch 等多个出口。状态也分别散落在前端 `sending/streaming/done/error`、后端 placeholder、metadata、队列和实时事件中。

本计划统一 v2 流内错误和请求/消息/part 状态，让前后端不再靠临时判断维持一致。

## 修改原因

- 错误结构不统一会让前端展示、重试、持久化和排障都复杂化。
- 工具调用和 reasoning 引入后，错误不一定发生在文本输出阶段。
- 流已经建立后，HTTP 状态码无法表达中途失败，需要统一 SSE 错误事件。
- 失败消息需要刷新后仍可见。

## 修改位置

后端：

- `ai-proxy-server/src/streaming/protocol/stream-event.types.ts`
- `ai-proxy-server/src/streaming/services/stream-orchestrator.service.ts`
- `ai-proxy-server/src/ai-proxy/stream-failure/stream-failure.coordinator.ts`
- `ai-proxy-server/src/ai-proxy/stream-failure/sinks/sse-failure.sink.ts`
- `ai-proxy-server/src/ai-proxy/errors/stream-error.util.ts`
- `ai-proxy-server/src/message/message.service.ts`

前端：

- `antdXStudy/src/store/types.ts`
- `antdXStudy/src/store/messageStore/index.ts`
- `antdXStudy/src/store/chatThunks.ts`
- `antdXStudy/src/pages/base/components/MessagePartsRenderer.tsx`

## 目标

- v2 流内错误统一输出 `stream.failed`。
- v2 不再使用 `event:error`、`status:error`、`choices` 错误块。
- 失败 assistant message 写入 error part。
- 前端统一通过 `stream.failed` 标记消息失败。
- 请求、消息、part 状态机在前后端保持一致。

## 实施方案

1. 定义 v2 错误事件：

```ts
interface StreamFailedData {
  code: string;
  message: string;
  retryable: boolean;
  stage: 'prepare' | 'provider_connect' | 'provider_stream' | 'tool_execution' | 'persistence' | 'unknown';
}
```

执行标注：已完成。后端 `stream-event.types.ts` 和前端 `stream-protocol.ts` 均改为扁平 `StreamFailedData`，并增加 `StreamFailureStage`。为兼容已存在的草案实现，前端 reducer/thunk 暂时兼容旧 `{ error: ... }` 形状，但 v2 后端新输出只写扁平结构。

2. 后端错误出口：

- 参数校验、鉴权、限流、流未建立时，仍使用 HTTP 错误。
- SSE 已建立后，所有错误都写 `stream.failed`。
- `stream.failed` 写出后正常 `res.end()`。
- 同时调用 `failAssistantMessageV2()` 持久化失败消息。

执行标注：已完成。`StreamOrchestratorService` 在 v2 SSE 建立后统一写 `stream.failed` 并 `res.end()`；根据执行阶段设置 `stage`。已有 assistant placeholder 时调用 `failAssistantMessageV2()` 写入 `error` part；placeholder 创建前允许事件缺少 `messageId`。v1 `event:error/status:error/choices` 兼容链路未改动。

3. 复用脱敏逻辑：

- 继续使用 `sanitizeStreamError()`。
- 禁止把 API Key、Authorization、上游完整报文、堆栈返回前端。

执行标注：已完成。v2 仍使用 `sanitizeStreamError()`，前端只收到 `code/message/retryable/stage`。详细排错内容仅用于后端日志和失败 metadata 的 `detail`，不会作为 SSE 前端展示文案。

4. 前端 reducer：

- 收到 `stream.failed` 后，写入 error part。
- 设置 assistant message 状态为 `failed`。
- 清理 `streamingMessageId`。
- 用户消息如果已经创建成功，状态置为 `done`。

执行标注：已完成。`MessageRuntimeStatus` 已从 `error` 收敛为 `failed`；`applyStreamEvent(stream.failed)` 和本地 catch 都进入同一个 `markMessageFailed/applyFailedMessage` 路径，写入并去重 `error` part，清理 `streamingMessageId`。发送 thunk 在流结束后将用户消息置为 `done`。

5. UI：

- `error` part 用 `Alert` 或现有错误样式展示。
- 显示 `message`，可选显示错误码。

执行标注：已完成。新增 `antdXStudy/src/pages/base/components/MessagePartsRenderer.tsx`，assistant 消息统一渲染 v2 parts，`error` part 使用 Ant Design `Alert` 展示 message 和错误码。

## 产出

- 统一 v2 错误事件类型。
- `StreamFailureCoordinator` 支持 v2 writer。
- 前端 `stream.failed` reducer。
- error part 渲染。
- 失败消息持久化。

执行标注：以上均已产出。`StreamFailureCoordinator` 的 SSE sink 已支持 v2 `StreamEventWriter` 写出 `stream.failed`；当前 v2 orchestrator 仍直接调用 `failAssistantMessageV2()`，以确保失败消息同步写入结构化 error part。

## 验收

- session 不存在时，v2 返回明确错误，不静默新建会话。
- 上游 API Key 错误时，前端展示用户友好错误。
- 上游流中断时，前端 assistant message 进入 failed。
- 刷新页面后，失败 assistant message 仍显示错误。
- v2 流内错误不再出现 `choices`。
- 后端日志能通过 `traceId/requestId/sessionId/messageId` 定位错误。
- v1 错误链路不受影响。

执行标注：已完成构建级验证：`ai-proxy-server pnpm build` 通过，`antdXStudy pnpm build` 通过。运行级验收中，错误事件形状、前端 reducer 和持久化路径已具备上述行为；API Key 错误/上游流中断仍建议在联调环境用真实 provider 再做一次端到端手测。

## 风险与注意事项

- 如果错误发生在 assistant placeholder 创建前，不能假装有 messageId，需要事件中允许 `messageId` 缺失。
- 如果错误发生在持久化失败阶段，至少要写出 `stream.failed` 并记录日志。
- 前端不要在 catch 和 `stream.failed` 中重复追加同一条错误文案。

执行标注：已处理。`stream.failed` 的 envelope 继续允许 `messageId` 缺失；`stage=persistence` 时仍先写失败事件并记录 `request/session/message/stage/code`；前端错误写入集中到 `markMessageFailed`，不再通过 delta 拼接失败文案。
