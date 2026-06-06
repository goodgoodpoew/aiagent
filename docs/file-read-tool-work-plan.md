# 文件读取工具化工作计划

生成日期：2026-06-06

## Summary

把当前嵌入在聊天上下文准备流程中的附件读取，迁移为后端内部工具体系中的一个确定性工作。主流程仍负责会话、消息、幂等和模型调用编排，但通过 `ToolGateway` 执行“读取本轮附件”工作，再将读取结果注入 provider prompt，并继续产出既有 `file_read` message parts。

## 功能设计

### 要解决什么问题

当前文件读取逻辑内嵌在 `ChatContextService.prepareContext()`，导致会话准备、消息落库、文件读取、prompt 注入混在同一个流程里。新增工具化文件读取后，文件读取会成为 Agent Runtime 可复用、可审计、可扩展的工作单元。

### 预期行为

- 用户发送带 `fileIds` 的 v2 聊天请求时，后端仍只读取本轮明确携带的文件。
- 文件读取通过 `ToolGateway -> ToolExecutor -> BuiltinToolAdapter` 执行，而不是在上下文主流程中直接调用 `FileService`。
- 可读文件继续以结构化 `<file id="..." name="..." type="...">` 文本注入最后一条 user message。
- 不可读文件继续写入用户消息 metadata 的 `unavailableAttachments`，可读文件继续写入 `attachments` 与 `MessageFile`。
- SSE 仍输出 `file_read` parts，前端协议不变。
- 不带文件的聊天请求不触发文件读取工作。

### 边界与非目标

- 不改前端协议、页面或 Redux store。
- 不改数据库 schema，不改 `SessionFile` / `MessageFile` 语义。
- 不引入旧 OpenAI-like SSE 累积格式。
- 不做模型自主调用文件读取，不允许模型任意请求用户未附加文件。
- 不做 RAG、文件摘要、token 预算截断、多轮工具循环重构。

### 影响面

- `ai-proxy-server/src/tools/`：新增或扩展内置文件读取工具定义与执行。
- `ai-proxy-server/src/ai-proxy/chat-context.service.ts`：保留消息落库和 metadata 构建，移除直接读文件职责，改为接收读取结果。
- `ai-proxy-server/src/conversation/conversation-application.service.ts`：准备会话时不再返回已注入附件的 llmMessages，由 runtime 完成附件读取后注入。
- `ai-proxy-server/src/agent-runtime/engines/native-agent-engine.service.ts`：在 provider 请求前触发内部文件读取工作并注入 prompt。
- 测试：补充工具执行、上下文准备、runtime 文件读取接线的最小单元测试。

## 主流实现对照

- 主流做法：Agent/AI SDK 常把文件、检索、MCP、Web 等外部上下文来源抽象为工具或工作节点，由运行时编排执行，并把工具结果作为结构化上下文回灌模型。
- 本项目现状：已有 `ToolGateway`、`ToolExecutorService`、内置工具 adapter、v2 `file_read` parts 和 Agent Runtime，但附件读取仍在 `ChatContextService` 内同步完成。
- 本次取舍：采用“内部确定性工具工作”，复用工具执行通道，但不把附件读取暴露给模型自由选择，先解决分层与可审计问题，保留当前产品语义。

## Key Changes

1. 新增内置工具 `read_attached_files`：
   - 输入：`fileIds`、`userId`。
   - 输出：`readable`、`unavailable`、`attachmentContext`、`readResults`。
   - 权限：只按当前 `userId` 调用 `FileService.getReadableContentsDetailed()`。
2. 调整 `ChatContextService.prepareContext()`：
   - 接收可选 `attachmentRead` 结果。
   - 只负责用户消息 metadata、`SessionFile`、`MessageFile`、历史消息加载。
   - 不直接调用 `FileService` 读取文件。
3. 调整 `ConversationApplicationService.prepareSendMessage()`：
   - 先完成会话确认、用户消息落库、assistant 占位和事件发布。
   - 返回未注入附件上下文的 `llmMessages` 和用户消息事实信息。
4. 调整 `NativeAgentEngineService`：
   - `prepareConversation()` 后、`buildProviderRequest()` 前调用内部文件读取工作。
   - 将 `attachmentContext` 注入最后一条 user message。
   - 根据读取结果填充 `state.completedFileReads`，继续输出既有 `file_read` parts。

## Interface

内部工具定义：

```ts
{
  source: 'builtin',
  name: 'read_attached_files',
  description: '读取当前用户本轮明确附加的文件内容，供聊天上下文组装使用。',
  inputSchema: {
    type: 'object',
    required: ['fileIds', 'userId'],
    properties: {
      fileIds: { type: 'array', items: { type: 'string' } },
      userId: { type: 'string' }
    },
    additionalProperties: false
  },
  enabled: true
}
```

第一版可在注册表中隐藏该工具，不返回给前端工具列表；运行时通过 `findInternalTool('builtin', 'read_attached_files')` 定位并执行。

## Implementation Notes

- `read_attached_files` 的结果使用结构化对象，不经过模型 tool call 文本参数解析。
- 附件上下文注入逻辑放在 runtime 层，避免 `ChatContextService` 继续承担 prompt assembly。
- `ChatContextService` 仍应使用 `parts` 中的文件名/mimeType 做不可读文件 fallback，保证历史消息展示不退化。
- 读取失败不应让整轮聊天失败；应保留当前语义：可读文件进入上下文，不可读文件进入 metadata 和 `file_read failed` part。
- 工具执行超时或工具不存在属于 runtime 配置错误，应产生 `stream.failed`，但正常的单个文件不可读不是系统错误。

## Test Plan

- `BuiltinToolAdapter` 单元测试：
  - `read_attached_files` 调用 `FileService.getReadableContentsDetailed()` 并返回 `attachmentContext`、`readResults`。
  - 不可读文件返回 `failed` read result，不抛系统异常。
- `ChatContextService` 单元测试：
  - 传入 `attachmentRead` 后不直接读取文件，正确写 metadata、`SessionFile` 和 `MessageFile`。
- `NativeAgentEngineService` 或相邻可测单元：
  - 带 `fileIds` 时通过 `ToolGateway.execute()` 读取文件，并在 provider request 最后一条 user message 前注入附件上下文。
  - 不带文件时不调用工具。
- 后端验证：
  - `pnpm test:unit`
  - `pnpm build`

## Assumptions

- 本次只处理 v2 流式聊天主链路。
- 现有 `FileService.getReadableContentsDetailed()` 的权限过滤、状态过滤和 token 估算继续可信复用。
- 前端已经能消费现有 `file_read` parts，无需 UI 改动。
