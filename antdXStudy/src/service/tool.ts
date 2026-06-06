import { request } from '@umijs/max';
import { getApiBaseUrl } from './config';

const toolsUrl = () => `${getApiBaseUrl()}/tools`;

export type ToolSource = 'builtin' | 'custom' | 'mcp';

export interface ToolDefinition {
  source: ToolSource;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  serverId?: string;
  enabled: boolean;
}

export async function fetchTools(): Promise<{ tools: ToolDefinition[] }> {
  return request(toolsUrl());
}
