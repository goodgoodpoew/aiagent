import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchFiles = vi.fn();
const fetchSessionFiles = vi.fn();
const deleteFile = vi.fn();

vi.mock('@/service/file', () => ({
  fetchFiles: (...args: unknown[]) => fetchFiles(...args),
  fetchSessionFiles: (...args: unknown[]) => fetchSessionFiles(...args),
  deleteFile: (...args: unknown[]) => deleteFile(...args),
}));

import { contentReducer } from './contentStore';
import { fileReducer } from './fileStore';
import { messageReducer } from './messageStore';
import { sessionReducer } from './sessionStore';
import { deleteManagedFile, loadFiles, loadSessionFiles } from './fileThunks';
import { loadFilesSuccess } from './fileStore';

function createStore() {
  return configureStore({
    reducer: {
      sessions: sessionReducer,
      messages: messageReducer,
      content: contentReducer,
      files: fileReducer,
    },
  });
}

const backendFile = {
  id: 'f1',
  name: 'a.txt',
  type: 'text/plain',
  size: 10,
  status: 'ready',
  purpose: 'chat',
  createdAt: '2026-06-06T00:00:00.000Z',
  updatedAt: '2026-06-06T00:00:00.000Z',
};

beforeEach(() => {
  fetchFiles.mockReset();
  fetchSessionFiles.mockReset();
  deleteFile.mockReset();
});

describe('fileThunks', () => {
  it('loadFiles 成功写入全局文件列表', async () => {
    fetchFiles.mockResolvedValue({ files: [backendFile], cursor: null });
    const store = createStore();
    await store.dispatch(loadFiles());

    const state = store.getState();
    expect(state.files.globalIds).toEqual(['f1']);
    expect(state.files.globalLoading).toBe(false);
  });

  it('loadFiles 带状态筛选时透传给 service 并记录筛选', async () => {
    fetchFiles.mockResolvedValue({ files: [], cursor: null });
    const store = createStore();
    await store.dispatch(loadFiles({ status: 'failed' }));

    expect(fetchFiles).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed' }));
    expect(store.getState().files.statusFilter).toBe('failed');
  });

  it('loadFiles 失败写入错误信息', async () => {
    fetchFiles.mockRejectedValue(new Error('加载文件失败'));
    const store = createStore();
    await store.dispatch(loadFiles());

    expect(store.getState().files.globalError).toBe('加载文件失败');
  });

  it('loadSessionFiles 成功写入会话文件列表', async () => {
    fetchSessionFiles.mockResolvedValue({ files: [backendFile], cursor: null });
    const store = createStore();
    await store.dispatch(loadSessionFiles('session-1'));

    expect(store.getState().files.idsBySessionId['session-1']).toEqual(['f1']);
  });

  it('deleteManagedFile 调用 service 并从 state 移除', async () => {
    deleteFile.mockResolvedValue(undefined);
    const store = createStore();
    store.dispatch(loadFilesSuccess({
      files: [{ ...backendFile, sessionCount: 0, messageCount: 0 }],
      cursor: null,
      hasMore: false,
    }));

    await store.dispatch(deleteManagedFile('f1'));

    expect(deleteFile).toHaveBeenCalledWith('f1');
    expect(store.getState().files.globalIds).toEqual([]);
  });
});
