import { Injectable } from '@nestjs/common';
import type {
  ToolDefinition,
  ToolExecutionRequest,
  ToolExecutionResult,
} from '../dto/tool-definition.dto';

@Injectable()
export class BuiltinToolAdapter {
  private readonly definitions: ToolDefinition[] = [
    {
      source: 'builtin',
      name: 'get_current_time',
      description: '获取指定时区的当前时间，用于回答和时间相关的问题。',
      inputSchema: {
        type: 'object',
        properties: {
          timeZone: {
            type: 'string',
            description: 'IANA 时区名称，例如 Asia/Shanghai 或 America/Los_Angeles。',
          },
        },
        additionalProperties: false,
      },
      enabled: true,
    },
  ];

  listTools(): ToolDefinition[] {
    return this.definitions;
  }

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    if (request.tool.name !== 'get_current_time') {
      return {
        toolCallId: request.toolCallId,
        toolName: request.tool.name,
        error: {
          code: 'BUILTIN_TOOL_NOT_FOUND',
          message: `未找到内置工具：${request.tool.name}`,
        },
      };
    }

    const timeZone = typeof request.arguments.timeZone === 'string'
      ? request.arguments.timeZone
      : 'Asia/Shanghai';
    try {
      const now = new Date();
      return {
        toolCallId: request.toolCallId,
        toolName: request.tool.name,
        result: {
          iso: now.toISOString(),
          timeZone,
          formatted: new Intl.DateTimeFormat('zh-CN', {
            dateStyle: 'full',
            timeStyle: 'medium',
            timeZone,
          }).format(now),
        },
      };
    } catch {
      return {
        toolCallId: request.toolCallId,
        toolName: request.tool.name,
        error: {
          code: 'INVALID_TIME_ZONE',
          message: `不支持的时区：${timeZone}`,
        },
      };
    }
  }
}
