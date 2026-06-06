import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('@umijs/max', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import { fetchTools } from './tool';

beforeEach(() => {
  requestMock.mockReset();
});

describe('tool service', () => {
  it('fetchTools 请求工具列表端点并返回数据', async () => {
    requestMock.mockResolvedValue({ tools: [{ source: 'builtin', name: 'search', description: '', inputSchema: {}, enabled: true }] });
    const result = await fetchTools();
    expect(requestMock).toHaveBeenCalledWith('http://localhost:3001/api/tools');
    expect(result.tools).toHaveLength(1);
  });
});
