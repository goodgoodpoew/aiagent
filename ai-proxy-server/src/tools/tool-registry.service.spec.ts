import { ToolRegistryService } from './tool-registry.service';
import { READ_ATTACHED_FILES_TOOL_NAME } from './file-read-tool.types';
import type { ToolDefinition } from './dto/tool-definition.dto';

describe('ToolRegistryService', () => {
  it('公开列表隐藏内部工具，但允许 runtime 显式查找内部工具', () => {
    const publicTool: ToolDefinition = {
      source: 'builtin',
      name: 'get_current_time',
      description: '获取时间',
      inputSchema: {},
      enabled: true,
    };
    const internalTool: ToolDefinition = {
      source: 'builtin',
      name: READ_ATTACHED_FILES_TOOL_NAME,
      description: '读取附件',
      inputSchema: {},
      enabled: true,
      internal: true,
    };
    const service = new ToolRegistryService(
      { listTools: jest.fn(() => [publicTool, internalTool]) } as never,
      { listTools: jest.fn(() => []) } as never,
      { listTools: jest.fn(() => []) } as never,
    );

    expect(service.listTools()).toEqual([publicTool]);
    expect(service.findByName(READ_ATTACHED_FILES_TOOL_NAME)).toBeUndefined();
    expect(service.findInternalTool('builtin', READ_ATTACHED_FILES_TOOL_NAME)).toBe(internalTool);
  });
});
