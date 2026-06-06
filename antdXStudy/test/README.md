# 前端测试说明

本目录承接第二阶段前端测试目标，先覆盖能暴露用户可见问题的最小闭环。

## 命令

```bash
pnpm test
pnpm test:unit
pnpm test:components
pnpm test:e2e
pnpm test:visual
pnpm test:coverage
```

## 当前范围

- Vitest：service、store、轻量组件测试。
- MSW：单元和组件测试中的后端接口 mock。
- Playwright：`/ai/chat` 主流程 smoke。
- Playwright screenshot：桌面和移动端关键页面截图基线。

暂不做大规模样式 snapshot、非关键示例页测试和性能测试。
