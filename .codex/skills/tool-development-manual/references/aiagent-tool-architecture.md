# aiagent Tool Architecture Reference

本 reference 用于 `tool-development-manual` skill。只在需要深入开发、接线、评审工具体系时读取。

## Core Files

| 文件 | 职责 |
|------|------|
| `ai-proxy-server/src/tools/dto/tool-definition.dto.ts` | 定义 `ToolDefinition`、`ToolDefinitionRef`、`ToolExecutionRequest`、`ToolExecutionResult` |
| `ai-proxy-server/src/tools/tool-registry.service.ts` | 汇总 `builtin/custom/mcp` 工具；过滤公共工具；解析请求侧工具引用；查找内部工具 |
| `ai-proxy-server/src/tools/tool-executor.service.ts` | 统一分发工具执行；处理超时、异常和结果截断 |
| `ai-proxy-server/src/tools/adapters/builtin-tool.adapter.ts` | 注册并执行后端内置工具 |
| `ai-proxy-server/src/tools/adapters/custom-tool.adapter.ts` | 自定义工具 adapter 占位 |
| `ai-proxy-server/src/tools/adapters/mcp-tool.adapter.ts` | MCP 工具 adapter 占位 |
| `ai-proxy-server/src/agent-runtime/gateways/default-tool-gateway.service.ts` | Agent Runtime 使用的工具网关实现 |
| `ai-proxy-server/src/agent-runtime/ports/tool-gateway.port.ts` | 工具网关端口定义 |

## Public And Internal Tools

- 公共工具：`enabled: true` 且没有 `internal: true`。会出现在 `GET /api/tools`，也能被 `resolveRequestedTools()` 解析。
- 内部工具：`enabled: true` 且 `internal: true`。不会暴露给前端，只能由后端通过 `findInternalTool()` 查找。
- 请求侧只能传 `ToolDefinitionRef`。后端必须从注册表解析真实定义，避免前端伪造 schema 后被执行。

## Tool Contract Template

```ts
const EXAMPLE_TOOL: ToolDefinition = {
  source: 'builtin',
  name: 'example_tool',
  description: '执行某个确定性后端工作，用于某个明确场景。',
  inputSchema: {
    type: 'object',
    required: ['userId'],
    properties: {
      userId: {
        type: 'string',
        description: '当前请求用户 ID。',
      },
    },
    additionalProperties: false,
  },
  enabled: true,
  internal: true,
};
```

## Argument Parsing Rules

- 字符串必须判空。
- 数组必须过滤非预期元素并去重。
- 数字必须确认范围。
- 枚举必须做白名单判断。
- 用户身份、文件 ID、会话 ID 不能信任前端自行拼接出的上下文。
- 参数非法时返回工具级错误，避免把可恢复输入问题升级成系统异常。

## Execution Rules

- 成功时返回结构化 `result`。
- 业务不可用、输入不合法等可恢复问题返回 `error.code` 和 `error.message`。
- 系统级异常交给 `ToolExecutorService` 包装。
- 默认结果会被截断；内部完整结果链路才设置 `skipResultTruncation`。
- 不要把敏感内容写入日志。

## Test Matrix

- `ToolRegistryService.listTools()` 不返回内部工具。
- `ToolRegistryService.findInternalTool()` 能找到内部工具。
- `resolveRequestedTools()` 拒绝未注册、未启用或 `serverId` 不匹配的工具。
- `ToolExecutorService.execute()` 能按 source 分发。
- 工具超时、抛错、返回超长结果时行为符合预期。
- 具体 adapter 对合法参数、非法参数、业务失败和成功结果都有覆盖。

## Safety Review

- 工具是否需要 `userId`、`sessionId`、`fileId` 等权限上下文。
- 工具是否只能访问当前用户拥有的资源。
- 工具是否可能泄露 `.env`、API Key、上传文件原文或数据库敏感字段。
- 工具执行失败时，用户看到的错误是否足够明确但不过度泄露内部细节。
- 工具结果是否可能超过 token 或响应大小预算。
- 工具是否会触发外部网络、写文件、删除数据或修改生产状态。
- destructive 行为是否有明确用户确认和审计记录。
