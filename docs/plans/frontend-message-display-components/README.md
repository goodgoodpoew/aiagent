# 前端消息展示组件拆分小单元计划索引

生成日期：2026-06-07

本目录把 [前端消息展示组件拆分计划](../../frontend-message-display-components-plan.md) 拆分为独立、可执行、可验收的小单元计划。

建议执行顺序：
1. [01-message-display-foundation](./01-message-display-foundation.md)：建立消息展示目录、part 分组与 token 样式基础。
2. [02-bubble-role-integration](./02-bubble-role-integration.md)：把 `BaseLayout` 的 Bubble role 内容渲染迁移到新组件。
3. [03-component-tests-and-review](./03-component-tests-and-review.md)：补齐组件测试、实现锐评与验证记录。

依赖关系：

```text
01
 |
 +-- 02
      |
      +-- 03
```

推进原则：
- 每步独立、可单独验收，依赖前序产物而非交织。
- 优先复用既有分层与约定，不另起炉灶。
- 第一版达成可扩展组件边界即可，不为未来未知展示做重型抽象。
