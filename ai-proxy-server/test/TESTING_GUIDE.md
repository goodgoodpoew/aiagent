# 后端测试开发手册

本文用于指导新模块或新功能如何补齐后端测试。目标是保护核心行为，不追求测试数量本身。

## 1. 先判断测试层级

新增功能时按风险选择测试：

- **unit**：纯函数、单 service、协议转换、错误归一化、metadata 构造。
- **integration**：需要真实 PostgreSQL、Redis、Prisma relation、缓存失效、队列 key 的行为。
- **e2e**：需要验证 HTTP 边界、响应包裹、SSE 输出、请求头、requestId、跨模块主流程。

默认策略：

1. 先写 unit，固定核心分支。
2. 只有碰 DB / Redis / Prisma relation 时才写 integration。
3. 只有用户真实入口或 SSE/HTTP 契约需要保护时才写 e2e。

不要为了覆盖率把同一个行为在三层重复测试。

## 2. 新模块推荐流程

开发一个新模块或功能时，按这个顺序补测试：

1. **列出稳定契约**
   - 输入 DTO 或 service 参数。
   - 返回结构。
   - 错误码或异常类型。
   - DB 副作用、Redis key、副作用事件。

2. **补 unit**
   - mock Prisma / Redis / 下游 service。
   - 断言 service 调用参数、返回值、异常、metadata。
   - 不连接真实 DB，不启动 Nest App。

3. **补 integration**
   - 使用 `createIntegrationApp()`。
   - `beforeEach` 调用 `resetIntegrationState(context)`。
   - 通过 Prisma 或 service 创建测试数据。
   - 断言真实 DB / Redis 行为。

4. **补 e2e**
   - 使用 Supertest 请求真实 HTTP endpoint。
   - 只断言稳定 HTTP/SSE 契约。
   - 对上游 AI、复杂 runtime、外部服务使用 fake provider override。

5. **停止扩展**
   - 成功路径、关键失败路径、隔离/权限、核心副作用已覆盖即可停止。
   - 不为内部实现细节、随机时间戳、临时日志写测试。

## 3. 测试数据规则

测试数据来源：

- 固定数据放 `test/fixtures`。
- 动态数据在测试内通过 Prisma/service 创建。
- 不复制生产数据。
- 所有测试用户、文件、provider 名称必须带 test/integration/e2e 语义。

Integration 测试必须满足：

```ts
beforeEach(async () => {
  await resetIntegrationState(context);
});
```

这会清理测试 DB，并只清理 `REDIS_KEY_PREFIX` 下的 Redis key。

## 4. Mock 与外部调用

普通测试禁止真实调用 AI 平台。

全局 `test/setup.ts` 使用 Nock 禁用外网，只允许 localhost。需要模拟上游时：

- 非流式：使用 `mockOpenAiChatCompletion`。
- SSE：使用 `mockOpenAiSse`。
- 错误：使用 `mockOpenAiError`。

E2E 默认优先 fake 内部 port，而不是打真实上游。例如流式聊天 e2e 替换 `AGENT_ENGINE`，保留 HTTP/SSE 边界即可。

## 5. DB / Redis / Docker

本地 integration/e2e 启动顺序：

```bash
pnpm test:env:up
pnpm test:db:migrate
pnpm test:integration
pnpm test:e2e
pnpm test:env:down
```

测试环境要求：

- `NODE_ENV=test`
- `DATABASE_URL` 指向测试库或临时 schema
- `REDIS_KEY_PREFIX` 包含 `test`
- `UPLOAD_ROOT` 包含 `test`
- `AI_PROVIDER_MODE=mock`
- AI key 使用 `test-only`

如果环境断言失败，先修环境，不要绕过 `assertTestEnv()`。

## 6. SSE 测试规则

SSE e2e 只断言稳定字段：

- `event`
- `data.type`
- `data.requestId`
- `data.sequence`
- 关键业务 payload

不要精确断言：

- `timestamp`
- 随机 `traceId`
- 随机 event id

解析 SSE 使用 `parseSseEvents()`。

## 7. CI 与本地校验

普通开发至少运行：

```bash
pnpm test:unit
pnpm build
```

涉及 DB / Redis / HTTP 主流程时运行：

```bash
pnpm test:env:up
pnpm test:db:migrate
pnpm test:integration
pnpm test:e2e
pnpm test:env:down
```

当前仓库存在既有 Prettier 债。新增测试文件应单独通过只读 ESLint 检查，不要随手运行会改全仓库的 `pnpm lint --fix`。

## 8. 够用即停

满足以下条件即可停止继续加测试：

- 核心成功路径有覆盖。
- 至少一个关键失败路径有覆盖。
- 数据隔离或用户隔离有覆盖。
- DB / Redis 副作用在 integration 中验证过。
- 对外 HTTP/SSE 契约在 e2e 中验证过。

不要在当前阶段引入 Testcontainers、Pact、真实 provider smoke、覆盖率硬门禁或复杂灰度测试。
