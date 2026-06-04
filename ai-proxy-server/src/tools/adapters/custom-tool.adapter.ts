import { Injectable } from '@nestjs/common';
import type {
  ToolDefinition,
  ToolExecutionRequest,
  ToolExecutionResult,
} from '../dto/tool-definition.dto';

@Injectable()
export class CustomToolAdapter {
  listTools(): ToolDefinition[] {
    return [];
  }

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    return {
      toolCallId: request.toolCallId,
      toolName: request.tool.name,
      error: {
        code: 'CUSTOM_TOOL_DISABLED',
        message: '自定义工具执行入口尚未启用',
      },
    };
  }
}
