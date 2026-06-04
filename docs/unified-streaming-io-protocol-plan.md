# 流式输入输出统一结构化协议设计与实施方案

生成日期：2026-06-04

## 1. 背景与目标

当前项目已经完成了会话、消息、文件、模型供应商、统一非流式响应层和可靠会话生命周期等关键基础建设，但流式聊天链路仍处在“能跑通 + 兼容前端组件 + 兼容 OpenAI 风格上游”的阶段。

这在学习演示阶段是合理的，但如果后续要扩展自定义工具、MCP、思考过程、复杂附件、RAG、代码执行、图片/文件输出、多模型适配，就必须尽早把流式输入输出升级为稳定协议。否则每新增一种能力，都会继续挤压当前 `query + choices + delta + message.content` 的临时结构，最终形成一次代价很高的大重构。

本方案的核心目标：

- 建立前后端一致的流式请求和响应协议。
- 把“业务协议”和“上游模型供应商协议”解耦。
- 把“运行态事件”和“最终持久化消息”解耦。
- 支持文本、思考过程、工具调用、MCP、附件、引用、错误、用量统计等扩展。
- 保持与当前 Ant Design X、Redux Store、NestJS 后端和 Prisma 数据结构的渐进兼容。
- 避免现在就过度设计成一个庞大的 agent 框架，但为后续 agent 化留下稳定接口。

推荐结论：

> 采用 **应用层统一消息 parts + 运行态 SSE event envelope + provider adapter 归一化** 的方案。
>
> 后端对外不再暴露 OpenAI `choices` 结构作为主协议；前端不再理解上游 delta 细节；数据库短期保留 `Message.content` 字段作为文本投影，把结构化 parts 写入 `metadata`，中长期再视复杂度拆表。

## 2. 当前链路现状

### 2.1 请求链路

```text
antdXStudy
  |
  | POST http://localhost:3001/api/ai/chat/stream
  v
AiProxyController.chatStream()
  |
  | ConversationApplicationService.prepareSendMessage()
  | - 创建/确认 session
  | - 创建 user message
  | - 创建 assistant placeholder
  | - 构建 llmMessages
  v
AiProxyService.proxyChatStream()
  |
  | OpenAI-compatible /chat/completions stream
  v
pipeOpenAiStreamToClient()
  |
  | event: message.delta
  | data: { sessionId, messageId, delta, choices: [...] }
  v
antdXStudy/src/service/chat.ts
  |
  | 解析 SSE，提取 chunk.delta 或 choices[0].message.content
  v
Redux messageStore.appendAssistantDelta()
```

### 2.2 已有优点

当前链路并不是一团乱麻，已经有一些重要基础：

- `requestId` 和 `clientMessageId` 已经进入请求体，具备幂等改造基础。
- `ConversationApplicationService.prepareSendMessage()` 已经把发送前置准备从 controller 中抽离出来。
- assistant placeholder 已经在请求模型前创建，完成时再补全文本。
- 当前聊天流中已经有 `session.created`、`message.created`、`message.delta`、`error`、`done` 等显式事件。
- 独立的 `/api/sessions/events` 已经承担会话列表、标题、消息完成等低频可重放事件。
- 非流式统一响应层已经明确把 SSE 排除，避免普通 JSON envelope 污染流式协议。

这些基础可以保留，并作为新协议迁移的承重墙。

### 2.3 主要问题

#### 问题 1：前后端结构不一致

后端 `ChatStreamDto` 是面向前端发送动作的结构：

```ts
{
  query: string;
  sessionId?: string;
  provider?: string;
  model?: string;
  fileIds?: string[];
}
```

前端运行态消息是：

```ts
{
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: Record<string, unknown>;
}
```

流式输出又是近似 OpenAI 的结构：

```ts
{
  sessionId?: string;
  messageId?: string;
  delta?: string;
  choices: [
    {
      message: {
        content: string;
        role: string;
      }
    }
  ]
}
```

同一个“消息”在请求、响应、store、数据库和上游适配中有多套形态，字段意义不完全一致。

#### 问题 2：只允许对话文本格式传输

当前主通道只有 `query` 和 `content`。附件通过 `fileIds` 旁路传入，最终上下文会被压成 LLM `messages`。这会限制后续能力：

- 用户输入可能包含多个 part：文本、文件、图片、引用、选区、命令。
- assistant 输出可能包含多个 part：普通文本、思考过程、工具调用、工具结果、引用、结构化 JSON、文件。
- 工具调用不是一段文本，而是有 `toolCallId`、`toolName`、`arguments`、`status`、`result` 的状态机。
- MCP 不是一个普通文本附件，而是外部能力、资源和工具的运行时协议。

#### 问题 3：状态在前后端表达不一致

当前前端有 `sending / streaming / done / error`，后端通过 assistant placeholder、queue、metadata、SSE error、Redis Streams 等方式表达状态。两边状态概念接近，但没有统一状态机。

结果是：

- 前端为了展示必须自己判断 `done`、`error` 和增量文本。
- 后端为了迁就前端和 OpenAI-compatible 格式，把 `delta` 和 `choices` 同时下发。
- 错误既可能是 HTTP 非 2xx，也可能是 SSE `event:error`，也可能是 `chunk.status === 'error'`。
- 思考、工具、引用、文件等未来状态没有位置。

#### 问题 4：思考过程缺失

DeepSeek、Claude、OpenAI 等模型都已经出现“reasoning / thinking / reasoning summary”相关能力，但当前协议只有 assistant 文本。

需要注意：

- 有些供应商返回可展示的思考摘要。
- 有些供应商返回不可展示的内部推理 token。
- 有些供应商支持加密或签名过的 thinking block，用于多轮延续但不应该直接展示。
- 产品侧可能只展示“思考中”状态和最终摘要，而不展示完整推理。

因此，“思考过程”不能简单拼进 `content`，必须作为独立 part 和独立权限策略处理。

## 3. 主流方案剖析

本节只参考官方文档和业内已经广泛采用的协议形态，提炼对本项目有用的设计原则。

### 3.1 OpenAI Responses API：事件语义化

