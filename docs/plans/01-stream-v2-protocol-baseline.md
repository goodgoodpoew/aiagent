# 01 流式 v2 协议基线与共享类型计划

## 执行标注

- 执行日期：2026-06-04
- 执行范围：【已完成】按本计划新增后端 v2 协议类型、`StreamEventWriter`、`StreamingModule`、前端协议类型，并为前后端 `ChatMessage` 补充 `parts?: MessagePart[]`。
- 未接入说明：【保持不变】本阶段未修改 v1 `ChatStreamDto`，未新增 `/api/ai/chat/stream/v2` 端点，未改数据库结构，未改前端 `sendChatStream()`。
- 验证结果：【已验证】`ai-proxy-server` 执行 `pnpm build` 通过；`antdXStudy` 执行 `pnpm build` 通过。
- 回归搜索：【已验证】源码中未发现新增 `chat/stream/v2` 路由接入；`sendChatStream()` 与现有 `ChatStreamChunk` 解析逻辑保持原状。

## 动机

当前流式链路中，请求体、SSE chunk、前端 store、数据库消息和上游 OpenAI-compatible 结构相互混杂。后续如果直接在现有 `query + choices + delta` 上扩展思考过程、工具调用和 MCP，会继续扩大协议债务。

本计划先建立 v2 协议基线，只新增类型、事件 envelope 和写入工具，不改变现有业务流。它是后续所有小计划的地基。

## 修改原因

- 需要明确前后端共同遵守的请求结构和事件结构。
- 需要用 `protocol: aiagent.stream.v2` 支持 v1/v2 并行。
- 需要把高频 SSE 事件统一成带 `type / sequence / traceId / requestId / data` 的 envelope。
- 需要提前定义 `MessagePart`，避免后续 text、reasoning、tool、file、error 各自发明字段。

## 修改位置

后端：

- `ai-proxy-server/src/streaming/dto/chat-stream-v2.dto.ts`
- `ai-proxy-server/src/streaming/protocol/stream-event.types.ts`
- `ai-proxy-server/src/streaming/protocol/message-part.types.ts`
- `ai-proxy-server/src/streaming/protocol/stream-event-writer.ts`
- `ai-proxy-server/src/streaming/streaming.module.ts`

前端：

- `antdXStudy/src/service/stream-protocol.ts`
- `antdXStudy/src/store/types.ts`

文档：

- `docs/unified-streaming-io-protocol-plan.md`
- `docs/plans/01-stream-v2-protocol-baseline.md`

## 目标

- 建立后端 v2 DTO 和协议类型。
- 建立前端 v2 协议类型，字段命名与后端保持一致。
- 新增 `StreamEventWriter`，但暂不替换 v1 流。
- 明确 `ChatStreamRequestV2`、`StreamEventEnvelope`、`MessagePart` 的最小字段集。

## 实施方案

1. 新增 `ChatStreamRequestV2`：【已完成】

```ts
export interface ChatStreamRequestV2 {
  protocol: 'aiagent.stream.v2';
  requestId: string;
  clientMessageId: string;
  sessionId?: string;
  input: {
    role: 'user';
    parts: UserMessagePart[];
  };
  context?: ChatContextInput;
  runtime?: ChatRuntimeOptions;
  response?: ChatResponseOptions;
}
```

2. 新增 `StreamEventEnvelope`：【已完成】

```ts
export interface StreamEventEnvelope<T = unknown> {
  protocol: 'aiagent.stream.v2';
  id: string;
  type: StreamEventType;
  traceId: string;
  requestId: string;
  sessionId?: string;
  messageId?: string;
  timestamp: string;
  sequence: number;
  data: T;
}
```

3. 新增最小 `MessagePart`：【已完成】

```ts
export type MessagePart =
  | TextMessagePart
  | ReasoningMessagePart
  | ToolCallMessagePart
  | ToolResultMessagePart
  | FileMessagePart
  | ReferenceMessagePart
  | ErrorMessagePart;
```

4. 新增 `StreamEventWriter`：【已完成】

- 封装 SSE `event:`、`id:`、`data:` 写入。
- 内部维护当前流的递增 `sequence`。
- 统一写入 `protocol / traceId / requestId / timestamp`。
- 【保持不变】当前仅新增 writer 与 factory，不替换 v1 流式链路。

5. 前端增加同名类型：【已完成】

- 当前阶段可以复制类型，不引入 monorepo 共享包。
- 后续如果类型重复成本变高，再考虑抽出 shared package。

## 产出

- 后端 v2 协议类型文件。【已完成】
- 前端 v2 协议类型文件。【已完成】
- 可复用的 `StreamEventWriter`。【已完成】
- `ChatMessage` 类型具备可选 `parts?: MessagePart[]` 字段。【已完成】

## 验收

- `pnpm build` 在后端通过。【已验证：`ai-proxy-server`】
- `pnpm build` 在前端通过。【已验证：`antdXStudy`】
- 现有 `POST /api/ai/chat/stream` 行为不变。【已验证：未改 v1 controller/service 接入点】
- 代码中能静态引用 `ChatStreamRequestV2`、`StreamEventEnvelope`、`MessagePart`。【已完成】
- 没有任何前端主流程开始依赖未实现的 v2 端点。【已验证：未新增 v2 端点调用】

## 风险与注意事项

- 不要在本阶段改 v1 `ChatStreamDto`。【保持不变】
- 不要在本阶段改数据库结构。【保持不变】
- 不要在本阶段改 `sendChatStream()`。【保持不变】
- 类型命名必须稳定，后续计划会继续使用。【已遵守】
