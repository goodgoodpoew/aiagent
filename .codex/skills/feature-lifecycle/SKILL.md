---
name: feature-lifecycle
description: 在 aiagent 仓库内推进功能全生命周期开发：功能设计、主流实现对照、计划落地、计划锐评打分、计划拆分、开发实现、实现锐评打分、测试集成与验证。Use when the user asks to add, redesign, refactor, implement, plan, split, review, score, or sharply critique a feature in this repository.
---

# 功能全生命周期

在 `aiagent` 仓库内，把功能从想法推进到可验证交付。目标是让每个功能**设计有依据、计划能落地、实现不跑偏、结果可验证**。

## 第一原则

始终遵循：水满则溢，月盈则亏。没有真正完美的系统架构，也没有完美的技术实现方案。功能实现只要符合最初预期，并且核心思想接近市面主流实现即可；不要为了追求满分而过度设计。

落地要求：

- 把评审打分用于发现致命偏差和硬伤，不用于追求形式上的高分。
- 把“接近主流实现”理解为核心思路接近，如数据流、分层、协议、错误处理、测试方式接近，不要求逐项复刻某个产品或框架。
- 当继续打磨的边际收益很低时，明确记录“已达预期，暂不深化”，然后进入下一阶段。

## 必走流程

对每个功能维护一份进度清单，并随工作推进更新状态：

```markdown
功能全生命周期进度：
- [ ] 阶段1 功能设计：明确预期、边界、非目标
- [ ] 阶段2 主流实现对照：调研主流方案与本项目框架最佳实践
- [ ] 阶段3 制定计划：写入 docs/ 下的项目文件
- [ ] 闸门A 计划锐评打分：达标后才放行
- [ ] 阶段4 拆分计划：计划过大时拆为独立小步
- [ ] 阶段5 开发实现：按计划逐步落地
- [ ] 闸门B 实现锐评打分：审查实现相对计划的偏差
- [ ] 阶段6 测试集成与验证：测试、构建、行为验收
```

闸门A 和闸门B 是硬性要求，不可跳过。

## 阶段1：功能设计

先把想法收敛成可判定的预期。至少写清：

- 要解决什么问题：一句话描述用户价值或系统价值。
- 预期行为：成功状态长什么样，必须可观察、可验证。
- 边界与非目标：本次明确不做什么，防止范围蔓延。
- 影响面：涉及 `antdXStudy`、`ai-proxy-server`、数据库、Redis、SSE v2 协议、文件系统或文档的哪些部分。

如果需求方向不清晰，先问用户一个简短问题。不要在大方向上自行猜测。

## 阶段2：主流实现对照

动手前，对照“市面主流怎么做”和“本项目应该怎么做”。

- 当前项目栈：前端 `Umi Max 4 + Ant Design X 2.x + Redux Toolkit`；后端 `NestJS + Prisma + PostgreSQL + Redis`。
- 聊天流式链路只维护 `aiagent.stream.v2` 协议，不重新引入旧的 OpenAI-like SSE 累积格式。
- 优先复用既有分层与模块，例如会话生命周期、消息持久化、统一响应信封、模型供应商注册表、流式 v2 编排、Agent Runtime 抽象。
- 需要确认当前主流做法、框架约定或库 API 时，查官方文档或可靠资料，并在计划中记录依据。

输出一小段对照结论：

```markdown
## 主流实现对照

- 主流做法：...
- 本项目现状：...
- 本次取舍：...
```

## 阶段3：制定计划

计划必须落地为项目文件，不能只写在对话里。

- 总计划路径：`docs/<feature>-plan.md`
- 推荐结构：`Summary / Key Changes / Interface / Implementation Notes / Test Plan / Assumptions`
- 可参考现有文档：`docs/token-usage-estimation-plan.md`、`docs/unified-streaming-io-protocol-plan.md`
- 计划要写清复用哪些现有模块、不改什么、第一版覆盖范围、测试与验收方式。
- 文档、注释、提交信息使用简体中文。

写完总计划后，立即进入闸门A。

## 闸门A：计划锐评打分

每次计划制定完成后，必须对计划做锐评打分。

