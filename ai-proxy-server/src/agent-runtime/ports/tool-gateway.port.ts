import type { ToolDefinition, ToolDefinitionRef, ToolExecutionRequest, ToolExecutionResult } from '@/tools/dto/tool-definition.dto';

export const TOOL_GATEWAY = 'TOOL_GATEWAY';

export interface ToolGatewayPort {
  resolveRequestedTools(refs: ToolDefinitionRef[]): ToolDefinition[];
  findByName(name: string): ToolDefinition | undefined;
  findInternalTool(source: ToolDefinition['source'], name: string, serverId?: string): ToolDefinition | undefined;
  execute(request: ToolExecutionRequest): Promise<ToolExecutionResult>;
}
