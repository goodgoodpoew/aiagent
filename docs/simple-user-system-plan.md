# 简单用户系统计划

生成日期：2026-06-06

功能全生命周期进度：
- [x] 阶段1 功能设计：明确预期、边界、非目标
- [x] 阶段2 主流实现对照：调研主流方案与本项目框架最佳实践
- [x] 阶段3 制定计划：写入 docs/ 下的项目文件
- [x] 闸门A 计划锐评打分：达标后才放行
- [x] 阶段4 拆分计划：计划过大时拆为独立小步
- [x] 阶段5 开发实现：按计划逐步落地
- [x] 闸门B 实现锐评打分：审查实现相对计划的偏差
- [x] 阶段6 测试集成与验证：测试、构建、行为验收

## Summary

为 aiagent 增加第一版简单用户系统：用户可注册、登录、获取当前用户，前端保存登录态并在普通请求、聊天 SSE、会话事件 SSE、文件上传等链路中携带服务端签发的身份信息。第一版目标是替代硬编码 demo 用户 ID，提供基本鉴权与用户隔离能力。

## 功能设计

要解决的问题：当前系统依赖前端硬编码 `X-User-Id`，任何客户端都能伪造用户身份，无法稳定支持登录、鉴权和后续多用户能力。

预期行为：
- 用户可使用用户名、邮箱和密码注册。
- 用户可使用用户名或邮箱加密码登录，成功后拿到 token 与用户资料。
- 前端刷新页面后仍可恢复登录态。
- 已登录用户访问聊天、会话、文件等接口时，后端优先使用 token 中的用户 ID。
- 未登录或 token 无效时，受保护接口返回 401；`/api/auth/register`、`/api/auth/login` 公开。
- 现有聊天流式 v2 协议事件格式不变。

边界与非目标：
- 不做第三方 OAuth、验证码、找回密码、刷新 token、角色权限、管理后台。
- 不引入新认证依赖；第一版使用 Node `crypto` 完成 PBKDF2 密码哈希与 HMAC token。
- 不改 `.env` 真实密钥，不提交任何 API Key。
- 不重新引入旧 OpenAI-like SSE 累积格式。

影响面：
- `ai-proxy-server/prisma/schema.prisma` 与迁移：为 `User` 增加密码哈希、显示名和状态字段。
- `ai-proxy-server/src/auth/`：新增认证模块、DTO、服务、控制器、守卫与当前用户装饰器。
- 既有后端控制器：从认证上下文读取用户 ID，兼容测试或灰度场景的 `X-User-Id` 过渡。
- `antdXStudy/src/service/`：新增认证 API、登录态存储、统一请求头。
- `antdXStudy/src/pages/` 与布局：新增登录页与用户操作入口。

## 主流实现对照

- 主流做法：后端负责密码哈希与 token 签发，客户端保存短期凭据；后端通过全局或路由守卫解析 `Authorization: Bearer ...`，控制器读取认证上下文而不是信任前端传入用户 ID。
- 本项目现状：已有 `User` 表和按 `userId` 隔离的会话、文件、消息数据，但控制器普遍直接读取 `X-User-Id`，前端 `getUserId()` 返回固定 demo 用户。
- 本次取舍：保留现有 `X-User-Id` 头作为开发和灰度兼容兜底，同时新增 Bearer token 优先级；第一版使用内置 crypto，避免依赖安装和复杂刷新机制。

## Key Changes

- 新增 `AuthModule`，提供 `POST /api/auth/register`、`POST /api/auth/login`、`GET /api/auth/me`。
- 新增认证守卫：公开路由跳过鉴权，其他路由解析 Bearer token，并将 `user` 写入 request。
- 更新业务控制器：优先从认证上下文取用户 ID，兼容 `X-User-Id`。
- 前端新增 `/login` 页面，登录成功后保存 token 与用户资料。
- 前端请求统一携带 `Authorization` 与 `X-User-Id`，SSE fetch 同步接入。

## Interface

`POST /api/auth/register`

请求：
```json
{ "username": "demo", "email": "demo@example.com", "password": "password123", "displayName": "演示用户" }
```

响应：
```json
{ "token": "...", "user": { "id": "...", "username": "demo", "email": "demo@example.com", "displayName": "演示用户" } }
```

`POST /api/auth/login`

请求：
```json
{ "account": "demo", "password": "password123" }
```

响应同注册。

`GET /api/auth/me`

响应：
```json
{ "id": "...", "username": "demo", "email": "demo@example.com", "displayName": "演示用户" }
```

## Implementation Notes

- token 结构采用 `base64url(payload).base64url(signature)`，payload 包含 `sub`、`username`、`exp`。
- token 密钥读取 `AUTH_TOKEN_SECRET`，未设置时仅开发使用 fallback；计划更新 `.env.example`。
- 密码哈希采用 PBKDF2-SHA256，存储格式 `pbkdf2_sha256$iterations$salt$hash`。
- `User` 的 `email`、`username` 继续保持唯一约束。
- 现有响应信封、全局异常与 ValidationPipe 不改变。

## Test Plan

- 后端单元测试覆盖：注册、重复账号冲突、登录成功、密码错误、token 校验。
- 后端构建验证：`pnpm build`。
- 前端服务测试覆盖：登录态保存、请求头生成、登出清理。
- 前端构建验证：`pnpm build`。
- 手工行为验收：登录后进入聊天页，请求头带 token；登出后跳回登录页。

## Assumptions

- 第一版不强制要求所有历史测试 fixture 立刻改为真实 token；后端保留 `X-User-Id` 兼容路径，降低迁移成本。
- 开发环境已有 demo 用户可继续由种子数据维护，但本次不强制自动创建。
- 生产环境应配置 `AUTH_TOKEN_SECRET`；开发 fallback 只为本地调试。
