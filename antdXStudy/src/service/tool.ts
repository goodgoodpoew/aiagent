import { request } from '@umijs/max';

const BASE_URL = 'http://localhost:3001/api';

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
  return request(`${BASE_URL}/tools`);
}
