# 文件读取工具化工作拆分计划索引

生成日期：2026-06-06

本目录把 [文件读取工具化工作计划](../../file-read-tool-work-plan.md) 拆分为独立、可执行、可验收的小单元计划。

建议执行顺序：

1. [01-backend-internal-file-read-tool.md](./01-backend-internal-file-read-tool.md)：新增后端内部文件读取工具，并把 NativeAgentEngine 接到工具执行通道。

依赖关系：

```text
01
```

推进原则：

- 每步独立、可单独验收，依赖现有 ToolGateway、FileService、ConversationApplicationService 和 v2 parts。
- 优先复用既有分层与约定，不另起炉灶。
- 第一版达成分层目标即可，不扩大到 RAG、摘要、前端过程面板。
