import { BadRequestException, Injectable } from '@nestjs/common';
import { BuiltinToolAdapter } from './adapters/builtin-tool.adapter';
import { CustomToolAdapter } from './adapters/custom-tool.adapter';
import { McpToolAdapter } from './adapters/mcp-tool.adapter';
import type { ToolDefinition, ToolDefinitionRef } from './dto/tool-definition.dto';

@Injectable()
export class ToolRegistryService {
  constructor(
    private readonly builtinToolAdapter: BuiltinToolAdapter,
    private readonly customToolAdapter: CustomToolAdapter,
    private readonly mcpToolAdapter: McpToolAdapter,
  ) {}

  listTools(): ToolDefinition[] {
    return this.listAllTools().filter((tool) => tool.enabled && !tool.internal);
  }

  private listAllTools(): ToolDefinition[] {
    return [
      ...this.builtinToolAdapter.listTools(),
      ...this.customToolAdapter.listTools(),
      ...this.mcpToolAdapter.listTools(),
    ].filter((tool) => tool.enabled);
  }

  resolveRequestedTools(refs: ToolDefinitionRef[] = []): ToolDefinition[] {
    const availableTools = this.listTools();
    return refs.map((ref) => {
      const tool = availableTools.find((item) =>
        item.source === ref.source
        && item.name === ref.name
        && (ref.source !== 'mcp' || item.serverId === ref.serverId),
      );
      if (!tool) {
        // 请求侧只能引用后端注册表中的工具，避免前端携带任意 schema 后被执行。
        throw new BadRequestException(`工具未注册或未启用：${ref.source}/${ref.name}`);
      }
      return tool;
    });
  }

  findTool(source: ToolDefinition['source'], name: string, serverId?: string): ToolDefinition | undefined {
    return this.listTools().find((tool) =>
      tool.source === source
      && tool.name === name
      && (source !== 'mcp' || tool.serverId === serverId),
    );
  }

  findByName(name: string): ToolDefinition | undefined {
    return this.listTools().find((tool) => tool.name === name);
  }

  findInternalTool(source: ToolDefinition['source'], name: string, serverId?: string): ToolDefinition | undefined {
    return this.listAllTools().find((tool) =>
      tool.internal
      && tool.source === source
      && tool.name === name
      && (source !== 'mcp' || tool.serverId === serverId),
    );
  }
}
