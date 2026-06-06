import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('@umijs/max', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import {
  attachFilesToSession,
  createSession,
  deleteSession,
  fetchSessions,
  updateSession,
} from './session';

const BASE_URL = 'http://localhost:3001/api';

beforeEach(() => {
  requestMock.mockReset();
  requestMock.mockResolvedValue({});
});

describe('session service', () => {
  it('fetchSessions 传默认 limit 与 cursor', async () => {
    await fetchSessions();
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/sessions`, {
      method: 'GET',
      params: { limit: 20, cursor: undefined },
    });
  });

  it('fetchSessions 透传分页参数', async () => {
    await fetchSessions({ cursor: 'c1', limit: 50 });
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/sessions`, {
      method: 'GET',
      params: { limit: 50, cursor: 'c1' },
    });
  });

  it('createSession 提交标题与文件 ID', async () => {
    await createSession({ title: '新会话', fileIds: ['f1'] });
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/sessions`, {
      method: 'POST',
      data: { title: '新会话', fileIds: ['f1'] },
    });
  });

  it('attachFilesToSession 调用会话文件挂载端点', async () => {
    await attachFilesToSession('s1', ['f1', 'f2']);
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/sessions/s1/files`, {
      method: 'POST',
      data: { fileIds: ['f1', 'f2'] },
    });
  });

  it('updateSession 使用 PATCH', async () => {
    await updateSession('s1', { title: '改名' });
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/sessions/s1`, {
      method: 'PATCH',
      data: { title: '改名' },
    });
  });

  it('deleteSession 使用 DELETE', async () => {
    await deleteSession('s1');
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/sessions/s1`, { method: 'DELETE' });
  });
});