1. 读取 [scoring-rubric.md](scoring-rubric.md) 的“闸门A · 计划锐评维度”。
2. 将锐评写入 `docs/evaluation/<feature>-plan-review.md`。
3. 锐评格式对齐仓库现有评估文档，例如 `docs/evaluation/first-milestone-project-evaluation.md`：评分总览、综合评分、评级、一句话评价、P0 致命项、结论。
4. 判定放行：
   - 综合分 `>= 75` 且无 P0 致命项：放行。
   - 综合分 `< 75` 或存在 P0 致命项：修订计划后重新打分。

达标即放行，不要为了提分而扩大范围。

## 阶段4：拆分计划

当总计划过大、影响面跨多个模块、上下文难以聚焦，或单次实现难以验收时，必须拆分。

拆分原则：每一步必须独立、可执行、可验收。即使步骤之间互相引用，也要限定在可控范围内；一步只处理一个清晰关注点，依赖前序产物，不与后续步骤交织。

落地方式：

- 目录：`docs/plans/<feature>/`
- 索引：`docs/plans/<feature>/README.md`
- 小步文件：`docs/plans/<feature>/NN-<step-name>.md`
- 模板：使用 [plan-template.md](plan-template.md)

每个小步必须包含这些字段，缺一不可：

```text
修改位置、目的、动机、修改原因、实施方案、产出、验收、风险与注意事项
```

拆分后的每一步同样适用闸门B：每完成一步实现，就对该步做一次实现锐评打分。

## 阶段5：开发实现

按计划或小步计划逐步实现。

- 一次聚焦一个计划单元，避免跨步混改。
- 遵守仓库约定：`@/` 指向 `src/`，`@@/` 指向 `src/.umi/`；不手改 `src/.umi/`；不提交 `.env`；聊天链路只维护 v2 协议。
- 优先沿用现有模块、服务、store、adapter、DTO、测试结构，不另起炉灶。
- 实现过程中同步更新对应计划文件，把已完成项从 `- [ ]` 改为 `- [x]`，并在文件顶部补充执行标注：日期、实际落地情况、已跑验证、未验证事项。
- 只写有解释价值的中文注释，不写复述代码的注释。

完成一个计划单元后，立即进入闸门B。

## 闸门B：实现锐评打分

每次开发实现完成后，必须审查实现相对计划的偏差与不足。

1. 读取 [scoring-rubric.md](scoring-rubric.md) 的“闸门B · 实现锐评维度”。
2. 将锐评写入 `docs/evaluation/<feature>-impl-review.md`；如果是分步实现，可在同一文件中按步骤追加小节。
3. 锐评必须写清：
   - 与计划一致的地方。
   - 与计划偏差的地方，包括实际改了什么、差异在哪里、为什么接受或需要修正。
   - 不足、遗漏、超范围项、未覆盖风险。
   - 是否需要回到计划修订，或开启补救小步。
4. 判定放行：
   - 综合分 `>= 75` 且偏差可接受：进入测试集成与验证。
   - 存在重大偏差、P0 项或未解释的构建/测试失败：修复或更新计划后重新打分。

功能符合最初预期且思路贴近主流即可通过。

## 阶段6：测试集成与验证

按影响面选择最小但足够的验证组合。

后端 `ai-proxy-server` 常用验证：

- `pnpm lint`
- `pnpm build`
- `pnpm test:unit`
- 需要数据库/Redis 时再运行 `pnpm test:integration`，并先启动测试环境。

前端 `antdXStudy` 常用验证：

- `pnpm test:unit`
- `pnpm test:components`
- `pnpm build`
- 涉及关键用户流或视觉变化时补充 Playwright / 浏览器验证。

验证时逐条对照阶段1 的“预期行为”。无法本地真实验证的事项，例如真实上游模型请求、第三方 API、生产环境配置，要在计划或锐评中明确标注“未实地验证”。

## 输出落点速查

| 产物 | 路径 | 触发时机 |
| --- | --- | --- |
| 总计划 | `docs/<feature>-plan.md` | 阶段3 |
| 计划锐评 | `docs/evaluation/<feature>-plan-review.md` | 闸门A |
| 拆分索引 | `docs/plans/<feature>/README.md` | 阶段4 |
| 拆分小步 | `docs/plans/<feature>/NN-<step>.md` | 阶段4 |
| 实现锐评 | `docs/evaluation/<feature>-impl-review.md` | 闸门B |

## 配套资源

- 读取 [plan-template.md](plan-template.md)：当需要拆分计划或编写小步计划时使用。
- 读取 [scoring-rubric.md](scoring-rubric.md)：当进入闸门A 或闸门B 时使用。
