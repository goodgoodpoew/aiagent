import { Injectable, Logger } from '@nestjs/common';
import { BuiltinToolAdapter } from './adapters/builtin-tool.adapter';
import { CustomToolAdapter } from './adapters/custom-tool.adapter';
import { McpToolAdapter } from './adapters/mcp-tool.adapter';
import type {
  ToolExecutionRequest,
  ToolExecutionResult,
} from './dto/tool-definition.dto';

const TOOL_EXECUTION_TIMEOUT_MS = 10_000;
const TOOL_RESULT_MAX_CHARS = 12_000;

@Injectable()
export class ToolExecutorService {
  private readonly logger = new Logger(ToolExecutorService.name);

  constructor(
    private readonly builtinToolAdapter: BuiltinToolAdapter,
    private readonly customToolAdapter: CustomToolAdapter,
    private readonly mcpToolAdapter: McpToolAdapter,
  ) {}

  async execute(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    try {
      const result = await this.withTimeout(this.dispatch(request));
      if (request.skipResultTruncation) {
        return result;
      }
      return this.truncateResult(result);
    } catch (error) {
      this.logger.warn(
        `工具执行失败: ${request.tool.source}/${request.tool.name}, ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return {
        toolCallId: request.toolCallId,
        toolName: request.tool.name,
        error: {
          code: 'TOOL_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : '工具执行失败',
        },
      };
    }
  }

  private dispatch(request: ToolExecutionRequest): Promise<ToolExecutionResult> {
    if (request.tool.source === 'builtin') {
      return this.builtinToolAdapter.execute(request);
    }
    if (request.tool.source === 'custom') {
      return this.customToolAdapter.execute(request);
    }
    return this.mcpToolAdapter.execute(request);
  }

  private withTimeout(promise: Promise<ToolExecutionResult>): Promise<ToolExecutionResult> {
    return Promise.race([
      promise,
      new Promise<ToolExecutionResult>((_, reject) => {
        setTimeout(() => reject(new Error('工具执行超时')), TOOL_EXECUTION_TIMEOUT_MS);
      }),
    ]);
  }

  private truncateResult(result: ToolExecutionResult): ToolExecutionResult {
    if (result.result === undefined) return result;

    const serialized = JSON.stringify(result.result);
    if (!serialized || serialized.length <= TOOL_RESULT_MAX_CHARS) {
      return result;
    }

    // 第一版直接截断超长结果；后续可替换为文件化或摘要化存储。
    return {
      ...result,
      result: {
        truncated: true,
        preview: serialized.slice(0, TOOL_RESULT_MAX_CHARS),
      },
    };
  }
}
