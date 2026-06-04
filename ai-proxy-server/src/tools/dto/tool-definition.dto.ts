export type ToolSource = 'builtin' | 'custom' | 'mcp';

export interface ToolDefinition {
  source: ToolSource;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId?: string;
  enabled: boolean;
}

export interface ToolDefinitionRef {
  source: ToolSource;
  name: string;
  serverId?: string;
}

export interface ToolExecutionRequest {
  toolCallId: string;
  tool: ToolDefinition;
  arguments: Record<string, unknown>;
}

export interface ToolExecutionResult {
  toolCallId: string;
  toolName: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
  };
}
