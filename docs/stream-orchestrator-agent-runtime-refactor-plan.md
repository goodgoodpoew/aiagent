# Stream Orchestrator Agent Runtime 重构计划

生成日期：2026-06-05

## 1. 背景

`ai-proxy-server/src/streaming/services/stream-orchestrator.service.ts` 当前已经承担了过多职责：

- 建立和关闭 HTTP SSE 响应。
- 解析 v2 输入 parts、fileIds、runtime 配置。
- 解析 provider/model/tools/toolChoice。
- 创建或复用会话，处理 requestId 幂等与 replay。
- 输出 `stream.started`、`session.created`、`message.created` 和各类 message part 事件。
- 构造 OpenAI-compatible provider 请求。
- 消费 provider stream，累积 text/reasoning/tool call 状态。
- 执行工具并发起二次模型请求。
- 估算 token usage。
- 完成 assistant message 持久化。
- 标记请求完成或失败。
- 统一错误脱敏、SSE 失败事件、失败消息落库和日志。

后续要增加审计、权限、数据库 checkpoint、MCP、提示词工程、节点编排和多 agent 能力时，如果继续把逻辑叠加到这个方法，会导致：

- 顺序过程越来越难确认。
- 失败恢复和幂等边界越来越模糊。
- 工具、MCP、权限、审计等横切能力缺少统一插入点。
- 未来接入 LangGraph.js 或厂商 Agents SDK 时缺少稳定适配层。

## 2. 总体路线

采用自研轻量 `AgentRuntime` 作为默认生产 engine，保留 NestJS / Prisma / SSE / 多 provider 架构，同时预留 LangGraph.js、OpenAI Agents SDK 和其他厂商 SDK 的接入点。

成熟方案借鉴点：

- LangGraph：thread/checkpoint、step 边界、可恢复状态和 time travel 思路。
- OpenAI Agents SDK：tools、guardrails、handoffs、trace 的一等概念。
- Vercel AI SDK：tool loop、工具调用和结果回灌 conversation history。
- Claude Agent SDK：模型评估、工具执行、结果回灌、重复循环直到最终回答。

本项目第一阶段不直接引入这些框架依赖，而是在后端稳定自己的接口边界；未来复杂工作流可以把 `AgentEnginePort` 的实现替换或桥接到 LangGraph.js。

## 3. 当前基线职责清单

当前 `StreamOrchestratorService.streamChat()` 的线性顺序如下：

```text
prepareSseResponse
  -> 创建 requestId / traceId / writer
  -> Normalize input: textProjection / fileIds
  -> Resolve provider / model / tools / toolChoice
  -> prepareSendMessage
  -> 写 X-Session-Id
  -> stream.started
  -> session.created
  -> message.created
  -> replay 时 stream.failed 并结束
  -> build ChatRequestDto
  -> emit file_read parts
  -> provider_connect
  -> provider_stream 第一轮
  -> 收集 text / reasoning / tool.call.delta
  -> tool_execution
  -> 执行工具并 emit tool_call/tool_result parts
  -> 如有工具结果，拼接 tool messages 后 provider_stream 第二轮
  -> 补齐 text/reasoning completed parts
  -> build completed assistant snapshot
  -> estimate usage
  -> persistence completeAssistantMessageV2
  -> markRequestComplete
  -> message.completed
  -> stream.completed
  -> end response
catch
  -> markRequestFailed
  -> failAssistantMessageV2
  -> stream.failed
  -> end response
```

这份顺序是重构期间的行为基线。每次迁移都必须保持 SSE 事件顺序、message parts 结构和持久化语义不回退。

## 4. 目标架构

新增 `src/agent-runtime/` 模块，作为稳定编排核心：

- `AgentRuntimeInput`：一次运行的入口参数，包含前端 dto、userId、requestId、traceId。
- `AgentRunContext`：运行上下文，承载 `requestId / traceId / userId / sessionId / messageId / provider / model / runtime / audit`。
- `AgentRunState`：运行状态，承载输入投影、上下文消息、附件读取结果、provider 请求、当前输出、usage、pending tool calls、completed tool results、失败 stage。
- `AgentStep`：统一节点接口，形如 `name/stage/execute(ctx, state, emit)`。
- `AgentRuntimeEvent`：内部事件流，不直接绑定 provider 原始协议；第一阶段可一对一投影到现有 v2 SSE。
- `AgentRuntimeRunner`：顺序执行 steps，记录 step started/completed/failed，为 checkpoint 和审计预留边界。
- `AgentEnginePort`：`run(input): AsyncIterable<AgentRuntimeEvent>`；默认实现为 native runtime，未来可接 LangGraph.js adapter。
- `CheckpointStorePort`：第一版为 no-op/minimal checkpoint，未来扩展到 Prisma node-level checkpoint。
- `ToolGatewayPort`：包装现有 `ToolRegistryService/ToolExecutorService`，统一 builtin/custom/MCP/厂商 hosted tools。

