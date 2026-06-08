import { NativeAgentEngineService } from './native-agent-engine.service';
import { TokenUsageEstimatorService } from '@/ai-proxy/token-usage-estimator.service';
import { StreamMessageBuilderService } from '@/streaming/services/stream-message-builder.service';
import { READ_ATTACHED_FILES_TOOL_NAME } from '@/tools/file-read-tool.types';
import { LOCATION_ACQUISITION_TOOL_NAME } from '@/tools/location-acquisition.types';
import type { AgentRunContext, AgentRunState, AgentRuntimeInput, AgentRuntimeSseEvent } from '../agent-runtime.types';
import type { ToolDefinition } from '@/tools/dto/tool-definition.dto';

describe('NativeAgentEngineService 文件读取工具接线', () => {
  function createService(toolGateway: {
    findInternalTool: jest.Mock;
    execute: jest.Mock;
  }, overrides?: {
    conversation?: { markRequestComplete: jest.Mock };
    messageService?: { completeAssistantMessageV2: jest.Mock };
  }) {
    return new NativeAgentEngineService(
      {} as never,
      (overrides?.conversation ?? { markRequestComplete: jest.fn() }) as never,
      (overrides?.messageService ?? { completeAssistantMessageV2: jest.fn() }) as never,
      {} as never,
      {} as never,
      new StreamMessageBuilderService(),
      toolGateway as never,
      new TokenUsageEstimatorService(),
      {} as never,
    );
  }

  const input = {
    dto: {
      protocol: 'aiagent.stream.v2',
      requestId: 'req_1',
      input: {
        role: 'user',
        parts: [{ type: 'text', text: '请总结文件' }],
      },
      runtime: {},
    },
    userId: 'user_1',
    requestId: 'req_1',
    traceId: 'trace_1',
  } as AgentRuntimeInput;

  it('带文件时通过内部工具读取，并注入 provider user prompt', async () => {
    const internalTool: ToolDefinition = {
      source: 'builtin',
      name: READ_ATTACHED_FILES_TOOL_NAME,
      description: '读取附件',
      inputSchema: {},
      enabled: true,
      internal: true,
    };
    const toolGateway = {
      findInternalTool: jest.fn(() => internalTool),
      execute: jest.fn().mockResolvedValue({
        toolCallId: 'internal:req_1:read_attached_files',
        toolName: READ_ATTACHED_FILES_TOOL_NAME,
        result: {
          readable: [
            {
              fileId: 'file_1',
              name: '需求.txt',
              type: 'text/plain',
              content: '文件正文',
              tokenEstimate: 3,
            },
          ],
          unavailable: [],
          readableFileIds: ['file_1'],
          attachmentContext: '用户随消息附带了以下文件内容，请只在相关时引用：\n\n<file id="file_1">文件正文</file>',
          attachments: [
            {
              fileId: 'file_1',
              name: '需求.txt',
              type: 'text/plain',
              status: 'ready',
              tokenEstimate: 3,
            },
          ],
          readResults: [
            {
              fileId: 'file_1',
              name: '需求.txt',
              mimeType: 'text/plain',
              tokenEstimate: 3,
              status: 'done',
            },
          ],
        },
      }),
    };
    const service = createService(toolGateway);
    const ctx: AgentRunContext = {
      requestId: 'req_1',
      traceId: 'trace_1',
      userId: 'user_1',
      platform: 'openai',
      model: 'gpt-test',
    };
    const state = {
      effectiveUserId: 'user_1',
      fileIds: ['file_1'],
      failureStage: 'prepare',
      providerRequest: {},
      prepared: {
        llmMessages: [{ role: 'user', content: '请总结文件' }],
        attachmentReadResults: [
          {
            fileId: 'file_1',
            name: '需求.txt',
            mimeType: 'text/plain',
            tokenEstimate: 3,
            status: 'done',
          },
        ],
      },
    } as unknown as AgentRunState;

    await (service as never as { readAttachedFiles: (ctx: AgentRunContext, state: AgentRunState) => Promise<void> })
      .readAttachedFiles(ctx, state);
    (service as never as {
      buildProviderRequest: (
        input: AgentRuntimeInput,
        ctx: AgentRunContext,
        state: AgentRunState,
      ) => void;
    }).buildProviderRequest(input, ctx, state);

    expect(toolGateway.findInternalTool).toHaveBeenCalledWith('builtin', READ_ATTACHED_FILES_TOOL_NAME);
    expect(toolGateway.execute).toHaveBeenCalledWith(expect.objectContaining({
      tool: internalTool,
      arguments: {
        fileIds: ['file_1'],
        userId: 'user_1',
      },
      skipResultTruncation: true,
    }));
    expect(state.providerRequest?.messages?.[0].content).toContain('<file id="file_1">文件正文</file>');
    expect(state.providerRequest?.messages?.[0].content).toContain('请总结文件');
    expect(state.completedFileReads).toEqual([
      {
        fileId: 'file_1',
        name: '需求.txt',
        mimeType: 'text/plain',
        tokenEstimate: 3,
        status: 'done',
      },
    ]);
  });

  it('无文件时不调用内部工具', async () => {
    const toolGateway = {
      findInternalTool: jest.fn(),
      execute: jest.fn(),
    };
    const service = createService(toolGateway);
    const state = {
      effectiveUserId: 'user_1',
      fileIds: [],
      failureStage: 'prepare',
    } as unknown as AgentRunState;

    await (service as never as { readAttachedFiles: (ctx: AgentRunContext, state: AgentRunState) => Promise<void> })
      .readAttachedFiles(
        {
          requestId: 'req_1',
          traceId: 'trace_1',
          userId: 'user_1',
        },
        state,
      );

    expect(toolGateway.findInternalTool).not.toHaveBeenCalled();
    expect(toolGateway.execute).not.toHaveBeenCalled();
  });

  it('执行 location_acquisition 时注入 clientLocation', () => {
    const service = createService({
      findInternalTool: jest.fn(),
      execute: jest.fn(),
    });
    const state = {
      clientLocation: {
        latitude: 31.2304,
        longitude: 121.4737,
        label: '上海市黄浦区',
      },
    } as unknown as AgentRunState;

    const args = (service as never as {
      buildToolExecutionArguments: (
        toolName: string,
        parsedArguments: Record<string, unknown>,
        state: AgentRunState,
      ) => Record<string, unknown>;
    }).buildToolExecutionArguments(LOCATION_ACQUISITION_TOOL_NAME, {}, state);

    expect(args).toEqual({
      location: '上海市黄浦区',
    });
  });

  it('收尾时为已开始的 reasoning 发送完成事件，并写入最终消息快照', async () => {
    const conversation = { markRequestComplete: jest.fn().mockResolvedValue(undefined) };
    const messageService = { completeAssistantMessageV2: jest.fn().mockResolvedValue(undefined) };
    const service = createService({
      findInternalTool: jest.fn(),
      execute: jest.fn(),
    }, {
      conversation,
      messageService,
    });
    const ctx: AgentRunContext = {
      requestId: 'req_1',
      traceId: 'trace_1',
      userId: 'user_1',
      sessionId: 'session_1',
      assistantMessageId: 'assistant_1',
      platform: 'openai',
      model: 'gpt-test',
    };
    const state = {
      effectiveUserId: 'user_1',
      failureStage: 'provider_stream',
      promptMessagesForUsage: [],
      completedFileReads: [],
      finalContent: '正式回答',
      finalReasoningText: '',
      finalReasoningSummary: '思考摘要',
      encryptedReasoningContent: '',
      textPartStarted: true,
      reasoningPartStarted: true,
      reasoningVisibility: 'summary',
      completedToolCalls: [],
      completedToolResults: [],
      finishReason: 'stop',
    } as unknown as AgentRunState;

    const events = await (service as never as {
      finalizeMessage: (ctx: AgentRunContext, state: AgentRunState) => Promise<AgentRuntimeSseEvent[]>;
    }).finalizeMessage(ctx, state);

    const reasoningCompleted = events.find((event) => (
      event.kind === 'sse'
      && event.type === 'message.part.completed'
      && (event.data as { type?: string }).type === 'reasoning'
    ));
    const messageCompleted = events.find((event) => event.kind === 'sse' && event.type === 'message.completed');
    const completedMessage = (messageCompleted?.data as {
      message?: { parts?: Array<{ type: string; status?: string; summary?: string }> };
    } | undefined)?.message;

    expect(reasoningCompleted?.data).toEqual(expect.objectContaining({
      partId: 'assistant_1:reasoning:0',
      type: 'reasoning',
      status: 'done',
      summary: '思考摘要',
    }));
    expect(completedMessage?.parts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'assistant_1:reasoning:0',
        type: 'reasoning',
        status: 'done',
        summary: '思考摘要',
      }),
    ]));
    expect(messageService.completeAssistantMessageV2).toHaveBeenCalledWith(expect.objectContaining({
      id: 'assistant_1',
      content: '正式回答',
      parts: expect.arrayContaining([
        expect.objectContaining({ type: 'reasoning', status: 'done' }),
      ]),
    }));
    expect(conversation.markRequestComplete).toHaveBeenCalledWith('user_1', 'req_1');
  });
});
