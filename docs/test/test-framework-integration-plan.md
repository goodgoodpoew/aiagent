# 测试框架集成方案

生成日期：2026-06-06

## 1. 方案定位

本方案用于指导 `antdXStudy` 与 `ai-proxy-server` 从 Demo 形态进入可验证、可回归、可灰度的工程化阶段。

本次仍只制定方案：

- 不修改前后端业务代码。
- 不新增测试代码。
- 不安装或引入任何新依赖。
- 只记录后续应引入的工具、目录、命令、流程和验收标准。

调整后的方案不再追求一次性覆盖所有测试想象，而是采用一个更硬的策略：

> **先把后端沙箱和核心流式链路测试打穿，再扩展前端体验测试，最后进入灰度全流程测试。**

## 2. 总体评分与调整原则

原始方案作为战略蓝图完整度较高，但作为下一阶段实施单略显发散。本次调整遵循四个原则：

1. **优先级更锋利**：明确第一期只保最关键的后端测试地基。
2. **工具选型更收敛**：减少长期候选，给出推荐组合。
3. **验收标准更具体**：每一期都要知道什么叫完成。
4. **治理规则更完整**：补上测试维护、发布门禁、flaky test、责任边界和测试成本控制。

## 3. 三期总览

| 阶段 | 主题 | 核心目标 | 不做什么 |
| --- | --- | --- | --- |
| 第一期 | 后端测试框架 | 建立测试沙箱，覆盖核心接口、SSE、DB、Redis、队列 | 不追求全模块高覆盖率，不做前端视觉回归 |
| 第二期 | 前端测试框架 | 覆盖 UI 边界、状态管理、服务层、E2E 和关键视觉问题 | 不做大规模性能测试 |
| 第三期 | 灰度全量测试 | 在独立灰度环境跑真实流程、发布门禁、稳定性验证 | 不直接使用生产数据和生产凭证 |

未来单独扩展：

- 压力测试。
- 性能测试。
- 安全测试。
- 混沌测试。
- 长期稳定性巡检。

## 4. 当前现状判断

### 4.1 后端

`ai-proxy-server` 已经不是简单代理服务，当前包含：

- Prisma + PostgreSQL。
- Redis 缓存与限流。
- BullMQ 队列。
- 会话、消息、文件、模型供应商、工具、流式响应等模块。
- 少量 `.spec.ts` 文件。

关键缺口：

- `package.json` 中没有标准测试命令。
- 没有 `.env.test` 和测试环境强校验。
- 没有测试 DB / Redis / 上传目录隔离策略。
- 没有 mock 上游 AI API 的统一方式。
- SSE 流式链路、完成落库、失败恢复缺少测试。
- session、message、model-provider 等核心数据模块缺少集成测试。

### 4.2 前端

`antdXStudy` 是 Umi Max 4 + React + Ant Design X 前端，已具备聊天、文件、模型管理和示例页面。

关键缺口：

- 没有前端测试命令。
- 没有 service / store / component 测试。
- 没有 Playwright 级别的真实浏览器流程测试。
- 没有针对空、慢、错、长、断、刷新、切换等 UI 边界状态的测试。
- 没有视觉回归和可访问性检查。

## 5. 工具选型建议

以下工具只是方案记录，本次不安装。

### 5.1 后端推荐组合

优先选型：

| 能力 | 推荐工具 | 用途 |
| --- | --- | --- |
| 测试 runner | Jest | NestJS 单元测试、集成测试、覆盖率 |
| HTTP 接口测试 | Supertest | controller / e2e 接口测试 |
| 上游 AI mock | Nock 或 MSW Node | mock OpenAI-compatible SSE 和错误响应 |
| 临时依赖环境 | Testcontainers | CI 中启动 PostgreSQL / Redis 沙箱 |
| 数据重置 | Prisma migrate + truncate helper | 测试前后清理数据 |

后端不建议长期纠结 Jest 和 Vitest。基于 NestJS 生态和后续 Supertest 集成，第一期直接选 Jest 更稳。

### 5.2 前端推荐组合

优先选型：

| 能力 | 推荐工具 | 用途 |
| --- | --- | --- |
| 测试 runner | Vitest | service、store、工具函数 |
| 组件测试 | React Testing Library | 组件状态和用户行为 |
| API mock | MSW | mock 后端接口和流式响应 |
| 浏览器 E2E | Playwright | 聊天、上传、模型配置流程 |
| 可访问性 | axe-core / @axe-core/playwright | 基础 a11y 检查 |
| 视觉回归 | Playwright screenshot | 关键页面截图比对 |

