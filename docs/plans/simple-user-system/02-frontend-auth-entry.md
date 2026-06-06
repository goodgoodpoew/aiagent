# 02 前端认证入口

> 执行标注（2026-06-06）：已完成前端认证入口 / `pnpm test:unit`、`pnpm build` 已通过 / 未启动真实浏览器联调后端。

## 修改位置

新增：
- [x] `antdXStudy/src/service/auth.ts`（认证 API 与登录态存储）
- [x] `antdXStudy/src/pages/login/`（登录/注册入口）

修改：
- [x] `antdXStudy/src/service/config.ts`（读取登录态中的用户 ID 和 token）
- [x] `antdXStudy/src/service/request.ts`（统一请求头接入认证信息）
- [x] `antdXStudy/src/service/chat-stream-v2.ts`（聊天 SSE 请求头接入认证信息）
- [x] `antdXStudy/src/service/session-events.ts`（会话事件 SSE 请求头接入认证信息）
- [x] `antdXStudy/src/service/file.ts`（文件上传请求头接入认证信息）
- [x] `antdXStudy/src/layouts/index.tsx`（显示当前用户和登出入口）
- [x] `antdXStudy/.umirc.ts`（注册登录路由）

## 目的

让用户可以在前端完成登录/注册，并让后续请求自动携带服务端签发的身份。

## 动机

后端认证基线完成后，需要替换前端固定 demo 用户 ID 的使用方式，否则用户仍无法通过 UI 进入真实账号上下文。

## 修改原因

- `getUserId()` 目前固定返回 demo 用户 ID，不反映真实登录用户。
- 普通 request、聊天流式 fetch、会话事件 fetch、文件上传 fetch 分散设置请求头，需要统一接入认证头。
- 没有可操作的登录入口和登出入口。

## 实施方案

1. [x] 新增认证 service，封装 token/user 的 localStorage 读写、登录、注册、登出、`me`。
2. [x] 更新请求配置，统一附加 `Authorization` 和 `X-User-Id`。
3. [x] 新增登录页，支持登录和注册两种模式。
4. [x] 更新布局，未登录跳转登录页，已登录显示用户与登出按钮。
5. [x] 补充前端 service 测试。

## 产出

- [x] `/login` 可登录和注册。
- [x] 登录后进入 `/ai/chat`，刷新页面仍保留登录态。
- [x] 登出后清理登录态并回到登录页。

## 验收

- [x] 前端 service 单元测试通过。
- [x] `pnpm build` 通过。
- [x] 聊天、会话事件、文件上传请求头均包含认证信息。

## 风险与注意事项

- 本步不做复杂权限和角色菜单。
- 浏览器 localStorage 仅作为第一版简单实现；后续如需更高安全性可切换 HttpOnly Cookie。
- 不手动修改 `src/.umi`，路由只改 `.umirc.ts`。
