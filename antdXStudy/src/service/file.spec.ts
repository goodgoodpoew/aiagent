import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const requestMock = vi.fn();
vi.mock('@umijs/max', () => ({ request: (...args: unknown[]) => requestMock(...args) }));

import { deleteFile, fetchFiles, fetchSessionFiles, getFileDownloadUrl, uploadFile } from './file';

const BASE_URL = 'http://localhost:3001/api';

beforeEach(() => {
  requestMock.mockReset();
  requestMock.mockResolvedValue({});
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('file service - request 端点', () => {
  it('fetchFiles 透传筛选参数', async () => {
    await fetchFiles({ status: 'failed', purpose: 'chat', sessionId: 's1', limit: 30 });
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/files`, {
      method: 'GET',
      params: { limit: 30, cursor: undefined, purpose: 'chat', status: 'failed', sessionId: 's1' },
    });
  });

  it('fetchSessionFiles 使用会话文件端点', async () => {
    await fetchSessionFiles('s1', { cursor: 'c1' });
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/sessions/s1/files`, {
      method: 'GET',
      params: { limit: 50, cursor: 'c1' },
    });
  });

  it('deleteFile 使用 DELETE', async () => {
    await deleteFile('f1');
    expect(requestMock).toHaveBeenCalledWith(`${BASE_URL}/files/f1`, { method: 'DELETE' });
  });

  it('getFileDownloadUrl 拼接下载地址', () => {
    expect(getFileDownloadUrl('f1')).toBe(`${BASE_URL}/files/f1/download`);
  });
});

describe('file service - uploadFile 原生 fetch 上传', () => {
  it('上传成功返回解析后的文件信息', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          code: 'OK',
          message: '上传成功',
          data: { id: 'f1', name: 'a.txt', type: 'text/plain', size: 3, status: 'ready', createdAt: '2026-06-06T00:00:00.000Z' },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['abc'], 'a.txt', { type: 'text/plain' });
    const result = await uploadFile(file);

    expect(result).toMatchObject({ id: 'f1', status: 'ready' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE_URL}/files/upload`);
    expect(init.method).toBe('POST');
    expect(init.headers['X-User-Id']).toBeTruthy();
  });

  it('上传失败抛出统一错误', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ success: false, code: 'FILE_TOO_LARGE', message: '文件过大', data: null }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['abc'], 'a.txt', { type: 'text/plain' });
    await expect(uploadFile(file)).rejects.toMatchObject({ code: 'FILE_TOO_LARGE', message: '文件过大' });
  });
});