OpenAI Responses API 的流式输出采用细粒度事件，常见事件包括 response 生命周期、输出项创建、文本 delta、文本完成、工具调用参数 delta、完成、错误等。官方文档见：[OpenAI Responses API streaming](https://platform.openai.com/docs/api-reference/responses-streaming)。

它的关键思想：

- 流里传输的不是“一个越来越长的 message”，而是一组运行态事件。
- 文本增量、工具参数增量、输出项完成、response 完成是不同事件。
- 客户端可以按事件类型更新 UI，而不是猜测 JSON shape。
- `response`、`output_item`、`content_part` 是分层概念，适合多模态和工具调用。

对本项目的启发：

- `message.delta` 只适合文本，不应该承载所有未来能力。
- 应引入 `partId`、`partType`、`delta`、`status`，让文本、思考、工具调用都能以相同 envelope 传输。
- 后端 adapter 应把 OpenAI 原始事件归一化为项目内部事件，不让前端直接依赖 OpenAI 结构。

### 3.2 Anthropic Messages API：内容块与工具块

Anthropic Messages API 的 streaming 使用 `message_start`、`content_block_start`、`content_block_delta`、`content_block_stop`、`message_delta`、`message_stop` 等事件，内容被组织成 text、thinking、tool_use、tool_result 等 content block。官方文档见：[Anthropic streaming Messages](https://docs.anthropic.com/en/docs/build-with-claude/streaming) 和 [Messages API](https://docs.anthropic.com/en/api/messages)。

它的关键思想：

- 一条 assistant message 可以包含多个 content block。
- 每个 block 有明确类型和生命周期。
- 工具调用是 first-class block，不是文本里解析出来的 JSON。
- Thinking 是独立 block，可以与普通文本分离处理。

对本项目的启发：

- 应把 `Message.content` 视为兼容投影，而不是唯一事实。
- 目标消息结构应该是 `message.parts[]`。
- 工具调用和思考过程都应以 part 形式进入同一条 assistant message。
- 前端 Bubble 只渲染可展示 part，不必知道 provider 原始事件。

### 3.3 Vercel AI SDK：前端友好的 data stream / UIMessage

Vercel AI SDK 在 UI 层强调 `UIMessage` 和 stream protocol。它把模型输出转成前端可消费的消息 part，支持 text、reasoning、tool invocation、data part、finish、error 等概念。官方文档见：[AI SDK UI stream protocol](https://v5.ai-sdk.dev/docs/ai-sdk-ui/stream-protocol) 和 [AI SDK UI messages](https://v5.ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence)。

它的关键思想：

- UI 不直接消费 provider 原始协议。
- 消息持久化时保留 UI message 的 parts，而不是只保留纯文本。
- 流式事件和最终消息结构可以对应，减少完成后对账成本。
- Tool invocation 有稳定状态：partial-call、call、result、error。

对本项目的启发：

- 前端 Redux Store 应从 `content: string` 逐步升级到 `parts: MessagePart[]`。
- `content` 可以继续作为文本聚合字段，服务 Markdown/Bubble 兼容。
- 流式 reducer 应从 `appendAssistantDelta(messageId, delta)` 升级为 `applyStreamEvent(event)`。

### 3.4 MCP：工具与资源不是普通消息文本

MCP 把模型应用与外部工具、资源、提示词等能力解耦，典型概念包括 tools、resources、prompts、notifications、sampling。官方文档见：[Model Context Protocol architecture](https://modelcontextprotocol.io/docs/concepts/architecture)。

它的关键思想：

- 工具是有 schema 的能力，不是字符串命令。
- 工具执行有请求、参数、结果、错误、通知等生命周期。
- 资源可以被引用和读取，不应该简单拼进用户文本。
- Host / Client / Server 之间需要明确边界。

对本项目的启发：

- 自定义工具和 MCP 工具都应该进入统一 `tool.call.*` / `tool.result.*` 事件。
- 请求体需要支持 `tools`、`toolChoice`、`context.resources`。
- 消息 part 需要能记录工具调用和工具结果，方便刷新后复原 UI。

### 3.5 主流方案共同点

成熟方案基本都收敛到下面几个原则：

- **事件语义化**：流式输出是事件序列，不是不断覆盖的 JSON 响应。
- **消息结构化**：一条消息由多个 part/block 组成，不只有 `content: string`。
- **provider 隔离**：上游协议只存在 adapter 层，对前端和业务层不可见。
- **工具 first-class**：工具调用、工具结果、错误、重试是协议能力。
- **状态机明确**：请求、消息、part、工具调用都有独立状态。
- **最终消息可恢复**：刷新页面后，可以从数据库恢复接近流式过程结束时的结构化 UI。
- **思考过程分级处理**：可展示摘要、不可展示内部推理、可续传 encrypted thinking 需要分开。

## 4. 推荐目标架构

### 4.1 分层原则

```text
Frontend UI
  |
  | Project Stream Protocol
  v
Frontend Stream Client / Redux Store
  |
  | Project Stream Protocol
  v
NestJS Stream Controller
  |
  | Application Stream Events
  v
Conversation Orchestrator
  |
  | Normalized Provider Events
  v
Model Provider Adapter
  |
  | Native Provider Protocol
  v
OpenAI / DeepSeek / Claude / Gemini / MCP / Custom Tools
```

各层职责：

| 层级 | 职责 | 不应该做的事 |
| --- | --- | --- |
| UI | 渲染消息 part 和运行状态 | 解析 OpenAI `choices` |
| Stream Client | 解析 SSE envelope，派发 store action | 拼接 provider 原始 delta |
| Redux Store | 按 message/part/tool 状态更新投影 | 知道上游模型事件名 |
| Controller | 建立 SSE、认证、限流、调用用例 | 编排所有 provider 细节 |
| Orchestrator | 会话、上下文、工具、模型流、持久化 | 暴露 provider 原始结构 |
| Provider Adapter | 把上游事件转成 NormalizedEvent | 写 UI 状态 |

### 4.2 总体流程

```text
1. 前端提交 ChatStreamRequestV2。
2. 后端确认 session、创建 user message、创建 assistant placeholder。
3. 后端返回 stream.start / session.created / message.created。
4. 后端把请求转换为 provider native request。
5. provider adapter 读取上游流，输出 NormalizedProviderEvent。
6. orchestrator 把 normalized event 转成 ProjectStreamEvent 并写给 SSE。
7. 前端按 event.type 更新 message.parts。
8. 流完成后，后端持久化 assistant structured parts 和 content 投影。
9. 前端收到 message.completed / stream.completed 后把运行态置为 done。
10. 刷新页面后，前端从 messages API 恢复 content + parts + metadata。
```

## 5. 统一请求协议

建议新增 `POST /api/ai/chat/stream/v2`，不要直接覆盖旧接口。旧接口保留一段时间做兼容，前端主聊天页迁移到 v2 后再删除。

### 5.1 `ChatStreamRequestV2`

```ts
export interface ChatStreamRequestV2 {
  protocol: 'aiagent.stream.v2';
  requestId: string;
  clientMessageId: string;
  sessionId?: string;

  input: UserMessageInput;
  context?: ChatContextInput;
  runtime?: ChatRuntimeOptions;
  response?: ChatResponseOptions;
}
```

### 5.2 用户输入结构

```ts
export interface UserMessageInput {
  role: 'user';
  parts: UserMessagePart[];
}

export type UserMessagePart =
  | TextInputPart
  | FileInputPart
  | ImageInputPart
  | ResourceReferencePart
  | CommandInputPart;

export interface TextInputPart {
  type: 'text';
  text: string;
}

export interface FileInputPart {
  type: 'file';
  fileId: string;
  name?: string;
  mimeType?: string;
}

export interface ImageInputPart {
  type: 'image';
  fileId: string;
  mimeType?: string;
  detail?: 'low' | 'high' | 'auto';
}

export interface ResourceReferencePart {
  type: 'resource';
  uri: string;
  title?: string;
  source?: 'mcp' | 'local' | 'web' | 'session';
}

export interface CommandInputPart {
  type: 'command';
  name: string;
  args?: Record<string, unknown>;
}
```

说明：

- 当前 `query` 迁移为 `input.parts: [{ type: 'text', text: query }]`。
- 当前 `fileIds` 迁移为多个 `file` part。
- 后续图片输入、MCP resource、快捷命令不需要再改顶层 DTO。

### 5.3 上下文结构

```ts
export interface ChatContextInput {
  includeHistory?: boolean;
  historyLimit?: number;
  fileIds?: string[];
  resources?: Array<{
    uri: string;
    type?: string;
    source?: 'mcp' | 'local' | 'web' | 'session';
  }>;
}
```

说明：

- `input.parts` 表达“用户这次明确发送了什么”。
- `context` 表达“模型可参考什么”。
- 同一个文件既可能是用户这次上传的 part，也可能是会话上下文中的参考资源。

### 5.4 运行参数

```ts
export interface ChatRuntimeOptions {
  provider?: string;
  model?: string;
  credentialId?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: true;

  tools?: ToolDefinitionRef[];
  toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string };

  reasoning?: {
    enabled?: boolean;
    effort?: 'low' | 'medium' | 'high';
    display?: 'none' | 'summary' | 'full';
  };

  autoGenerateSessionName?: boolean;
}
```

说明：

- 保留现有 provider/model/credentialId 语义。
- 新增 `tools` 和 `toolChoice`，为自定义工具和 MCP 做入口。
- `reasoning.display` 是产品展示策略，不等于上游 provider 一定返回完整 thinking。

### 5.5 工具定义引用

```ts
export interface ToolDefinitionRef {
  source: 'builtin' | 'custom' | 'mcp';
  name: string;
  serverId?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}
```

第一阶段可以只传 `source/name/serverId`，schema 由后端工具注册表补齐。不要让前端成为工具 schema 的唯一来源。

### 5.6 响应偏好

```ts
export interface ChatResponseOptions {
  modalities?: Array<'text' | 'image' | 'file' | 'json'>;
  format?: 'text' | 'json_object' | { type: 'json_schema'; schema: Record<string, unknown> };
}
```

这部分先定义协议位置，不要求第一阶段全部实现。

## 6. 统一 SSE 输出协议

### 6.1 SSE 基础格式

使用标准 SSE：

```text
event: message.part.delta
id: stream_evt_01j...
data: {"protocol":"aiagent.stream.v2","type":"message.part.delta",...}
```

约定：

- `event:` 与 `data.type` 保持一致，方便浏览器和日志排查。
- 每个事件都带 `id`，便于调试和未来断线恢复。
- 当前 chat stream 是高频临时通道，默认不要求 token 级重放；低频业务事件仍走 `/api/sessions/events`。
- `data` 永远是 JSON，只有兼容旧客户端时才保留 `[DONE]`。

### 6.2 通用事件 envelope

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

字段说明：

| 字段 | 说明 |
| --- | --- |
| `protocol` | 协议版本，便于并行支持 v1/v2 |
| `id` | 事件 ID |
| `type` | 事件类型 |
| `traceId` | 后端请求追踪 ID |
| `requestId` | 前端发送动作幂等 ID |
| `sessionId` | 真实会话 ID |
| `messageId` | 相关消息 ID |
| `sequence` | 当前流内递增序号，用于前端排查乱序 |
| `data` | 事件负载 |

### 6.3 事件类型

```ts
export type StreamEventType =
  | 'stream.started'
  | 'session.created'
  | 'message.created'
  | 'message.part.started'
  | 'message.part.delta'
  | 'message.part.completed'
  | 'message.completed'
  | 'tool.call.started'
  | 'tool.call.delta'
  | 'tool.call.completed'
  | 'tool.result.started'
  | 'tool.result.completed'
  | 'reasoning.started'
  | 'reasoning.delta'
  | 'reasoning.completed'
  | 'usage.updated'
  | 'stream.completed'
  | 'stream.failed';
```

第一阶段必须实现：

- `stream.started`
- `session.created`
- `message.created`
- `message.part.started`
- `message.part.delta`
- `message.part.completed`
- `message.completed`
- `stream.completed`
- `stream.failed`

第二阶段实现：

- `reasoning.*`
- `usage.updated`

第三阶段实现：

- `tool.*`

### 6.4 `stream.started`

```json
{
  "protocol": "aiagent.stream.v2",
  "type": "stream.started",
  "requestId": "req_...",
  "data": {
    "provider": "deepseek",
    "model": "deepseek-chat",
    "createdAt": "2026-06-04T10:00:00.000Z"
  }
}
```

用途：

- 前端确认请求已经进入后端主链。
- 展示“正在连接模型”或“正在生成”。
- 日志可快速定位某次流。

### 6.5 `session.created`

沿用当前语义，但纳入 envelope：

```json
{
  "type": "session.created",
  "sessionId": "session_...",
  "data": {
    "session": {
      "id": "session_...",
      "title": "临时标题",
      "titleStatus": "pending",
      "version": 1,
      "createdAt": "2026-06-04T10:00:00.000Z",
      "updatedAt": "2026-06-04T10:00:00.000Z"
    }
  }
}
```

如果是既有会话，可以不发送 `session.created`，但必须在 `message.created` 中带真实 `sessionId`。

### 6.6 `message.created`

```json
{
  "type": "message.created",
  "sessionId": "session_...",
  "messageId": "assistant_msg_...",
  "data": {
    "userMessage": {
      "id": "user_msg_...",
      "role": "user",
      "parts": [{ "id": "part_1", "type": "text", "text": "你好" }],
      "content": "你好",
      "status": "done"
    },
    "assistantMessage": {
      "id": "assistant_msg_...",
      "role": "assistant",
      "parts": [],
      "content": "",
      "status": "streaming"
    },
    "clientMessageId": "client_msg_..."
  }
}
```

用途：

- 前端用服务端真实 ID 替换乐观 ID。
- 前端能立即获得 user/assistant 两条消息的权威结构。
- 兼容当前 `replaceMessageId`、`replaceMessageSessionId` 流程。

### 6.7 `message.part.started`

```json
{
  "type": "message.part.started",
  "messageId": "assistant_msg_...",
  "data": {
    "part": {
      "id": "part_text_1",
      "type": "text",
      "status": "streaming",
      "text": ""
    }
  }
}
```

用途：

- 前端创建一个可独立更新的 part。
- 后续 `delta` 只更新这个 part。

### 6.8 `message.part.delta`

```json
{
  "type": "message.part.delta",
  "messageId": "assistant_msg_...",
  "data": {
    "partId": "part_text_1",
    "type": "text",
    "delta": "你好，我可以帮你"
  }
}
```

说明：

- 这是当前 `message.delta` 的替代。
- 不再携带 OpenAI `choices`。
- 前端 reducer 根据 `messageId + partId` 合并文本。

### 6.9 `message.part.completed`

```json
{
  "type": "message.part.completed",
  "messageId": "assistant_msg_...",
  "data": {
    "partId": "part_text_1",
    "type": "text",
    "status": "done",
    "text": "你好，我可以帮你..."
  }
}
```

用途：

- 标记某个 part 完成。
- 允许后续继续追加新的 part，例如先 thinking，后 text，再 tool call。

### 6.10 `message.completed`

```json
{
  "type": "message.completed",
  "messageId": "assistant_msg_...",
  "data": {
    "message": {
      "id": "assistant_msg_...",
      "role": "assistant",
      "content": "你好，我可以帮你...",
      "parts": [
        {
          "id": "part_text_1",
          "type": "text",
          "text": "你好，我可以帮你...",
          "status": "done"
        }
      ],
      "status": "done",
      "metadata": {
        "provider": "deepseek",
        "model": "deepseek-chat"
      }
    }
  }
}
```

用途：

- 前端以完整 message 做最终对账。
- 后端以相同结构持久化，刷新后恢复。

### 6.11 `stream.completed`

```json
{
  "type": "stream.completed",
  "data": {
    "finishReason": "stop",
    "usage": {
      "inputTokens": 120,
      "outputTokens": 360,
      "totalTokens": 480
    }
  }
}
```

说明：

- 表示本次请求流结束。
- 与 `message.completed` 分开，因为一次请求未来可能产生多个 assistant message 或工具结果事件。

### 6.12 `stream.failed`

```json
{
  "type": "stream.failed",
  "messageId": "assistant_msg_...",
  "data": {
    "code": "UPSTREAM_TIMEOUT",
    "message": "模型响应超时，请稍后重试",
    "retryable": true,
    "stage": "provider_stream"
  }
}
```

错误规则：

- 所有流内错误统一使用 `stream.failed`，不再同时使用 `event:error`、`status:error`、`choices` 错误块。
- HTTP 层错误只表达“流未建立成功”，例如鉴权失败、参数校验失败、限流。
- 流已经建立后发生的错误，用 `stream.failed` 表达，并正常关闭 SSE。
- 错误事件必须落入 assistant message 的失败状态，刷新后可见。

## 7. 统一消息结构

### 7.1 `ChatMessageV2`

```ts
export interface ChatMessageV2 {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  parts: MessagePart[];
  status: 'pending' | 'sending' | 'streaming' | 'done' | 'failed' | 'cancelled';
  metadata?: MessageMetadata;
  createdAt: string;
  updatedAt?: string;
}
```

说明：

- `content` 是兼容投影，默认由可展示 text parts 聚合得到。
- `parts` 是结构化事实。
- 当前数据库 `Message.content` 保留，不立刻拆表。
- 当前数据库 `Message.metadata` 写入 `parts/status/provider/model/usage`。

### 7.2 `MessagePart`

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

### 7.3 文本 part

```ts
export interface TextMessagePart {
  id: string;
  type: 'text';
  text: string;
  status: 'streaming' | 'done';
}
```

### 7.4 思考 part

```ts
export interface ReasoningMessagePart {
  id: string;
  type: 'reasoning';
  text?: string;
  summary?: string;
  encryptedContent?: string;
  visibility: 'hidden' | 'summary' | 'full';
  status: 'streaming' | 'done';
}
```

策略：

- 默认 `visibility: 'summary'` 或 `hidden`。
- 不把完整思考直接拼进 `content`。
- 如果 provider 返回不可展示 thinking，仅保存必要续传信息或摘要，不进入普通 UI 文本。
- 产品 UI 可以显示“正在思考”状态，以及最终摘要。

### 7.5 工具调用 part

```ts
export interface ToolCallMessagePart {
  id: string;
  type: 'tool_call';
  toolCallId: string;
  toolName: string;
  source: 'builtin' | 'custom' | 'mcp';
  argumentsText?: string;
  arguments?: Record<string, unknown>;
  status: 'partial' | 'ready' | 'running' | 'done' | 'failed';
}
```

### 7.6 工具结果 part

```ts
export interface ToolResultMessagePart {
  id: string;
  type: 'tool_result';
  toolCallId: string;
  toolName: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
  status: 'done' | 'failed';
}
```

### 7.7 文件和引用 part

```ts
export interface FileMessagePart {
  id: string;
  type: 'file';
  fileId: string;
  name: string;
  mimeType?: string;
  size?: number;
}

export interface ReferenceMessagePart {
  id: string;
  type: 'reference';
  title: string;
  uri?: string;
  fileId?: string;
  quote?: string;
  source?: 'file' | 'mcp' | 'web' | 'session';
}
```

### 7.8 错误 part

```ts
export interface ErrorMessagePart {
  id: string;
  type: 'error';
  code: string;
  message: string;
  retryable: boolean;
}
```

错误也作为 part 持久化，避免刷新后失败消息变成空白 assistant。

## 8. 状态机设计

### 8.1 请求状态

```text
created -> preparing -> streaming -> completing -> completed
                      \-> failed
                      \-> cancelled
```

含义：

| 状态 | 说明 |
| --- | --- |
| `created` | 前端生成 requestId |
| `preparing` | 后端确认会话、保存用户消息、创建 assistant placeholder |
| `streaming` | 上游模型正在输出 |
| `completing` | 上游完成，后端正在持久化和派发完成事件 |
| `completed` | 本次请求完成 |
| `failed` | 任意阶段失败 |
| `cancelled` | 用户取消 |

### 8.2 消息状态

```text
pending -> sending -> done
pending -> streaming -> done
pending -> streaming -> failed
pending -> cancelled
```

用户消息通常是：

```text
sending -> done
```

assistant 消息通常是：

```text
streaming -> done
```

失败时：

```text
streaming -> failed
```

### 8.3 part 状态

文本和思考：

```text
streaming -> done
streaming -> failed
```

工具调用：

```text
partial -> ready -> running -> done
                     \-> failed
```

说明：

- `partial`：模型还在流式输出工具参数。
- `ready`：参数完整，可以执行。
- `running`：后端正在执行工具。
- `done/failed`：工具执行结束。

### 8.4 前后端状态对应

| 后端事件 | 前端动作 |
| --- | --- |
| `stream.started` | 设置请求状态为 streaming/preparing |
| `session.created` | 替换 draft session |
| `message.created` | 替换乐观消息 ID，插入权威消息 |
| `message.part.started` | 创建 part |
| `message.part.delta` | 合并 part delta，更新 `content` 投影 |
| `message.part.completed` | 标记 part done |
| `message.completed` | 用完整 message 对账 |
| `stream.completed` | 清理 streamingMessageId |
| `stream.failed` | 标记 request/message/part failed，写入错误 part |

## 9. Provider Adapter 设计

### 9.1 为什么必须引入 adapter

当前 `pipeOpenAiStreamToClient()` 直接读取 OpenAI-compatible SSE，并写给前端。这会导致：

- 前端被迫知道 `choices`。
- DeepSeek、OpenAI、Claude、Gemini 的差异会不断泄漏到 UI。
- 工具调用、reasoning、usage 只能临时塞字段。
- 流式错误和完成逻辑难以统一。

建议把流式处理拆为两层：

```text
Native Provider Stream
  -> ProviderStreamAdapter
  -> NormalizedProviderEvent
  -> ProjectStreamWriter
  -> SSE ProjectStreamEvent
```

### 9.2 `NormalizedProviderEvent`

```ts
export type NormalizedProviderEvent =
  | { type: 'text.start'; partId?: string }
  | { type: 'text.delta'; partId?: string; delta: string }
  | { type: 'text.done'; partId?: string; text?: string }
  | { type: 'reasoning.start'; partId?: string; visibility?: 'hidden' | 'summary' | 'full' }
  | { type: 'reasoning.delta'; partId?: string; delta: string }
  | { type: 'reasoning.done'; partId?: string; text?: string; summary?: string; encryptedContent?: string }
  | { type: 'tool.call.start'; toolCallId: string; toolName: string; source?: string }
  | { type: 'tool.call.delta'; toolCallId: string; argumentsDelta: string }
  | { type: 'tool.call.done'; toolCallId: string; arguments: Record<string, unknown> }
  | { type: 'usage'; usage: TokenUsage }
  | { type: 'done'; finishReason?: string }
  | { type: 'error'; error: StreamErrorPayload };
```

### 9.3 Adapter 接口

```ts
export interface ProviderStreamAdapter {
  readonly provider: string;
  readonly adapterType: string;

  buildRequest(input: ProviderRequestInput): unknown;

  stream(request: ProviderRequestInput): AsyncIterable<NormalizedProviderEvent>;
}
```

第一阶段可以先实现：

- `OpenAiCompatibleStreamAdapter`

后续再增加：

- `OpenAiResponsesStreamAdapter`
- `AnthropicMessagesStreamAdapter`
- `GeminiStreamAdapter`

### 9.4 OpenAI-compatible 适配策略

当前上游 `/chat/completions` delta：

```json
{
  "choices": [
    {
      "delta": {
        "role": "assistant",
        "content": "你好"
      }
    }
  ]
}
```

归一化为：

```ts
{ type: 'text.delta', delta: '你好' }
```

当收到 `[DONE]`：

```ts
{ type: 'done', finishReason: 'stop' }
```

如果上游支持 reasoning_content：

```ts
{ type: 'reasoning.delta', delta: chunk.choices[0].delta.reasoning_content }
```

不要把 `reasoning_content` 拼入普通 text。

## 10. 工具与 MCP 扩展方案

### 10.1 工具执行边界

建议工具执行由后端 orchestrator 管理，而不是前端执行。原因：

- API Key、文件、数据库、MCP server 凭据都在后端更安全。
- 工具执行结果需要进入消息持久化。
- 后端可以统一限流、超时、审计、脱敏和错误处理。

### 10.2 工具注册表

建议新增：

```text
ai-proxy-server/src/tools/
  tool-registry.service.ts
  tool-executor.service.ts
  dto/tool-definition.dto.ts
  adapters/
    builtin-tool.adapter.ts
    custom-tool.adapter.ts
    mcp-tool.adapter.ts
```

工具定义：

```ts
export interface ToolDefinition {
  source: 'builtin' | 'custom' | 'mcp';
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId?: string;
  enabled: boolean;
}
```

工具执行结果：

```ts
export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  ok: boolean;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}
```

### 10.3 工具调用流

```text
provider emits tool call arguments
  -> tool.call.started
  -> tool.call.delta
  -> tool.call.completed
  -> backend validates arguments
  -> tool.result.started
  -> execute tool / MCP
  -> tool.result.completed
  -> append tool result to model context
  -> continue model stream
```

### 10.4 MCP 适配

MCP 进入项目时，不建议让前端直接连接 MCP server。推荐：

```text
Frontend
  -> Backend ToolRegistry
  -> MCP Client
  -> MCP Server
```

后端负责：

- 维护 MCP server 配置。
- 获取 tools/resources/prompts。
- 把 MCP tool 映射为 `ToolDefinition`。
- 执行 MCP tool call。
- 把 MCP resource 映射为 `ResourceReferencePart` 或上下文资源。

前端只关心：

- 用户选择了哪些工具。
- 当前工具调用状态。
- 工具结果如何展示。

## 11. 思考过程处理方案

### 11.1 分类

| 类型 | 是否展示 | 是否持久化 | 说明 |
| --- | --- | --- | --- |
| 内部推理 token | 默认不展示 | 通常不持久化 | 供应商可能禁止或不建议展示 |
| reasoning summary | 可展示 | 可持久化 | 适合作为“思考摘要” |
| encrypted thinking | 不展示 | 可按需持久化 | 用于多轮上下文延续 |
| thinking status | 展示状态 | 不一定持久化 | “正在分析文件”“正在规划工具调用” |

### 11.2 UI 展示建议

第一阶段：

- 只显示“正在思考”状态，不展示详细推理。
- 如果 adapter 收到 reasoning summary，则作为可折叠摘要 part 展示。

第二阶段：

- 支持 `ReasoningMessagePart.visibility`。
- 支持用户配置“显示摘要 / 不显示”。

### 11.3 安全规则

- 不把 reasoning 自动拼入 assistant `content`。
- 不把 reasoning 发送给无关日志。
- 不在错误信息里泄漏完整上游 reasoning。
- 如果 provider 要求 encrypted thinking 回传，必须通过 metadata 受控保存。

## 12. 数据库与持久化迁移

### 12.1 当前数据模型

当前 Prisma `Message`：

```prisma
model Message {
  id        String   @id @default(uuid())
  sessionId String
  role      String
  content   String   @db.Text
  metadata  Json?    @db.JsonB
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

这是可以渐进迁移的。

### 12.2 第一阶段：不改表

写入方式：

```json
{
  "content": "assistant 可展示文本投影",
  "metadata": {
    "protocol": "aiagent.message.v2",
    "status": "done",
    "parts": [
      {
        "id": "part_text_1",
        "type": "text",
        "text": "assistant 可展示文本投影",
        "status": "done"
      }
    ],
    "usage": {
      "inputTokens": 120,
      "outputTokens": 360,
      "totalTokens": 480
    },
    "provider": "deepseek",
    "model": "deepseek-chat"
  }
}
```

优点：

- 不需要立刻写迁移 SQL。
- 旧消息列表接口仍能通过 `content` 工作。
- 新前端可以读取 `metadata.parts`。
- 回滚容易。

### 12.3 第二阶段：扩展 Message 字段

当结构化 part 使用稳定后，可以考虑：

```prisma
model Message {
  id        String   @id @default(uuid())
  sessionId String
  role      String
  content   String   @db.Text
  parts     Json?    @db.JsonB
  status    String   @default("done")
  metadata  Json?    @db.JsonB
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

优点：

- 查询和类型表达更清晰。
- metadata 不再混合业务结构和杂项信息。

### 12.4 第三阶段：拆分 MessagePart 表

只有当出现以下需求时才建议拆表：

- part 数量很多，需要分页或单独检索。
- 工具调用结果很大，需要单独索引。
- 引用、文件、代码块等需要独立权限和生命周期。
- 需要对 reasoning/tool usage 做统计查询。

否则 JSONB 已经足够。

## 13. 前端改造方案

### 13.1 类型升级

在 `antdXStudy/src/store/types.ts` 中新增：

```ts
export interface ChatMessage {
  id: string;
  sessionId: string;
  role: ChatRole;
  content: string;
  parts?: MessagePart[];
  status?: MessageRuntimeStatus;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt?: string;
}
```

保留 `content`，新增 `parts`。

### 13.2 Stream client 升级

当前 `sendChatStream()` 做了这些事：

- 拼接 v1 body。
- 解析 SSE。
- 针对 `session.created/message.created/error/done` 做分支。
- 对其他 chunk 提取 `chunk.delta || choices[0].message.content`。

建议新增：

```text
antdXStudy/src/service/chat-stream-v2.ts
```

职责：

- 发送 `ChatStreamRequestV2`。
- 解析 `StreamEventEnvelope`。
- 不再理解 `choices`。
- 调用 `handlers.onEvent(event)`。

### 13.3 Redux reducer 升级

当前：

```ts
appendAssistantDelta({ messageId, delta })
```

建议新增：

```ts
applyStreamEvent(event: StreamEventEnvelope)
```

内部按事件类型更新：

- `message.created`：upsert user/assistant message。
- `message.part.started`：创建 part。
- `message.part.delta`：更新 part，并同步 `content` 投影。
- `message.part.completed`：标记 part 完成。
- `message.completed`：用完整 message 覆盖运行态投影。
- `stream.failed`：写错误 part 和消息状态。

### 13.4 UI 渲染升级

新增：

```text
antdXStudy/src/pages/base/components/MessagePartsRenderer.tsx
```

渲染策略：

| part 类型 | UI |
| --- | --- |
| `text` | Markdown |
| `reasoning` | 可折叠“思考过程/思考摘要” |
| `tool_call` | 工具调用状态行 |
| `tool_result` | 工具结果摘要 |
| `file` | 文件卡片 |
| `reference` | 引用块 |
| `error` | Alert |

第一阶段可以只实现 `text/error/reasoning summary`，其他 part 先用紧凑 JSON/占位渲染。

### 13.5 Ant Design X 兼容

当前 `chat-shared.ts` 中 `StreamChatProvider` 是为了 `@ant-design/x-sdk` 适配 v1 SSE。新主聊天页已经有 `sendChatStream + Redux` 路径，建议：

- `/ai/chat` 主路径优先迁移到 v2 stream client。
- `src/pages/example/chat.tsx` 等示例页可以暂时保留 v1 provider。
- `chat-shared.ts` 后续只作为 Ant Design X 示例兼容层，不作为主业务协议。

## 14. 后端改造方案

### 14.1 新增目录建议

```text
ai-proxy-server/src/streaming/
  dto/
    chat-stream-v2.dto.ts
    stream-event.dto.ts
    message-part.dto.ts
  protocol/
    stream-event.types.ts
    stream-event-writer.ts
    stream-state-machine.ts
  adapters/
    provider-stream-adapter.interface.ts
    openai-compatible-stream.adapter.ts
  services/
    stream-orchestrator.service.ts
    stream-message-builder.service.ts
```

或者放在 `src/ai-proxy/streaming/` 下，等稳定后再拆模块。

### 14.2 `StreamEventWriter`

```ts
export class StreamEventWriter {
  private sequence = 0;

  constructor(
    private readonly res: Response,
    private readonly base: {
      traceId: string;
      requestId: string;
      protocol: 'aiagent.stream.v2';
    },
  ) {}

  write<T>(type: StreamEventType, data: T, scope?: { sessionId?: string; messageId?: string }) {
    const event = {
      ...this.base,
      id: createEventId(),
      type,
      sequence: ++this.sequence,
      timestamp: new Date().toISOString(),
      ...scope,
      data,
    };

    this.res.write(`event: ${type}\n`);
    this.res.write(`id: ${event.id}\n`);
    this.res.write(`data: ${JSON.stringify(event)}\n\n`);
  }
}
```

### 14.3 `StreamOrchestratorService`

职责：

- 校验 v2 请求。
- 调用 `ConversationApplicationService.prepareSendMessage()`。
- 把 user input parts 转为数据库 user message。
- 调用 provider adapter。
- 把 normalized provider events 转为 project stream events。
- 维护 assistant message parts。
- 完成时持久化 content 投影和 metadata.parts。
- 失败时持久化 failed assistant message。

伪代码：

```ts
async streamChat(dto: ChatStreamRequestV2, userId: string, res: Response) {
  const writer = new StreamEventWriter(res, base);
  writer.write('stream.started', { provider, model });

  const prepared = await conversation.prepareSendMessage(...);
  writer.write('session.created', ...);
  writer.write('message.created', ...);

  const builder = new StreamMessageBuilder(prepared.assistantMessageId);

  try {
    for await (const event of adapter.stream(providerInput)) {
      const projectEvents = builder.apply(event);
      for (const projectEvent of projectEvents) {
        writer.write(projectEvent.type, projectEvent.data, projectEvent.scope);
      }
    }

    const finalMessage = builder.complete();
    await messageService.completeAssistantMessageV2(...finalMessage);
    writer.write('message.completed', { message: finalMessage });
    writer.write('stream.completed', { finishReason, usage });
  } catch (error) {
    const failed = builder.fail(error);
    await messageService.failAssistantMessageV2(...failed);
    writer.write('stream.failed', sanitize(error));
  } finally {
    res.end();
  }
}
```

### 14.4 DTO 校验

`ChatStreamRequestV2` 需要 class-validator：

- `protocol` 必须是 `aiagent.stream.v2`。
- `requestId` 必填。
- `clientMessageId` 必填。
- `input.parts` 至少一个。
- `text` part 的 text 不能为空。
- `file` part 的 fileId 必须存在且属于当前用户可访问范围。
- `reasoning.display` 只能是枚举值。
- `tools` 中的工具必须在后端注册表中存在且启用。

### 14.5 与现有服务的复用

继续复用：

- `ConversationApplicationService.prepareSendMessage()`
- `MessageService.create()`
- `MessageService.completeAssistantMessage()`
- `StreamFailureCoordinator`
- `ModelProviderRegistryService`

需要扩展：

- `prepareSendMessage()` 支持 structured input parts。
- `MessageService.completeAssistantMessageV2()` 支持 metadata.parts/status/usage。
- `AiProxyService.proxyChatStream()` 的流式逻辑下沉到 adapter。

## 15. 兼容与迁移策略

### 15.1 端点并行

保留：

```text
POST /api/ai/chat/stream
```

新增：

```text
POST /api/ai/chat/stream/v2
```

理由：

- v1 仍可供 Ant Design X 示例页使用。
- v2 可以独立测试协议。
- 出问题可以快速回滚到 v1。

### 15.2 前端灰度

建议增加配置：

```ts
const USE_STREAM_PROTOCOL_V2 = true;
```

或者在 content store 中保留调试开关。

迁移顺序：

1. 实现 v2 service 和类型。
2. 主聊天页切 v2。
3. 示例页继续 v1。
4. 验证稳定后移除 v1 主业务依赖。

### 15.3 数据兼容

读取历史消息时：

```ts
function normalizeMessage(raw) {
  const parts = raw.metadata?.parts;
  if (Array.isArray(parts)) {
    return { ...raw, parts };
  }
  return {
    ...raw,
    parts: raw.content
      ? [{ id: `${raw.id}:text`, type: 'text', text: raw.content, status: 'done' }]
      : [],
  };
}
```

这样旧消息也能进入新 UI。

## 16. 分阶段实施计划

### 阶段 0：协议落文档与类型草案

目标：

- 确认本文档作为 v2 协议基线。
- 新增共享 TypeScript 类型草案。

产出：

- `docs/unified-streaming-io-protocol-plan.md`
- `ai-proxy-server/src/streaming/protocol/*.ts`
- `antdXStudy/src/service/chat-stream-v2.ts` 类型引用或复制

验收：

- 不影响现有 v1 流式聊天。
- 类型能表达 text/reasoning/tool/file/error parts。

### 阶段 1：只做文本流 v2

目标：

- v2 跑通当前纯文本聊天。
- 去掉前端对 `choices` 的依赖。
- 后端输出 `message.part.delta`。

后端任务：

- 新增 `ChatStreamV2Dto`。
- 新增 `StreamEventWriter`。
- 新增 `OpenAiCompatibleStreamAdapter`。
- 新增 `/api/ai/chat/stream/v2`。
- 完成时把 `metadata.parts` 写入 assistant message。

前端任务：

- 新增 `sendChatStreamV2()`。
- 新增 `applyStreamEvent()`。
- `ChatMessage` 增加 `parts`。
- 主聊天页切 v2。

验收：

- 新会话、既有会话、附件文本上下文都能正常对话。
- 前端不再读取 `choices`。
- assistant 完成后数据库有 `metadata.parts`。
- 刷新页面能恢复消息。

### 阶段 2：统一错误和状态

目标：

- 彻底统一流内错误。
- 前后端状态机一致。

后端任务：

- v2 错误只输出 `stream.failed`。
- 失败 assistant message 写入 error part。
- `StreamFailureCoordinator` 适配 v2 writer。

前端任务：

- `stream.failed` 标记 message failed。
- UI 渲染 error part。
- 不再使用 `onErrorChunk` 这类 v1 handler。

验收：

- 上游超时、API Key 错误、session 不存在、请求重复等场景有稳定错误码。
- 刷新后失败消息仍可见。

### 阶段 3：思考过程

目标：

- 支持 reasoning 状态和摘要。

后端任务：

- Adapter 识别 provider reasoning 字段。
- 输出 `reasoning.started/delta/completed` 或映射为 reasoning part events。
- 根据 `runtime.reasoning.display` 决定可展示内容。

前端任务：

- 渲染 reasoning part。
- 支持折叠展示。

验收：

- 普通模型无 reasoning 时不受影响。
- 支持 reasoning 的模型能显示“思考中”和摘要。
- reasoning 不拼入普通 `content`。

### 阶段 4：工具调用和 MCP

目标：

- 工具调用进入统一协议。

后端任务：

- 新增 ToolRegistry。
- 新增 ToolExecutor。
- 支持 builtin/custom/mcp tool source。
- Adapter 支持 tool call event。
- Orchestrator 执行工具并把结果回填上下文。

前端任务：

- 工具调用状态 UI。
- 工具结果 UI。
- 用户可选择启用工具。

验收：

- 模型能发起工具调用。
- 工具执行过程有可见状态。
- 工具结果进入消息 parts。
- 刷新后可恢复工具调用历史。

### 阶段 5：多模态和结构化输出

目标：

- 支持 image/file/json/reference 等 part。

任务：

- 扩展 input parts。
- 扩展 response modalities。
- 扩展 UI renderer。
- 根据 provider 能力做 adapter 映射。

## 17. 风险与取舍

### 17.1 不建议直接使用 OpenAI 或 Anthropic 原始协议作为项目协议

原因：

- 项目支持 DeepSeek、OpenAI、Gemini、Codex、custom，后续还会有 MCP。
- 原始协议会随供应商变化。
- 前端一旦依赖某个供应商 shape，后续 adapter 会越来越难写。

### 17.2 不建议现在就引入完整 agent runtime

原因：

- 当前项目仍以聊天和学习演示为主。
- 过早引入复杂 planner/memory/tool graph 会拖慢主线。
- 先把 stream protocol 稳住，后续 agent runtime 可以作为 orchestrator 的增强。

### 17.3 不建议立刻拆 MessagePart 表

原因：

- JSONB 足够承载当前 parts。
- 当前查询主要按 session 拉消息，不需要 part 级查询。
- 先稳定协议，再决定存储物理形态。

### 17.4 `content` 字段仍然有价值

原因：

- 旧 UI 和普通消息列表需要快速显示文本。
- 搜索和标题生成可以先用 content。
- parts 是结构化事实，content 是可展示投影，两者可以共存。

## 18. 建议优先级

立即做：

1. 新增 v2 协议类型。
2. 新增 v2 stream endpoint。
3. v2 只跑通 text part。
4. 前端主聊天页从 `choices` 迁移到 `message.part.delta`。
5. assistant 完成时写入 `metadata.parts`。

暂缓：

1. 完整 MCP。
2. 多轮工具自动循环。
3. MessagePart 拆表。
4. 多模态输出。
5. 完整 reasoning full 展示。

不要做：

1. 继续往 `choices[0].message.content` 里塞 reasoning/tool/error。
2. 让前端解析 provider 原始事件。
3. 把工具结果当普通 assistant 文本拼接。
4. 在同一接口里同时维护多套错误结构。

## 19. 最小可行 v2 协议示例

### 19.1 请求

```json
{
  "protocol": "aiagent.stream.v2",
  "requestId": "req_01j...",
  "clientMessageId": "client_msg_01j...",
  "sessionId": "session_01j...",
  "input": {
    "role": "user",
    "parts": [
      {
        "type": "text",
        "text": "请帮我总结这个文件"
      },
      {
        "type": "file",
        "fileId": "file_01j...",
        "name": "需求文档.pdf"
      }
    ]
  },
  "runtime": {
    "provider": "deepseek",
    "model": "deepseek-chat",
    "stream": true,
    "reasoning": {
      "enabled": false,
      "display": "summary"
    },
    "autoGenerateSessionName": true
  }
}
```

### 19.2 输出

```text
event: stream.started
data: {"protocol":"aiagent.stream.v2","type":"stream.started","sequence":1,"data":{"provider":"deepseek","model":"deepseek-chat"}}

event: message.created
data: {"protocol":"aiagent.stream.v2","type":"message.created","sequence":2,"sessionId":"session_01j...","messageId":"assistant_msg_01j...","data":{"userMessage":{"id":"user_msg_01j...","role":"user","content":"请帮我总结这个文件","parts":[{"id":"part_user_text_1","type":"text","text":"请帮我总结这个文件"},{"id":"part_user_file_1","type":"file","fileId":"file_01j...","name":"需求文档.pdf"}],"status":"done"},"assistantMessage":{"id":"assistant_msg_01j...","role":"assistant","content":"","parts":[],"status":"streaming"}}}

event: message.part.started
data: {"protocol":"aiagent.stream.v2","type":"message.part.started","sequence":3,"messageId":"assistant_msg_01j...","data":{"part":{"id":"part_text_1","type":"text","text":"","status":"streaming"}}}

event: message.part.delta
data: {"protocol":"aiagent.stream.v2","type":"message.part.delta","sequence":4,"messageId":"assistant_msg_01j...","data":{"partId":"part_text_1","type":"text","delta":"这个文件主要包括"}}

event: message.part.delta
data: {"protocol":"aiagent.stream.v2","type":"message.part.delta","sequence":5,"messageId":"assistant_msg_01j...","data":{"partId":"part_text_1","type":"text","delta":"以下内容..."}}

event: message.part.completed
data: {"protocol":"aiagent.stream.v2","type":"message.part.completed","sequence":6,"messageId":"assistant_msg_01j...","data":{"partId":"part_text_1","type":"text","status":"done","text":"这个文件主要包括以下内容..."}}

event: message.completed
data: {"protocol":"aiagent.stream.v2","type":"message.completed","sequence":7,"messageId":"assistant_msg_01j...","data":{"message":{"id":"assistant_msg_01j...","role":"assistant","content":"这个文件主要包括以下内容...","parts":[{"id":"part_text_1","type":"text","text":"这个文件主要包括以下内容...","status":"done"}],"status":"done"}}}

event: stream.completed
data: {"protocol":"aiagent.stream.v2","type":"stream.completed","sequence":8,"data":{"finishReason":"stop"}}
```

## 20. 与现有文件的落点映射

| 现有文件 | 当前职责 | v2 建议 |
| --- | --- | --- |
| `ai-proxy-server/src/ai-proxy/dto/chat-stream.dto.ts` | v1 请求 DTO | 保留，新建 v2 DTO |
| `ai-proxy-server/src/ai-proxy/utils/sse-transform.util.ts` | 解析 OpenAI-compatible SSE 并写 v1 chunk | 保留给 v1；v2 改为 adapter + writer |
| `ai-proxy-server/src/ai-proxy/ai-proxy.controller.ts` | v1 stream controller | 新增 v2 endpoint，逐步瘦身 |
| `ai-proxy-server/src/ai-proxy/stream-completion.service.ts` | 完成/失败持久化和事件 | 增加 complete/fail v2 message |
| `antdXStudy/src/service/chat.ts` | v1 fetch/SSE client | 新增 `chat-stream-v2.ts` |
| `antdXStudy/src/service/chat-shared.ts` | Ant Design X 示例适配 | 保留为示例兼容，不作为主协议 |
| `antdXStudy/src/store/types.ts` | ChatMessage 只有 content | 增加 parts/status |
| `antdXStudy/src/store/messageStore/index.ts` | appendAssistantDelta | 增加 applyStreamEvent |
| `antdXStudy/src/store/chatThunks.ts` | v1 handlers 编排 | 切换为 v2 onEvent 编排 |
| `ai-proxy-server/prisma/schema.prisma` | Message.content + metadata | 第一阶段不改表 |

## 21. 验收清单

文本 v2 第一阶段完成时，应满足：

- 前端发送请求体不再只有 `query`，而是 `input.parts`。
- 后端 v2 输出不再包含 `choices`。
- 前端主聊天页不再读取 `chunk.choices`。
- 文本 delta 通过 `message.part.delta` 合并。
- assistant message 完成后数据库存在 `metadata.parts`。
- 历史旧消息仍可正常显示。
- 新会话、既有会话、附件会话都能正常发送。
- 流失败时前端能展示错误，刷新后错误消息仍存在。
- v1 示例页不受影响。

思考过程阶段完成时，应满足：

- reasoning 不进入普通 `content`。
- UI 能展示思考状态或摘要。
- 不支持 reasoning 的模型行为不变。

工具/MCP 阶段完成时，应满足：

- 工具调用和工具结果都有 part。
- 工具执行状态可见。
- 工具结果持久化，刷新后可恢复。
- 工具错误不破坏整条消息结构。

## 22. 参考资料

- [OpenAI Responses API streaming](https://platform.openai.com/docs/api-reference/responses-streaming)
- [Anthropic streaming Messages](https://docs.anthropic.com/en/docs/build-with-claude/streaming)
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)
- [Vercel AI SDK UI stream protocol](https://v5.ai-sdk.dev/docs/ai-sdk-ui/stream-protocol)
- [Vercel AI SDK message persistence](https://v5.ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence)
- [Model Context Protocol architecture](https://modelcontextprotocol.io/docs/concepts/architecture)
