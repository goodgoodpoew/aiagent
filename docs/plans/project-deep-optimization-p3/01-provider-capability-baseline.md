# 01 Provider 能力声明基线

> 执行标注（2026-06-08）：已完成 Provider/model 能力声明基线；后端目标单测、前端 platform service 测试和后端 build 已通过；尚未启动真实后端 API 手工验证响应体。

## 修改位置

新增：
- [x] `ai-proxy-server/src/model-provider/provider-capability.service.ts`（归一化 provider/model 能力声明）
- [x] `ai-proxy-server/src/model-provider/provider-capability.service.spec.ts`（能力归一化单元测试）

修改：
- [x] `ai-proxy-server/src/model-provider/model-provider.types.ts`（补充能力声明类型）
- [x] `ai-proxy-server/src/model-provider/model-provider.service.ts`（列表与详情序列化能力）
- [x] `ai-proxy-server/src/model-provider/model-provider-registry.service.ts`（resolveChatProvider 使用模型能力）
- [x] `ai-proxy-server/src/model-provider/model-provider.module.ts`（注册能力服务）
- [x] `ai-proxy-server/prisma/seed.ts`（种子模型写入基础能力）
- [x] `antdXStudy/src/service/platform.ts`（前端模型类型透出 capabilities）
- [x] `docs/project-deep-optimization-priority-plan.md`（记录 P3-1 小步执行状态）
- [x] `docs/evaluation/project-deep-optimization-impl-review.md`（追加实现锐评）

## 目的

让后端以稳定结构表达每个 provider/model 是否支持 `stream`、`tools`、`reasoning`、`vision` 等能力，前端只消费声明，不再从 provider 名称或 adapter 类型猜测能力。

## 动机

P3 的 Provider Adapter 正式化需要先有能力声明，否则 Anthropic/Gemini/MCP 接入后，前端和运行时会继续散落 provider 私有判断。

## 修改原因

- 当前 `features` 是自由 JSON，种子数据只写 `['chat', 'stream']`，缺少稳定语义。
- `resolveChatProvider()` 中 reasoning 能力硬编码为 `openai` / `azure-openai`，无法表达模型级差异。
- 前端模型管理页只能看到原始 `features`，不能可靠判断 tools/reasoning 等能力。

## 实施方案

1. [x] 定义 `ProviderModelCapabilities` 类型，字段覆盖 `chat`、`stream`、`toolCalling`、`reasoning`、`vision`、`jsonMode`。
2. [x] 新增能力归一化服务，从 `features` 数组或对象中解析能力，并按 adapter/provider/model 做保守默认。
3. [x] `ModelProviderService.serializeProvider()` 为 `models` 与 `modelsByType` 返回 `capabilities`，保留原始 `features`。
4. [x] `ModelProviderRegistryService.resolveChatProvider()` 从已解析模型能力填充 `reasoning` 与 `toolCalling`，不再只看 provider 名称。
5. [x] 种子数据为常见模型补充基础能力，保持未知 provider 默认只声明 chat/stream。
6. [x] 前端 `ProviderModel` 类型增加 `capabilities`，不立刻改 UI 交互。

## 产出

- [x] 后端响应中的模型对象包含稳定 `capabilities`。
- [x] 运行时解析 provider 时拿到模型级 reasoning/toolCalling 能力。
- [x] 前端 service 类型可消费能力声明。
- [x] 单元测试覆盖数组 features、对象 features、provider/model 默认能力和 registry 解析。

## 验收

- [x] `pnpm test:unit -- provider-capability model-provider-registry` 通过。
- [x] `pnpm test:unit -- src/service/platform.spec.ts` 通过。
- [x] `pnpm build`（后端）通过。
- [x] 未改动 v2 SSE 协议，未新增数据库迁移。

## 风险与注意事项

- 本步不实现 Anthropic/Gemini 原生 adapter，不承诺真实上游协议可用。
- 能力默认必须保守：无法确认时不声明 tools/reasoning。
- 保留 `features` 原字段，避免破坏既有页面和数据。
- 遵守仓库约定：中文注释，不改 `src/.umi`，不提交 `.env`。
