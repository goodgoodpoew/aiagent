# 后端测试说明

测试分层：

- `src/**/*.spec.ts` 与 `test/unit/**/*.spec.ts`：单元测试，不连接真实 PostgreSQL / Redis。
- `test/integration/**/*.spec.ts`：跨 DB、Redis、HTTP 的集成测试，必须先通过测试环境断言。
- `test/e2e/**/*.spec.ts`：完整 HTTP 流程测试，必须先通过测试环境断言。

普通测试默认禁用外网连接，只允许本地 `localhost` / `127.0.0.1`。需要模拟上游 AI 时使用 `test/helpers/mock-ai-server.ts` 或 Nock，禁止在 unit / integration 中直接调用真实 provider。

运行命令：

```bash
pnpm test
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm test:coverage
```

集成测试本地启动顺序：

```bash
pnpm test:env:up
pnpm test:db:migrate
pnpm test:integration
pnpm test:env:down
```

`test:env:up` 使用 `docker-compose.test.yml` 启动独立测试 PostgreSQL 与 Redis：

- PostgreSQL: `localhost:5433/aichat_test`
- Redis: `localhost:6380`
- Redis key prefix: `aiagent:test:`

测试环境变量加载顺序：

1. `.env.test`
2. `test/env/.env.test`
3. `test/env/.env.test.example`

前两个文件用于本地私有配置，第三个文件只作为安全默认模板。`.env.test` 不应提交。

集成测试启动前必须满足：

- `NODE_ENV=test`
- `DATABASE_URL` 指向测试库或临时 schema
- `REDIS_KEY_PREFIX` 包含 `test`
- `UPLOAD_ROOT` 包含 `test`
- `AI_PROVIDER_MODE=mock`
