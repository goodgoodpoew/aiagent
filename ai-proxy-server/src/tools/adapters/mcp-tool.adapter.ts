import { Injectable } from '@nestjs/common';
import type {
  ToolDefinition,
  ToolExecutionRequest,
  ToolExecutionResult,
} from '../dto/tool-definition.dto';

@Injectable()
export class McpToolAdapter {
  listTools(): ToolDefinition[] {
    return [];
  }

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    return {
      toolCallId: request.toolCallId,
      toolName: request.tool.name,
      error: {
        code: 'MCP_TOOL_DISABLED',
        message: 'MCP 工具适配入口已预留，当前未配置 MCP server',
      },
    };
  }
}
