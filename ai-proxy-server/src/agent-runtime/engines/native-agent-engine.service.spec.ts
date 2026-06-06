import { NativeAgentEngineService } from './native-agent-engine.service';
import { READ_ATTACHED_FILES_TOOL_NAME } from '@/tools/file-read-tool.types';
import type { AgentRunContext, AgentRunState, AgentRuntimeInput } from '../agent-runtime.types';
import type { ToolDefinition } from '@/tools/dto/tool-definition.dto';

describe('NativeAgentEngineService 文件读取工具接线', () => {
  function createService(toolGateway: {
    findInternalTool: jest.Mock;
    execute: jest.Mock;
  }) {
    return new NativeAgentEngineService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      toolGateway as never,
      {} as never,
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
});
