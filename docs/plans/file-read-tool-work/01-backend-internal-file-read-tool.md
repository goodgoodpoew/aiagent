# 01 后端内部文件读取工具

> 执行标注（2026-06-06）：已完成后端内部文件读取工具、注册表隐藏内部工具、NativeAgentEngine 接线与单元测试；`pnpm test:unit --runInBand`、`pnpm build` 已通过；未实地验证真实上游模型请求。

## 修改位置

新增：

- [x] `ai-proxy-server/src/tools/file-read-tool.types.ts`（文件读取工具输入输出类型）
- [x] `ai-proxy-server/src/tools/adapters/builtin-tool.adapter.spec.ts`（内置工具单元测试）
- [x] `ai-proxy-server/src/agent-runtime/engines/native-agent-engine.service.spec.ts`（runtime 接线单元测试）

修改：

- [x] `ai-proxy-server/src/tools/adapters/builtin-tool.adapter.ts`（新增 `read_attached_files`）
- [x] `ai-proxy-server/src/tools/tool-registry.service.ts`（支持隐藏内部工具）
- [x] `ai-proxy-server/src/ai-proxy/chat-context.service.ts`（接收读取结果，移除直接读取）
- [x] `ai-proxy-server/src/conversation/conversation-application.service.ts`（返回未注入附件上下文的 llmMessages）
- [x] `ai-proxy-server/src/agent-runtime/agent-runtime.types.ts`（状态中记录文件读取工具结果）
- [x] `ai-proxy-server/src/agent-runtime/engines/native-agent-engine.service.ts`（provider 请求前执行内部文件读取工具并注入上下文）
- [x] `ai-proxy-server/src/agent-runtime/ports/tool-gateway.port.ts`（补齐内部工具查找端口）
- [x] `ai-proxy-server/src/tools/tool-executor.service.ts`（内部工具可跳过通用结果截断）
- [x] `ai-proxy-server/src/tools/tool.module.ts`（为内置文件读取工具注入 FileModule）

## 目的

让本轮附件读取成为工具体系中的内部工作，主流程通过 ToolGateway 使用它，而不是在聊天上下文准备阶段直接读取文件。

## 动机

文件读取本质上是外部上下文获取动作，和工具调用、MCP resource、未来知识库检索属于同类运行时工作。先把它纳入工具通道，可以减少主流程耦合，并为后续统一过程轨迹和审计打基础。

## 修改原因

- `ChatContextService.prepareContext()` 目前同时做消息落库、文件读取、prompt 注入和历史上下文加载，职责偏重。
- Agent Runtime 已具备 ToolGateway，但文件读取绕过该抽象，不利于统一超时、错误、审计与后续扩展。

## 实施方案

1. [x] 定义 `read_attached_files` 的输入输出类型和内置工具定义，标记为内部工具。
2. [x] 在 `BuiltinToolAdapter` 注入 `FileService`，按工具名分发 `get_current_time` 与 `read_attached_files`。
3. [x] 调整工具注册表，默认列表只返回非内部且启用的工具，运行时查找仍可找到内部工具。
4. [x] 调整 `ChatContextService.prepareContext()`，通过 `attachmentRead` 参数消费工具结果并维护 metadata / MessageFile。
5. [x] 调整 `NativeAgentEngineService`，在会话准备前执行文件读取工具，把上下文注入 provider messages，并继续输出 `file_read` parts。
6. [x] 添加单元测试并运行后端 unit/build 验证。

## 产出

- [x] 文件读取走 `ToolGateway.execute()`。
- [x] `ChatContextService` 不再直接依赖 `FileService` 做读取。
- [x] 原有 `file_read` parts、用户消息附件 metadata、MessageFile 关系保持一致。
- [x] 内部文件读取工具不暴露给前端工具列表。

## 验收

- [x] 带文件请求会生成相同语义的 provider prompt 和 `file_read` parts。
- [x] 不带文件请求不会调用文件读取工具。
- [x] 不可读文件不会导致整轮流失败，而是进入 failed read result。
- [x] `pnpm test:unit --runInBand` 通过。
- [x] `pnpm build` 通过。

## 风险与注意事项

- 不要把 `read_attached_files` 暴露为模型可选工具，否则模型可能跳过用户明确附件或请求非本轮文件。
- 不要改变 `SessionFile` 与 `MessageFile` 语义；前者归档，后者表示模型实际读取。
- 工具执行通道有统一截断逻辑，文件读取结果若被截断会破坏上下文，因此内部工具结果需要保持在结构化返回范围内，必要时后续单独设计文件上下文预算器。
- 遵守 v2 协议、中文注释、不改 `src/.umi`、不提交 `.env`。
