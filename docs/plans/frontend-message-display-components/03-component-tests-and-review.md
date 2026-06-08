# 03 组件测试与实现锐评

> 执行标注（2026-06-07）：已补充用户附件 metadata 测试，兼容旧 `MessagePartsRenderer` 测试；`pnpm test:components` 与 `pnpm build` 已通过；实现锐评已完成。

## 修改位置

新增或修改：
- [x] `antdXStudy/src/pages/base/components/MessagePartsRenderer.component.spec.tsx`（兼容测试与用户附件测试）
- [x] `antdXStudy/src/pages/base/components/BaseLayout.component.spec.tsx`（页面集成测试，既有用例通过）
- [x] `docs/evaluation/frontend-message-display-components-impl-review.md`（实现锐评）
- [x] `docs/frontend-message-display-components-plan.md`（更新进度）
- [x] `docs/plans/frontend-message-display-components/*.md`（更新执行标注）

## 目的

验证拆分后的消息展示行为不回归，并完成闸门B 实现锐评。

## 动机

这次是 UI 结构拆分，最重要的是确保已有消息、流式过程、附件展示不被拆坏。

## 修改原因

- 组件边界变化后，需要测试覆盖新的入口。
- 功能全生命周期要求实现后必须写实现锐评。

## 实施方案

1. [x] 补充 assistant/user 消息展示组件测试。
2. [x] 保留或更新旧 `MessagePartsRenderer` 兼容测试。
3. [x] 运行 `pnpm test:components`。
4. [x] 运行 `pnpm build`。
5. [x] 写入实现锐评，记录计划一致点、偏差、风险和验证结果。

## 产出

- [x] 组件测试通过。
- [x] 前端 build 通过。
- [x] 实现锐评文档完成并放行。

## 验收

- [x] `pnpm test:components` 通过。
- [x] `pnpm build` 通过。
- [x] 实现锐评综合分 ≥ 75 且无 P0。

## 风险与注意事项

- 如果 build 受环境或既有问题阻塞，要记录具体错误，不隐瞒。
- 测试替身需要继续保留 `Bubble.List role.contentRender` 链路，不要把关键链路 mock 掉。
- 达到预期即可放行，不为提分继续扩范围。
