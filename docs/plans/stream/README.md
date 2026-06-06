# 流式结构化改造小单元计划索引

生成日期：2026-06-04

本目录把 [流式输入输出统一结构化协议设计与实施方案](../unified-streaming-io-protocol-plan.md) 拆分为独立、可执行、可验收的小单元计划。每个计划都可以作为一次独立开发任务或一个小里程碑推进。

建议执行顺序：

1. [01-stream-v2-protocol-baseline.md](./01-stream-v2-protocol-baseline.md)：建立 v2 协议类型和事件写入基础。
2. [02-backend-text-stream-v2.md](./02-backend-text-stream-v2.md)：后端新增文本流 v2 端点。
3. [03-frontend-text-stream-v2.md](./03-frontend-text-stream-v2.md)：前端主聊天页接入 v2 文本流。
4. [04-message-parts-persistence.md](./04-message-parts-persistence.md)：消息 parts 持久化与历史兼容。
5. [05-stream-error-state-unification.md](./05-stream-error-state-unification.md)：统一流式错误和状态机。
6. [06-reasoning-stream-support.md](./06-reasoning-stream-support.md)：接入思考过程和思考摘要。
7. [07-tool-and-mcp-stream-support.md](./07-tool-and-mcp-stream-support.md)：接入工具调用和 MCP。
8. [08-v1-compatibility-cleanup.md](./08-v1-compatibility-cleanup.md)：收口 v1 兼容层和迁移文档。（已执行，v1 仅保留为 legacy 示例/旧端点）

依赖关系：

```text
01
 |
 +-- 02 -- 03 -- 04 -- 05
                       |
                       +-- 06
                       |
                       +-- 07
                            |
                            +-- 08
```

推进原则：

- 第 8 阶段执行后，主业务只走 v2；v1 仅保留给 legacy 示例页和旧端点缓冲。
- 每个计划都要优先复用当前 `ConversationApplicationService`、会话生命周期、消息持久化、统一错误脱敏和模型供应商注册表。
- v2 协议不再把 OpenAI `choices` 暴露给前端主业务路径。
- 数据库迁移以渐进兼容为主，短期优先使用 `Message.metadata.parts`，不要急于拆表。
