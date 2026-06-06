# 灰度发布测试说明

第三阶段灰度测试用于在独立环境验证真实发布链路，默认使用 mock AI provider，不使用生产数据和生产凭证。

## 环境结构

```text
antdXStudy gray frontend
  -> ai-proxy-server gray backend
    -> PostgreSQL gray: localhost:5434/aichat_gray
    -> Redis gray: localhost:6381, prefix aiagent:gray:
    -> uploads-gray
    -> gray mock AI provider: http://127.0.0.1:3101/v1
```

## 本地运行

后端：

```bash
cd ai-proxy-server
pnpm gray:env:up
pnpm gray:db:migrate
pnpm gray:cleanup
pnpm gray:seed
pnpm gray:mock-ai
pnpm build
pnpm gray:start:prod
```

前端另开终端：

```bash
cd antdXStudy
UMI_APP_API_BASE_URL=http://localhost:3001/api \
API_PROXY_TARGET=http://localhost:3001 \
pnpm gray:test
```

## 门禁内容

`.github/workflows/gray-release-gate.yml` 会执行：

- 后端 lint、build、unit、migration dry run、integration。
- 前端 build、unit、components。
- 灰度数据库迁移、cleanup、seed。
- 灰度 mock provider + 灰度后端启动。
- Playwright 灰度 smoke：健康检查、模型配置、流式聊天、文件问答、模型切换、上游失败、会话软删除、浏览器聊天与刷新恢复。

## 阻断规则

- P0：构建失败、迁移失败、灰度后端不可启动、主聊天不可用，必须阻断。
- P1：SSE 不完成或失败事件缺失、会话/文件用户隔离失败、消息不落库，必须阻断。
- P2：关键页面明显布局错位、错误态不可理解，由发布负责人评估。
- P3：非关键示例页轻微样式偏移，不阻断。

## 数据治理

- 灰度用户固定为 `9a74c501-9d60-441b-b1ba-7b3eb469dce0`。
- 灰度 provider 固定为 `gray-mock-provider`，默认模型为 `gray-mock-model`，切换模型为 `gray-alt-model`。
- `pnpm gray:cleanup` 会清空灰度业务表并删除 `uploads-gray`，只允许在 `NODE_ENV=gray` 且灰度库、灰度 Redis 前缀、灰度上传目录下运行。
- 如要接入真实测试 provider，必须另建独立测试 key，并扩展灰度环境断言；默认门禁禁止真实 key。
