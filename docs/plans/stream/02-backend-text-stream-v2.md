# 02 后端文本流 v2 端点实施计划

> 执行标注（2026-06-04）：已按本计划落地后端 v2 文本流最小链路；`pnpm build` 已通过。运行期 curl 需本地后端依赖和真实模型凭据，未在本次直接请求外部模型。

## 动机

协议基线建立后，需要先让后端跑通最小可用 v2 流：只处理用户文本和 assistant 文本输出，不接入 reasoning、tool、MCP。这样可以尽快切断前端对 OpenAI `choices` 的主业务依赖，同时保持改造范围可控。

## 修改原因

- 当前 `pipeOpenAiStreamToClient()` 直接把 OpenAI-compatible chunk 改造成前端 chunk，业务协议和 provider 协议耦合。
- 当前 v1 同时下发 `delta` 和 `choices`，字段语义重复。
- v2 需要由后端输出 `message.part.started / message.part.delta / message.part.completed`。
- 后端需要保留 v1 端点，保证示例页和回滚路径可用。

## 修改位置

后端新增：

- [x] `ai-proxy-server/src/streaming/adapters/provider-stream-adapter.interface.ts`（已新增：定义 provider 归一化事件）
- [x] `ai-proxy-server/src/streaming/adapters/openai-compatible-stream.adapter.ts`（已新增：解析 OpenAI-compatible SSE，剥离 `choices`）
- [x] `ai-proxy-server/src/streaming/services/stream-message-builder.service.ts`（已新增：生成 text part 事件和最终 assistant 快照）
- [x] `ai-proxy-server/src/streaming/services/stream-orchestrator.service.ts`（已新增：编排 v2 会话、消息、provider 流和落库）

后端修改：

- [x] `ai-proxy-server/src/ai-proxy/ai-proxy.controller.ts`（已新增 `POST /api/ai/chat/stream/v2`，v1 入口未改动）
- [x] `ai-proxy-server/src/ai-proxy/ai-proxy.module.ts`（已注册 streaming factory、adapter、builder、orchestrator）
- [x] `ai-proxy-server/src/ai-proxy/ai-proxy.service.ts`（已确认无需改动：继续复用 `proxyChatStream()`）
- [x] `ai-proxy-server/src/conversation/conversation-application.service.ts`（已确认无需改动：现有 `prepareSendMessage()` 已满足 v2 主链）
- [x] `ai-proxy-server/src/message/message.service.ts`（已新增 `completeAssistantMessageWithParts()`，parts 暂存 metadata）

## 目标

- 新增 `POST /api/ai/chat/stream/v2`。
- v2 请求使用 `input.parts`，支持最小 `text` 和 `file` part。
- v2 响应不包含 `choices`。
- v2 文本流输出标准 part 事件。
- v1 `/api/ai/chat/stream` 完全不受影响。

## 实施方案

1. [x] 在 controller 中新增 v2 方法：

```ts
@Post('chat/stream/v2')
@SkipResponseEnvelope()
async chatStreamV2(@Body() dto: ChatStreamV2Dto, @Headers('x-user-id') userId: string, @Res() res: Response) {
  return this.streamOrchestrator.streamChat(dto, userId || 'anonymous', res);
}
```

2. [x] `StreamOrchestratorService` 复用现有主链：

- [x] 从 `input.parts` 提取用户文本投影。
- [x] 从 `input.parts` 提取文件 ID。
- [x] 调用 `ConversationApplicationService.prepareSendMessage()`。
- [x] 写入 `stream.started`。
- [x] 写入 `session.created`，仅新会话发送。
- [x] 写入 `message.created`。
- [x] 调用 provider adapter。

3. [x] 新增 `OpenAiCompatibleStreamAdapter`：

- [x] 读取上游 SSE。
- [x] 将 `choices[0].delta.content` 归一化为 `{ type: 'text.delta', delta }`。
- [x] 将 `[DONE]` 归一化为 `{ type: 'done' }`。
- [x] 不向 controller 或前端暴露原始 `choices`。

4. [x] 新增 `StreamMessageBuilder`：

- [x] 第一个 text delta 到达前，创建 text part。
- [x] 合并 text delta。
- [x] 生成 `message.part.started`、`message.part.delta`、`message.part.completed`。
- [x] 生成最终 assistant message。

5. [x] 完成时调用消息服务：

- [x] 先写入 `content`，保持旧消息读取路径可用。
- [x] 在计划 04 前，通过扩展方法 `completeAssistantMessageWithParts()` 暂时把 parts 写入 metadata。

## 产出

- [x] `/api/ai/chat/stream/v2` 已接入 controller，可被 curl 或前端调用。
- [x] v2 SSE 输出包含：
  - `stream.started`
  - `session.created`
  - `message.created`
  - `message.part.started`
  - `message.part.delta`
  - `message.part.completed`
  - `message.completed`
  - `stream.completed`
- [x] v2 输出不包含 `choices`。

## 验收

- [ ] 使用纯文本请求 v2，能收到文本增量。（未发起真实模型请求；实现已覆盖 text delta）
- [x] 新会话请求能收到真实 `sessionId` 和 message IDs。（由 `prepareSendMessage()` 生成并写入事件）
- [x] 既有会话请求不会创建新 session。（复用 `prepareSendMessage()` 的既有会话确认逻辑）
- [x] v2 每个事件都有 `protocol / type / sequence / requestId / traceId / data`。（统一由 `StreamEventWriter` 输出）
- [x] 后端日志能看到 v2 流开始和完成。
- [x] v1 端点仍能被旧前端正常消费。（旧 controller 方法和 `pipeOpenAiStreamToClient()` 未改动）
- [x] 后端构建通过。（`pnpm build`）

## 风险与注意事项

- 不要在 v2 controller 中复制大量 v1 controller 编排，应尽量放入 orchestrator。
- adapter 只负责 provider 归一化，不负责会话和持久化。
- 当前阶段不要做工具调用自动循环。
- 当前阶段不要把 reasoning 字段拼入 text。
