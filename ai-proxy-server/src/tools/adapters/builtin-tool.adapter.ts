import { Injectable } from '@nestjs/common';
import { FileService } from '@/files/file.service';
import {
  buildAttachmentContext,
  READ_ATTACHED_FILES_TOOL_NAME,
  type FileReadToolArguments,
  type FileReadToolResult,
} from '../file-read-tool.types';
import type {
  ToolDefinition,
  ToolExecutionRequest,
  ToolExecutionResult,
} from '../dto/tool-definition.dto';
import {
  buildLocationAcquisitionContext,
  LOCATION_ACQUISITION_TOOL_NAME,
  parseLocationAcquisitionArguments,
  type LocationAcquisitionToolResult,
} from '../location-acquisition.types';

@Injectable()
export class BuiltinToolAdapter {
  constructor(private readonly fileService: FileService) { }

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
    {
      source: 'builtin',
      name: READ_ATTACHED_FILES_TOOL_NAME,
      description: '读取当前用户本轮明确附加的文件内容，供聊天上下文组装使用。',
      inputSchema: {
        type: 'object',
        required: ['fileIds', 'userId'],
        properties: {
          fileIds: {
            type: 'array',
            items: { type: 'string' },
            description: '本轮用户消息明确携带的文件 ID 列表。',
          },
          userId: {
            type: 'string',
            description: '当前请求用户 ID。',
          },
        },
        additionalProperties: false,
      },
      enabled: true,
      internal: true,
    },
    {
      source: 'builtin',
      name: LOCATION_ACQUISITION_TOOL_NAME,
      description: '获取用户当前位置，用于回答天气、附近地点、路线或与地理位置相关的问题。',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
      enabled: true,
    },
  ];

  listTools(): ToolDefinition[] {
    return this.definitions;
  }

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    if (request.tool.name === 'get_current_time') {
      return this.getCurrentTime(request);
    }

    if (request.tool.name === READ_ATTACHED_FILES_TOOL_NAME) {
      return this.readAttachedFiles(request);
    }

    if (request.tool.name === LOCATION_ACQUISITION_TOOL_NAME) {
      return this.acquireLocation(request);
    }

    return {
      toolCallId: request.toolCallId,
      toolName: request.tool.name,
      error: {
        code: 'BUILTIN_TOOL_NOT_FOUND',
        message: `未找到内置工具：${request.tool.name}`,
      },
    };
  }

  private async getCurrentTime(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
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

  private async readAttachedFiles(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    const args = this.parseFileReadArguments(request.arguments);
    if (!args) {
      return {
        toolCallId: request.toolCallId,
        toolName: request.tool.name,
        error: {
          code: 'FILE_READ_ARGUMENTS_INVALID',
          message: '读取附件工具参数不合法',
        },
      };
    }

    const detail = await this.fileService.getReadableContentsDetailed(args.fileIds, args.userId);
    const result: FileReadToolResult = {
      readable: detail.readable,
      unavailable: detail.unavailable,
      readableFileIds: detail.readable.map((file) => file.fileId),
      attachmentContext: buildAttachmentContext(detail.readable),
      attachments: detail.readable.map((file) => ({
        fileId: file.fileId,
        name: file.name,
        type: file.type,
        status: 'ready',
      })),
      readResults: [
        ...detail.readable.map((file) => ({
          fileId: file.fileId,
          name: file.name,
          mimeType: file.type,
          tokenEstimate: file.tokenEstimate,
          status: 'done' as const,
        })),
        ...detail.unavailable.map((file) => ({
          fileId: file.fileId,
          name: file.name ?? file.fileId,
          mimeType: file.type,
          status: 'failed' as const,
          reason: file.reason,
        })),
      ],
    };

    return {
      toolCallId: request.toolCallId,
      toolName: request.tool.name,
      result,
    };
  }

  private acquireLocation(request: ToolExecutionRequest): ToolExecutionResult {
    const args = parseLocationAcquisitionArguments(request.arguments);
    if (!args) {
      return {
        toolCallId: request.toolCallId,
        toolName: request.tool.name,
        error: {
          code: 'LOCATION_UNAVAILABLE',
          message: '用户位置不可用，请授权位置权限或在消息中说明所在城市。',
        },
      };
    }

    const result: LocationAcquisitionToolResult = {
      location: args.location,
      contextText: buildLocationAcquisitionContext(args.location),
    };

    return {
      toolCallId: request.toolCallId,
      toolName: request.tool.name,
      result,
    };
  }

  private parseFileReadArguments(args: Record<string, unknown>): FileReadToolArguments | null {
    const fileIds = Array.isArray(args.fileIds)
      ? args.fileIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
    const userId = typeof args.userId === 'string' ? args.userId : '';

    if (!userId) return null;

    return {
      fileIds: Array.from(new Set(fileIds)),
      userId,
    };
  }
}