### 5.3 暂缓引入

以下工具不进入第一期：

- Pact：契约测试等核心接口稳定后再引入。
- Chromatic：当前不是组件库产品，先用 Playwright screenshot 即可。
- k6 / Artillery / autocannon：放到性能测试专项。
- OWASP ZAP：放到安全测试专项。
- OpenTelemetry / Prometheus / Grafana：可观测性专项规划时再接。

## 6. 第一期开工范围

第一期只做后端，并且只锁定五件事：

1. **测试环境隔离**：`.env.test`、测试 DB、测试 Redis、测试上传目录。
2. **后端测试 runner**：能稳定运行单元测试和集成测试。
3. **AI mock server**：所有普通测试禁止真实调用 AI 平台。
4. **核心流式链路测试**：覆盖 SSE 成功、失败、中断、完成落库。
5. **核心数据模块测试**：优先覆盖 session、message、model-provider。

第一期不做：

- 前端测试。
- 全量覆盖率目标。
- 真实 AI 压测。
- 大规模视觉回归。
- 所有模块一次性补齐。

## 7. 第一期推荐目录

后续实施时，在 `ai-proxy-server` 下建立：

```text
ai-proxy-server/
  test/
    README.md
    env/
      .env.test.example
    fixtures/
      users.fixture.ts
      providers.fixture.ts
      sessions.fixture.ts
      messages.fixture.ts
      stream.fixture.ts
    helpers/
      create-test-app.ts
      reset-database.ts
      reset-redis.ts
      assert-test-env.ts
      mock-ai-server.ts
      sse-reader.ts
      wait-for-queue.ts
    unit/
    integration/
    e2e/
```

规则：

- 纯函数、单 service 可继续用源码同级 `.spec.ts`。
- 跨 DB / Redis / HTTP 的测试统一放进 `test/integration`。
- 完整 HTTP 流程放进 `test/e2e`。
- fixture 必须稳定，不依赖真实用户数据。

## 8. 测试环境隔离要求

建议新增测试环境模板：

```text
NODE_ENV=test
PORT=3002
DATABASE_URL=postgresql://aichat_test:aichat_test@localhost:5433/aichat_test
REDIS_URL=redis://localhost:6380
REDIS_KEY_PREFIX=aiagent:test:
UPLOAD_ROOT=uploads-test
AI_PROVIDER_MODE=mock
OPENAI_API_KEY=test-only
DEEPSEEK_API_KEY=test-only
GEMINI_API_KEY=test-only
CODEX_API_KEY=test-only
```

测试进程启动前必须校验：

- `NODE_ENV` 必须等于 `test`。
- `DATABASE_URL` 必须包含 `test` 或临时 schema 标识。
- `REDIS_KEY_PREFIX` 必须包含 `test`。
- `UPLOAD_ROOT` 必须包含 `test`。
- 普通测试中 `AI_PROVIDER_MODE` 必须是 `mock`。
- 如果检测到生产域名、生产数据库名或真实生产 key，测试必须立即失败。

这是第一期最高优先级。没有环境隔离，就不应该继续写集成测试。

## 9. 第一期核心用例

### 9.1 环境与基础设施

| 用例 | 验收 |
| --- | --- |
| 使用 `.env.test` 启动测试 | 成功加载测试配置 |
| 误连开发 / 生产库 | 测试进程直接失败 |
| 清理测试 DB | 所有业务表可恢复空状态 |
| 清理测试 Redis | 只清理 `aiagent:test:` 前缀数据 |
| 测试上传目录 | 可写入、可清理、不影响真实 uploads |

### 9.2 AI 与 SSE 链路

| 用例 | 验收 |
| --- | --- |
| 非流式 AI mock 成功 | 返回统一响应结构 |
| SSE mock 成功 | 前端可解析的事件顺序稳定 |
| SSE 返回 `[DONE]` | 完成事件只出现一次 |
| SSE 中途断开 | 客户端收到明确错误或失败状态 |
| 上游 401 / 429 / 500 | 错误码、错误文案、日志可区分 |
| 上游非法 chunk | 不导致服务崩溃 |
| 完成后落库 | assistant message 被保存或进入明确失败记录 |
| 客户端断开 | 后端能清理连接或停止继续写响应 |

