# 项目深度优化 P3 拆分小单元计划索引

生成日期：2026-06-08

本目录把 [项目深度剖析与优先级优化计划](../../project-deep-optimization-priority-plan.md) 中的 P3 扩展型能力拆分为独立、可执行、可验收的小单元计划。

建议执行顺序：

1. [01 Provider 能力声明基线](./01-provider-capability-baseline.md)：把 provider/model 的 stream、tools、reasoning 等能力归一化为后端可信声明，并透出给前端消费。
2. 后续小步：Provider Adapter 接口正式化、MCP 工具权限治理、readiness 与结构化可观测。

依赖关系：

```text
01 Provider 能力声明基线
 |
 +-- Provider Adapter 接口正式化
 |
 +-- 前端能力禁用与提示
 |
 +-- MCP 工具权限治理
```

推进原则：

- 每步独立、可单独验收，依赖前序产物而非交织。
- P3 第一版先建立能力声明，不接新 provider 原生协议，不改 v2 SSE 协议。
- 前端只读取后端能力声明，不根据 provider 名称推断私有能力。