`StreamOrchestratorService` 最终只保留：

- 建立 SSE response。
- 创建 writer。
- 调用 `AgentEnginePort.run()`。
- 用 projector 把 runtime events 写给前端。
- 关闭 response。

## 5. Step 拆分

第一批内置 steps 保持线性顺序：

- `NormalizeInputStep`：提取 `textProjection`、`fileIds`、runtime 默认值。
- `ResolveModelStep`：解析 provider/model/tools/toolChoice，并做基础合法性校验。
- `PolicyGuardStep`：预留输入级、模型级、工具级权限检查，第一阶段默认放行。
- `PrepareConversationStep`：复用 `ConversationApplicationService.prepareSendMessage()`，处理幂等 replay。
- `EmitInitialEventsStep`：输出 `stream.started/session.created/message.created/file_read parts`。
- `PromptAssemblyStep`：预留 system prompt、用户偏好、session memory、文件摘要和工具说明组装。
- `BuildProviderRequestStep`：生成 OpenAI-compatible `ChatRequestDto`，不直接调用模型。
- `ModelStreamStep`：消费 provider stream，只产生 text/reasoning/tool-call 运行事件。
- `ToolLoopStep`：执行工具并追加 tool messages。第一阶段保持单轮闭环，后续支持 `maxSteps` 多轮。
- `FinalizeMessageStep`：补齐 parts、估算 usage、持久化 assistant、标记 request 完成。
- `FailureStep`：改用 `StreamFailureCoordinator` 和 sinks，承载失败日志、失败消息持久化和 SSE 失败事件。

## 6. 扩展落点

- 审计：`AuditSink` 订阅 runtime events，记录 run/step/tool/model/persistence 的开始、完成、失败和耗时。
- 权限：`PolicyGuardStep` 和 `ToolPolicyGuard` 分别处理输入级、模型级、工具级权限。
- 数据库 checkpoint：`CheckpointStorePort` 先记录 run/step 粗粒度状态，后续扩展 node-level checkpoint。
- MCP：保留现有 `McpToolAdapter`，未来升级 MCP client registry；MCP tools/resources 通过 `ToolGatewayPort` 和 context/resource step 进入 runtime。
- 提示词工程：`PromptAssemblyStep` 承担 prompt profile、system prompt、memory、文件摘要、工具说明的合成。
- 节点编排：step metadata 增加 `nodeId / dependsOn / resumable / visibility`，先线性运行，未来映射到 LangGraph nodes/edges。

## 7. 实施顺序

1. 写入本计划，并保留当前职责清单作为重构基线。
2. 新增 `agent-runtime` 类型、端口、runner、projector 和 adapter 骨架。
3. 先迁移失败处理到 `StreamFailureCoordinator`，验证 sink 化模式。
4. 将当前 orchestrator 的主体逻辑抽到 native engine，orchestrator 退化为薄入口。
5. 再按 step 顺序逐步拆分 native engine 内部实现，每一步保持现有 SSE 协议不变。
6. 增加 LangGraph.js 兼容层空 adapter，不引入依赖、不接生产流量，只固定接口形状。

## 8. 测试计划

- 单元测试：每个 step 输入/输出 state 和 emitted events 独立测试。
- 集成测试：用 fake provider stream 验证 SSE 顺序与当前实现一致。
- 失败测试：provider connect、provider stream、tool execution、persistence 每个 stage 都产生标准 `stream.failed` 并落库失败消息。
- 连续性测试：replay 不重复调用模型；工具调用后 follow-up messages 顺序为历史消息、assistant tool_calls、tool result、最终模型流。
- 兼容测试：现有前端不改代码时，普通聊天、reasoning、工具 parts 刷新恢复行为不回退。

## 9. 第一阶段默认假设

- 不直接引入 LangGraph.js 或 OpenAI Agents SDK 依赖，只预留 adapter 接口。
- 保持单 HTTP SSE 流，不改前端协议，不做数据库大迁移。
- 自研 native runtime 是默认生产 engine。
- LangGraph.js 未来作为可选 engine，用于复杂节点图、checkpoint 和 human-in-the-loop。
- 所有工具、MCP、权限和审计都必须在后端执行，前端只发送选择和展示状态。