### 9.3 核心数据模块

| 模块 | 优先测试 |
| --- | --- |
| session | 创建、列表、更新、软删除、用户隔离、缓存失效 |
| message | 创建、分页、上下文过滤、metadata、session 关联 |
| model-provider | provider CRUD、凭证加密、默认模型、启停、缓存失效 |
| files | 文件名解析、上传记录、文本解析失败、会话挂载 |
| queue | stream completion job、失败重试、重复 job 幂等 |

第一期只要求 session、message、model-provider 进入必须覆盖；files 和 queue 可根据实施进度进入第一期后半段。

## 10. 第一期验收标准

第一期完成时，必须满足：

- 后端存在明确测试命令规划：`test`、`test:unit`、`test:integration`、`test:e2e`、`test:coverage`。
- 测试环境不会误连开发或生产数据库。
- 普通测试不会真实调用 OpenAI / DeepSeek / Gemini / Codex。
- 至少覆盖 `POST /api/ai/chat/stream` 的成功、失败、中断。
- 至少覆盖 session、message、model-provider 三个核心模块的主要成功路径和关键失败路径。
- CI 可以运行后端 lint、build、unit、integration。
- 测试失败时能看到 requestId、响应体或关键错误日志。

第一期覆盖率不宜设太高，建议底线：

| 范围 | 语句覆盖率 | 分支覆盖率 |
| --- | ---: | ---: |
| 后端整体 | 45% | 30% |
| `ai-proxy` / `streaming` / `session` / `message` | 60% | 45% |

覆盖率只是底线，不应该为了数字写低价值测试。

## 11. 第二期前端测试

第二期目标：让用户能看到的问题尽量在测试阶段暴露。

### 11.1 前端优先范围

优先测试：

- `src/service/*`：请求参数、错误解析、SSE parser、协议兼容。
- `src/store/*`：reducer、selector、thunk、并发状态。
- `/ai/chat`：空状态、发送中、流式中、完成、失败、刷新恢复。
- `/ai/files`：上传成功、失败、长文件名、非法类型。
- `/ai/models`：无模型、凭证失败、保存失败、禁用模型。

暂缓：

- 示例页大规模测试。
- 过细的 CSS snapshot。
- 非关键动画断言。

### 11.2 UI 容忍度清单

聊天页必须覆盖：

- 空会话。
- 首条消息。
- 超长回答。
- Markdown 表格、代码块、列表。
- 超长单词和无空格文本。
- 中文、英文、数字、符号混排。
- SSE 中断。
- 网络超时。
- 快速连续发送。
- 流式过程中切换会话。
- 刷新后恢复。
- 旧 v1 消息与新 v2 parts 消息混合展示。

布局必须覆盖：

- 375px 移动端。
- 768px 平板。
- 1440px 桌面。
- 1920px 宽屏。
- 浏览器缩放 125%。
- 长菜单项、长按钮文案、弹窗内容溢出。

### 11.3 前端验收标准

第二期完成时，必须满足：

- 前端存在明确测试命令规划：`test`、`test:unit`、`test:components`、`test:e2e`、`test:visual`。
- service 和 store 有基础单元测试。
- 聊天主流程可以用 mock 后端在 Playwright 中跑通。
- 关键页面至少有桌面和移动端截图基线。
- 上游错误、SSE 中断、空数据不会导致页面崩溃。
- 前端测试失败保留截图或 trace。

建议覆盖率底线：

| 范围 | 语句覆盖率 | 分支覆盖率 |
| --- | ---: | ---: |
| 前端整体 | 40% | 30% |
| `service` / `store` | 65% | 50% |

## 12. 第三期灰度全量测试

第三期目标：在独立灰度环境中验证系统真实流程和发布质量。

灰度环境结构：

```text
gray frontend
  -> gray backend
    -> gray PostgreSQL
    -> gray Redis
    -> gray upload storage
    -> mock AI 或测试 AI provider
```

灰度环境要求：

- 与开发、生产完全隔离。
- 有独立数据库、Redis、上传目录和 AI 测试 key。
- 可以一键初始化 seed。
- 可以一键清理测试数据。
- 开启更完整日志和 trace。
- 失败不影响生产用户。

