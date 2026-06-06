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

- Vitest（单元）：
  - service：`request`、`chat-stream-v2`、`session`、`message`、`file`、`platform`、`tool`、`session-events` 全覆盖。
  - store：`messageStore`（含 `applyStreamEvent` 全事件路径）、`sessionStore`、`fileStore`、`contentStore` reducer，`selectors`，`chatThunks`/`fileThunks`，以及 `adapters`。
- Vitest（组件）：`/ai/chat`（BaseLayout 视图）、`/ai/files`、`/ai/models`、`MessagePartsRenderer`，覆盖空、错、加载、流式等状态。
- MSW：单元和组件测试中的后端接口 mock。
- Playwright（E2E）：`/ai/chat` 主流程 smoke、上游失败展示、刷新恢复历史（v1/v2 混合）。
- Playwright screenshot：桌面（1440）、移动端（375）、平板（768）、宽屏（1920）布局基线。

## 覆盖率底线

`vitest.config.ts` 阈值：语句 80%、分支 60%（统计范围为 `src/service`、`src/store`）。

## 备注

- 组件测试因 `@ant-design/x` 传递依赖 `react-syntax-highlighter`（ESM/CJS 冲突），在 BaseLayout 测试中以轻量替身 mock `@ant-design/x` 的 `Bubble`/`Sender`。
- 视觉基线首次生成或 UI 变更后需运行 `pnpm test:visual --update-snapshots`。
- 暂不做大规模样式 snapshot、非关键示例页测试和性能测试。
