# 01 后端认证基线

> 执行标注（2026-06-06）：已完成后端认证基线 / `pnpm test:unit`、`pnpm build` 已通过 / 未实地验证生产密钥与真实浏览器登录。

## 修改位置

新增：
- [x] `ai-proxy-server/src/auth/`（认证模块、服务、控制器、守卫、DTO）
- [x] `ai-proxy-server/prisma/migrations/<timestamp>_add_user_auth_fields/migration.sql`（用户认证字段迁移）

修改：
- [x] `ai-proxy-server/prisma/schema.prisma`（补齐用户认证字段）
- [x] `ai-proxy-server/src/app.module.ts`（注册认证模块与守卫）
- [x] `ai-proxy-server/src/*/*.controller.ts`（需要用户身份的控制器读取认证上下文）
- [x] `ai-proxy-server/.env.example`（补充 token 密钥配置）

## 目的

让后端具备注册、登录、当前用户查询和基于 token 的用户身份解析能力。

## 动机

现有业务已经按 `userId` 隔离数据，但 `userId` 来自客户端可伪造请求头，需要服务端签发并校验身份。

## 修改原因

- `User` 表没有密码哈希字段，无法支持登录。
- 控制器直接读取 `X-User-Id`，不具备稳定鉴权基础。
- 前端后续需要标准认证端点来保存登录态。

## 实施方案

1. [x] 为 `User` 增加 `passwordHash`、`displayName`、`status`、`lastLoginAt` 字段并添加迁移。
2. [x] 新增 `AuthService`：PBKDF2 密码哈希、注册、登录、token 签发和校验。
3. [x] 新增 `AuthController`：公开注册、登录，受保护 `me`。
4. [x] 新增 `AuthGuard`、`Public` 装饰器、`CurrentUser` 装饰器。
5. [x] 将需要用户身份的控制器改为优先读取认证上下文，兼容 `X-User-Id`。
6. [x] 增加后端单元测试覆盖认证核心逻辑。

## 产出

- [x] `/api/auth/register`、`/api/auth/login`、`/api/auth/me` 可用。
- [x] 普通业务请求能从 Bearer token 得到真实用户 ID。
- [x] 无 token 但带 `X-User-Id` 的旧开发/测试请求仍可运行。

## 验收

- [x] 后端认证单元测试通过。
- [x] `pnpm build` 通过。
- [x] 不改变聊天流式 v2 SSE 事件协议。

## 风险与注意事项

- 本步不做前端页面，避免和第二步交织。
- token 第一版无服务端撤销列表，生产安全依赖 `AUTH_TOKEN_SECRET` 和较短过期时间。
- 遵守中文注释、不改 `.env`、不提交密钥、不改 `src/.umi`。