### 12.1 灰度核心流程

必须覆盖：

1. 新用户进入聊天页。
2. 创建会话。
3. 发送普通消息。
4. 接收流式回答。
5. 刷新页面后恢复历史。
6. 上传文件并基于文件提问。
7. 切换模型后继续对话。
8. 上游 AI 返回错误。
9. SSE 中断后前端可继续输入。
10. 删除会话或软删除会话。

### 12.2 发布门禁

| 等级 | 是否阻断发布 | 示例 |
| --- | --- | --- |
| P0 | 必须阻断 | 构建失败、主聊天不可用、数据库迁移失败 |
| P1 | 必须阻断 | SSE 完成不落库、用户数据串号、文件越权 |
| P2 | 评估阻断 | 关键页面明显布局错位、错误态不可理解 |
| P3 | 不阻断 | 非关键示例页轻微样式偏移 |

发布前必须通过：

- 后端 lint / build / unit / integration。
- 前端 build / unit / 关键组件测试。
- 灰度 smoke。
- 聊天主流程 E2E。
- 数据库迁移 dry run。
- 回滚步骤确认。

## 13. API 与 SSE 契约

前后端强依赖接口和流式协议，因此需要契约治理。

必须固定：

- REST 成功响应结构。
- REST 错误响应结构。
- 分页结构。
- SSE event 类型。
- SSE 完成事件。
- SSE 错误事件。
- message parts 结构。
- model provider 结构。

契约规则：

- 新增字段默认非破坏性。
- 删除字段、修改字段类型、修改 enum 值属于破坏性变更。
- SSE 事件类型必须至少兼容一个前端版本周期。
- 错误码应稳定，错误文案可以调整。
- 契约 fixture 应允许前后端共用。

## 14. 测试数据治理

测试数据分四类：

| 类型 | 用途 |
| --- | --- |
| fixture | 固定用户、默认模型、基础会话 |
| factory | 动态创建 session、message、file |
| seed | 灰度环境初始化 |
| snapshot | API 响应和 UI 截图基线 |

规则：

- 测试用户使用固定 UUID。
- 所有测试数据带 `test` 标识。
- 禁止直接复制真实用户数据。
- 如必须使用生产形态数据，必须脱敏。
- 文件 fixture 控制体积，另设少量大文件边界用例。
- 测试数据应能一键清理。

## 15. 测试治理规则

### 15.1 谁维护测试

建议按模块归属维护：

- 后端模块测试由对应模块开发者维护。
- 前端页面测试由页面开发者维护。
- E2E 和灰度流程由负责发布的人维护。
- CI 和测试基础设施由项目负责人或指定 owner 维护。

新增功能的合并要求：

- 新接口必须带最小接口测试或契约 fixture。
- 新页面必须至少覆盖空、错、加载三个状态。
- 修改 SSE 协议必须同步更新契约和前端 parser 测试。
- 修改数据库 schema 必须补迁移测试或迁移说明。

### 15.2 flaky test 治理

flaky test 不能长期放任。

规则：

- 同一测试 3 次内偶发失败，需要标记为 flaky。
- flaky 测试不得作为长期发布门禁。
- 标记 flaky 后必须在一个迭代内修复、降级或删除。
- 禁止通过无限增加 timeout 掩盖真实问题。
- E2E 中优先等待稳定 DOM 状态，不等待固定时间。

### 15.3 测试成本控制

测试分层运行：

| 场景 | 运行内容 |
| --- | --- |
| 本地快速开发 | unit + 相关 integration |
| PR | lint + build + unit + 核心 integration |
| 主分支合并 | unit + integration + contract + 关键 E2E |
| 发布前 | 灰度 smoke + 关键 E2E + 迁移 dry run |
| 定时任务 | 灰度巡检 + 少量真实 provider smoke |

不把所有测试都塞进每次提交。测试体系要保护速度，而不是拖垮开发节奏。

## 16. 未来专项

以下内容不进入前三期主线，但要预留：

### 16.1 压力与性能测试

重点场景：

- SSE 并发连接数。
- 长回答流式传输稳定性。
- 多用户同时创建会话。
- 文件上传和解析吞吐。
- Redis 队列积压。
- 数据库热点查询。
- 上游 AI 超时对后端资源占用的影响。

候选工具：

