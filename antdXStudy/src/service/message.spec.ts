import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('@umijs/max', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import { fetchSessionMessages } from './message';

const BASE_URL = 'http://localhost:3001/api';

beforeEach(() => {
  requestMock.mockReset();
  requestMock.mockResolvedValue({});
});

describe('message service', () => {
  it('fetchSessionMessages 使用默认 limit 50', async () => {
    await fetchSessionMessages('s1');
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/sessions/s1/messages`, {
      method: 'GET',
      params: { limit: 50, cursor: undefined },
    });
  });

  it('fetchSessionMessages 透传 cursor', async () => {
    await fetchSessionMessages('s1', { cursor: 'c1', limit: 10 });
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/sessions/s1/messages`, {
      method: 'GET',
      params: { limit: 10, cursor: 'c1' },
    });
  });
});
