# 07 工具调用与 MCP 流式支持计划

## 动机

项目后续会扩展自定义工具、MCP 等能力。工具调用不是普通文本，它有 schema、参数流、执行状态、结果和错误。如果继续把工具调用塞进 assistant 文本，前端无法可靠展示，后端也无法统一执行、审计和持久化。

本计划在 v2 协议上引入工具调用和 MCP 适配的最小闭环。

## 修改原因

- 工具调用需要 first-class 协议结构。
- MCP tool/resource 需要由后端统一管理，不能让前端直接连接外部 server。
- 工具执行需要权限、超时、限流、错误脱敏和持久化。
- 工具结果需要进入消息 parts，刷新后可恢复。

## 修改位置

后端新增：

- `ai-proxy-server/src/tools/tool-registry.service.ts`
- `ai-proxy-server/src/tools/tool-executor.service.ts`
- `ai-proxy-server/src/tools/tool.module.ts`
- `ai-proxy-server/src/tools/dto/tool-definition.dto.ts`
- `ai-proxy-server/src/tools/adapters/builtin-tool.adapter.ts`
- `ai-proxy-server/src/tools/adapters/custom-tool.adapter.ts`
- `ai-proxy-server/src/tools/adapters/mcp-tool.adapter.ts`

> 执行标注（2026-06-04）：以上文件已新增；额外新增 `ai-proxy-server/src/tools/tool.controller.ts`，用于只读列出后端已启用工具。第一版内置 `get_current_time` 测试工具，custom/MCP adapter 先保留统一入口。

后端修改：

- `ai-proxy-server/src/streaming/protocol/message-part.types.ts`
- `ai-proxy-server/src/streaming/protocol/stream-event.types.ts`
- `ai-proxy-server/src/streaming/services/stream-orchestrator.service.ts`
- `ai-proxy-server/src/streaming/adapters/*`
- `ai-proxy-server/src/model-provider/model-provider.types.ts`

> 执行标注（2026-06-04）：以上位置已修改。`OpenAiCompatibleStreamAdapter` 解析 `delta.tool_calls`；`AiProxyService` 将 `runtime.tools/toolChoice` 转为 provider function tools；`StreamOrchestratorService` 完成工具调用收集、执行、二次模型流和 parts 持久化。

前端：

- `antdXStudy/src/store/types.ts`
- `antdXStudy/src/store/messageStore/index.ts`
- `antdXStudy/src/pages/base/components/MessagePartsRenderer.tsx`
- `antdXStudy/src/service/tool.ts`

> 执行标注（2026-06-04）：以上位置已修改或新增。前端 reducer 可恢复工具参数流、执行中、完成和失败状态；渲染组件会把工具调用/结果与 assistant 正文分开展示。当前主聊天页未新增工具选择控件，需通过 v2 请求显式传 `runtime.tools`。

## 目标

- v2 请求支持 `runtime.tools` 和 `runtime.toolChoice`。
- 后端有工具注册表和执行器。
- provider tool call 映射为 `tool.call.*` 事件。
- 工具执行结果映射为 `tool.result.*` 事件。
- 工具调用和结果持久化为 message parts。
- MCP 工具通过后端适配进入统一工具体系。

> 执行标注（2026-06-04）：除真实 MCP client 外均已落地。MCP 已进入统一类型、注册表和 adapter 边界；server 配置、远程拉取、远程执行留待下一阶段。

## 实施方案

1. 工具定义：

```ts
interface ToolDefinition {
  source: 'builtin' | 'custom' | 'mcp';
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId?: string;
  enabled: boolean;
}
```

> 执行标注（2026-06-04）：已实现为 `ToolDefinition` / `ToolDefinitionRef` / `ToolExecutionRequest` / `ToolExecutionResult`，定义位于 `ai-proxy-server/src/tools/dto/tool-definition.dto.ts`。

2. 请求结构：

```ts
tools?: ToolDefinitionRef[];
toolChoice?: 'auto' | 'none' | { type: 'tool'; name: string };
```

> 执行标注（2026-06-04）：`ChatStreamRequestV2.runtime` 已复用该结构；后端只接受注册表中存在的工具引用，不执行前端临时传入的任意 schema。

3. 工具 part：

- `tool_call` 保存 `toolCallId / toolName / arguments / status`。
- `tool_result` 保存 `toolCallId / result / error / status`。

> 执行标注（2026-06-04）：已扩展 `MessagePart`。`tool_result.status` 增加 `streaming`，用于前端展示工具执行中。

4. 后端工具流：

```text
provider emits tool call
  -> tool.call.started
  -> tool.call.delta
  -> tool.call.completed
  -> validate arguments
  -> tool.result.started
  -> execute builtin/custom/mcp tool
  -> tool.result.completed
  -> append tool result to next model context
```

> 执行标注（2026-06-04）：已按“单轮工具闭环”实现。纠偏：当前历史上下文构建只回投影 text part，因此工具结果不是等到下一轮用户消息才进入上下文，而是在同一次流内追加 assistant `tool_calls` 与 `tool` messages 后发起第二次模型请求，生成最终回答。

5. MCP 适配：

- 后端维护 MCP server 配置。
- `McpToolAdapter` 拉取 MCP tools 并转为 `ToolDefinition`。
- 工具执行通过后端 MCP client 完成。
- MCP resource 作为 `ResourceReferencePart` 或 context resource 进入请求。

> 执行标注（2026-06-04）：本轮只实现 MCP adapter 占位和统一列表入口，真实 MCP server 配置/client/resource 拉取尚未实现。

6. 前端 UI：

- tool call streaming 时显示参数生成状态。
- running 时显示工具执行中。
- result completed 后展示摘要。
- failed 时展示错误。

> 执行标注（2026-06-04）：已实现。工具执行失败展示为 `tool_result` error，不会直接把整条 assistant 消息判为 failed；只有 `stream.failed` 才代表整条消息失败。

## 产出

- [x] 工具注册表。
- [x] 工具执行器。
- [x] MCP 工具适配入口。
- [x] tool call/result stream events。
- [x] tool call/result message parts。
- [x] 前端工具状态渲染。

## 验收

- [x] 可以注册一个 builtin 测试工具并被模型调用。
- [x] 前端能看到工具调用从 partial 到 running 到 done 的状态变化。
- [x] 工具结果能继续进入模型上下文，让模型基于结果生成最终回答。
- [x] 工具调用和工具结果写入 `metadata.parts`。
- [x] 刷新页面后工具调用历史可恢复。
- [~] MCP 工具能被列出并映射为统一 ToolDefinition。
- [x] 工具执行失败时，消息不崩溃，展示 tool result error。

> 验收标注（2026-06-04）：已执行 `ai-proxy-server pnpm build` 与 `antdXStudy pnpm build`，均通过。MCP 当前能通过统一 adapter 进入列表，但因尚未配置真实 MCP server，列表为空占位，故标为部分完成。

## 风险与注意事项

- 第一版只做单轮工具调用闭环，不要直接做复杂 agent planner。
- 工具执行必须有超时。
- 工具结果需要限制大小，必要时转为文件或摘要。
- 不要让前端传入未注册工具 schema 后直接执行。
- MCP 凭据和 server 配置必须留在后端。

> 执行标注（2026-06-04）：已落实超时、结果长度限制、后端注册表校验和后端 MCP 边界。后续接入真实 MCP 凭据时仍需继续保持只在后端读取和执行。