- k6。
- Artillery。
- autocannon。

### 16.2 安全测试

重点场景：

- 用户越权访问会话。
- 用户越权访问文件。
- 管理接口未授权访问。
- baseUrl SSRF 风险。
- 上传文件类型伪造。
- API Key 泄露。
- CORS 配置错误。

候选工具：

- OWASP ZAP。
- 依赖漏洞扫描。
- 自定义权限回归用例。

### 16.3 可观测性测试

重点验证：

- requestId 是否贯穿前后端。
- SSE 开始、完成、失败是否可追踪。
- 队列 job 状态是否可诊断。
- 数据库、Redis、上游 AI 错误是否可区分。
- P95 延迟、错误率、队列积压是否可查看。

## 17. 实施路线图

### 17.1 第一阶段：后端最小可落地版本

| 顺序 | 任务 | 验收 |
| ---: | --- | --- |
| 1 | 增加 `.env.test.example` 和环境断言设计 | 误连非测试环境会失败 |
| 2 | 增加 Jest / Supertest 测试配置设计 | 能运行基础测试 |
| 3 | 建立 DB / Redis reset helper 设计 | 测试可重复运行 |
| 4 | 建立 mock AI server 和 SSE fixture 设计 | 不真实调用 AI |
| 5 | 覆盖流式成功 / 失败 / 中断用例设计 | 主链路可回归 |
| 6 | 覆盖 session / message / model-provider 设计 | 核心数据模块可回归 |
| 7 | 接入 CI 设计 | PR 自动跑后端核心测试 |

### 17.2 第二阶段：前端体验测试

| 顺序 | 任务 | 验收 |
| ---: | --- | --- |
| 1 | 建立 Vitest / Testing Library 设计 | service / store 可测试 |
| 2 | 建立 MSW mock 设计 | 前端可离线模拟后端 |
| 3 | 覆盖聊天页核心状态设计 | 空、错、慢、断不崩 |
| 4 | 建立 Playwright 主流程设计 | 浏览器跑通聊天 |
| 5 | 建立截图基线设计 | 关键页面布局可回归 |

### 17.3 第三阶段：灰度发布测试

| 顺序 | 任务 | 验收 |
| ---: | --- | --- |
| 1 | 建立灰度环境设计 | 与生产完全隔离 |
| 2 | 建立 seed / cleanup 设计 | 可重复初始化 |
| 3 | 建立全流程 E2E 设计 | 聊天、文件、模型跑通 |
| 4 | 建立发布门禁设计 | P0 / P1 自动阻断 |
| 5 | 建立巡检设计 | 定时发现关键链路问题 |

## 18. 一期启动检查清单

进入第一期实施前，需要拍板：

- 后端 runner 是否确定为 Jest。
- HTTP 测试是否确定为 Supertest。
- AI mock 使用 Nock 还是 MSW Node。
- 本地测试库使用共享测试库还是 Docker 容器。
- CI 是否支持 Testcontainers。
- 覆盖率是否第一期就阻断发布，还是先只生成报告。
- 是否需要先补 mock auth guard。
- 是否允许真实 AI provider smoke 使用测试 key。

建议默认决策：

- 后端：Jest + Supertest。
- AI mock：先用 Nock，后续前后端 mock 统一时再评估 MSW。
- 本地：共享测试库 + reset helper。
- CI：Testcontainers。
- 覆盖率：第一期只报告，不阻断；稳定后再阻断。
- 真实 AI：不进普通 CI，只进灰度 smoke。

## 19. 结论

调整后的方案把测试建设从“完整愿景”压成了更可执行的路径：

1. **第一期只打后端地基**：环境隔离、AI mock、SSE、核心数据模块。
2. **第二期保护用户体验**：前端 service、store、页面状态、E2E、视觉回归。
3. **第三期验证真实发布**：灰度全流程、发布门禁、可观测性和回滚确认。

最重要的判断不变：这个系统的测试优先级不是平均分配，而是优先保护三条高风险线：

- **数据线**：会话、消息、文件、模型配置不能串、不能丢、不能污染环境。
- **流式线**：SSE 开始、增量、完成、失败、落库必须可预测。
- **体验线**：前端在空、慢、错、长、断、刷新、切换等边界下不能崩溃。

下一步如果进入实施，应从第一期最小可落地版本开始，而不是一次性铺满所有测试类型。
