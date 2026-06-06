---
name: tool-development-manual
description: 在 aiagent 仓库内开发、改造、接入或评审工具能力的操作手册。Use when Codex needs to add a builtin/custom/MCP tool, design tool schemas, wire tool registration/execution through ai-proxy-server, connect tools with Agent Runtime, update tool tests, review tool safety, or document tool development workflow in this repository.
---

# Tool Development Manual

在 `aiagent` 仓库内开发或评审工具能力时使用本 skill。重点覆盖 `ai-proxy-server/src/tools/` 的工具注册、执行、适配器实现，以及 `ai-proxy-server/src/agent-runtime/` 通过 `ToolGateway` 调用工具的路径。

## Quick Start

先读取当前工具体系：

- `ai-proxy-server/src/tools/dto/tool-definition.dto.ts`
- `ai-proxy-server/src/tools/tool-registry.service.ts`
- `ai-proxy-server/src/tools/tool-executor.service.ts`
- `ai-proxy-server/src/tools/adapters/builtin-tool.adapter.ts`
- `ai-proxy-server/src/agent-runtime/gateways/default-tool-gateway.service.ts`
- `ai-proxy-server/src/agent-runtime/ports/tool-gateway.port.ts`

需要更完整的项目工具架构、测试清单和安全检查时，读取 `references/aiagent-tool-architecture.md`。

## Decide Tool Type

- Use `builtin` for deterministic backend tools that need internal services, user permissions, database/file access, or stable execution.
- Use `custom` for future user/business-configured tools.
- Use `mcp` for external MCP server tools; require `serverId` when matching MCP tools.

需要访问用户文件、会话、消息、凭证、数据库、Redis 或后端 service 的工具，优先实现为 `builtin`。

## Define Contract Before Code

先定义 `ToolDefinition`，再写执行逻辑。契约必须包含：

- `source`
- `name`
- `description`
- `inputSchema`
- `enabled`
- `internal`，仅后端 runtime 可调用时设置为 `true`

`inputSchema` 使用 JSON Schema 风格对象，明确 `required`、`properties`、`additionalProperties: false`。不要执行前端传入的完整 schema；前端只能传 `ToolDefinitionRef`，后端必须通过 `ToolRegistryService` 解析真实工具定义。

## Implement Builtin Tools

新增内置工具时：

1. 在 `BuiltinToolAdapter.definitions` 添加工具定义。
2. 在 `BuiltinToolAdapter.execute()` 按 `request.tool.name` 增加分发分支。
3. 用私有 `parseXxxArguments()` 解析和归一化 `request.arguments`。
4. 成功时返回结构化 `result`；参数非法或可恢复业务失败时返回工具级 `error`。
5. 复杂工具在 `src/tools/*-tool.types.ts` 放置工具名常量、入参接口、结果接口、类型守卫和纯格式化函数。
6. 在 `builtin-tool.adapter.spec.ts` 添加单元测试。

内部工具必须设置 `internal: true`，并确认它不会出现在 `GET /api/tools`。

## Execute Tools From Runtime

公共工具由请求侧通过 `runtime.tools` 引用：

```ts
const requestedTools = this.toolGateway.resolveRequestedTools(input.dto.runtime?.tools ?? []);
```

后端内部工具由 runtime 主动查找：

```ts
const tool = this.toolGateway.findInternalTool('builtin', TOOL_NAME);
if (!tool) {
  throw new Error(`内部工具未注册：${TOOL_NAME}`);
}
```

执行时提供稳定 `toolCallId`，并传入已校验参数：

```ts
const result = await this.toolGateway.execute({
  toolCallId: `internal_${TOOL_NAME}`,
  tool,
  arguments: { userId },
  skipResultTruncation: true,
});
```

只有内部链路确实需要完整结构化结果时才使用 `skipResultTruncation: true`。

## Error Handling

- 参数非法或业务可恢复失败，返回工具级 `error.code` 和 `error.message`。
- 系统级异常可抛出，由 `ToolExecutorService` 包装为 `TOOL_EXECUTION_FAILED`。
- 错误信息不要泄露 API Key、`.env`、用户文件原文或内部路径细节。
- 大结果保持结构化并控制大小；默认执行器会截断超长结果。

## Runtime And Streaming

不要重新引入旧 OpenAI-like SSE 累积格式。需要把工具结果展示到聊天流时：

1. 工具只返回结构化结果。
2. Runtime 将工具结果写入运行状态。
3. 投影层转成既有 v2 `message.part.*` 事件。
4. 前端协议类型保持在 `antdXStudy/src/service/stream-protocol.ts` 中同步。

## Test Checklist

后端工具改动至少运行：

```bash
cd ai-proxy-server
pnpm test:unit
pnpm build
```

工具访问 PostgreSQL、Redis、文件系统、队列、外部 API 或跨模块权限时，补充 integration 测试。

涉及前端工具列表、工具选择或 service 时追加：

```bash
cd antdXStudy
pnpm test:unit
pnpm build
```

## Safety Checklist

完成前确认：

- 公共工具确实应公开。
- 内部工具有 `internal: true`。
- 用户资源按 user/session ownership 校验。
- 工具输入经过解析、去重、范围或枚举校验。
- 工具输出不暴露凭证、`.env`、私有文件或过量原文。
- 失败路径已有测试。
- 协议、API 或用户可见行为变化时同步更新 `docs/`。
