import { BuiltinToolAdapter } from './builtin-tool.adapter';
import { READ_ATTACHED_FILES_TOOL_NAME } from '../file-read-tool.types';
import type { ToolDefinition } from '../dto/tool-definition.dto';

describe('BuiltinToolAdapter', () => {
  it('通过内部工具读取本轮附件内容', async () => {
    const fileService = {
      getReadableContentsDetailed: jest.fn().mockResolvedValue({
        readable: [
          {
            fileId: 'file_1',
            name: '需求.txt',
            type: 'text/plain',
            content: '文件正文',
            tokenEstimate: 3,
          },
        ],
        unavailable: [
          {
            fileId: 'file_2',
            name: '解析中.pdf',
            type: 'application/pdf',
            reason: '文件尚未解析成功，未进入本轮模型上下文',
          },
        ],
      }),
    };
    const adapter = new BuiltinToolAdapter(fileService as never);
    const tool = adapter
      .listTools()
      .find((item) => item.name === READ_ATTACHED_FILES_TOOL_NAME) as ToolDefinition;

    const result = await adapter.execute({
      toolCallId: 'internal:req_1:read_attached_files',
      tool,
      arguments: {
        fileIds: ['file_1', 'file_2', 'file_1'],
        userId: 'user_1',
      },
    });

    expect(fileService.getReadableContentsDetailed).toHaveBeenCalledWith(['file_1', 'file_2'], 'user_1');
    expect(result.error).toBeUndefined();
    expect(result.result).toMatchObject({
      readableFileIds: ['file_1'],
      attachmentContext: expect.stringContaining('<file id="file_1"'),
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
          status: 'done',
        },
        {
          fileId: 'file_2',
          name: '解析中.pdf',
          status: 'failed',
          reason: '文件尚未解析成功，未进入本轮模型上下文',
        },
      ],
    });
  });

  it('拒绝缺少 userId 的文件读取参数', async () => {
    const adapter = new BuiltinToolAdapter({} as never);
    const tool = adapter
      .listTools()
      .find((item) => item.name === READ_ATTACHED_FILES_TOOL_NAME) as ToolDefinition;

    const result = await adapter.execute({
      toolCallId: 'internal:req_1:read_attached_files',
      tool,
      arguments: {
        fileIds: ['file_1'],
      },
    });

    expect(result.error).toMatchObject({
      code: 'FILE_READ_ARGUMENTS_INVALID',
    });
  });
});
