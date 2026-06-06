# 文件读取工具化工作实现锐评

生成日期：2026-06-06
评审范围：`docs/plans/file-read-tool-work/01-backend-internal-file-read-tool.md` 对应实现

## 综合评分

综合评分：**86 / 100**
评级：**B+，实现达成目标且偏差可接受**
一句话评价：**文件读取已经从 ChatContext 主流程迁入内部工具执行通道，现有文件语义和 v2 输出保持稳定。**

## 评分总览

| 维度 | 分数 | 评价 |
| --- | ---: | --- |
| 计划符合度 | 84 / 100 | 核心目标完成；读取时机从“会话准备后”调整为“会话准备前”，原因明确且必要。 |
| 范围守纪 | 90 / 100 | 未改前端、数据库、SSE 协议或 RAG 范围，新增能力聚焦后端工具化。 |
| 代码质量 | 86 / 100 | 类型契约集中，内部工具隐藏边界清楚，ChatContext 职责有所收缩。 |
| 测试覆盖 | 84 / 100 | 覆盖内置工具、注册表隐藏、runtime 接线，并通过 unit/build；未跑集成和真实上游。 |
| 主流对齐度 | 86 / 100 | 文件读取作为运行时工作接入 ToolGateway，贴近 Agent 外部上下文工具化方向。 |
| 风险闭环 | 86 / 100 | 内部工具不暴露给前端，跳过结果截断避免文件上下文损坏，保留 MessageFile 语义。 |

## 与计划一致的地方

- 新增 `read_attached_files` 内部工具，实际通过 `ToolGateway.execute()` 调用。
- `ToolRegistryService.listTools()` 不返回内部工具，模型/前端不能把它当普通工具选择。
- `ChatContextService` 不再注入 `FileService`，不再直接读取文件，只消费 `attachmentRead`。
- `NativeAgentEngineService` 在 provider 请求前注入附件上下文，并继续根据读取结果输出 `file_read` parts。
- 新增单元测试并通过 `pnpm test:unit --runInBand`、`pnpm build`。

## 偏差 / 不足

- 读取时机从计划里的“会话准备后”提前到“会话准备前”。这是为了在用户消息落库时仍能正确写入 `attachments`、`unavailableAttachments` 和 `MessageFile`，偏差可接受。
- 为避免内部文件读取结果被通用工具结果截断，`ToolExecutionRequest` 增加了 `skipResultTruncation`。这是计划中识别的风险闭环，属于合理补充。
- 本次没有把 prompt assembly 抽成独立 step，只在 `NativeAgentEngineService` 增加辅助方法；第一版已达分层预期，暂不深化。
- 未运行数据库集成测试，也未实地请求真实上游模型；当前验证集中在纯后端单元和构建。

## P0 致命项

无

## 结论

- [x] 放行（综合分 ≥ 75 且无 P0）
- [ ] 需修订后重评
