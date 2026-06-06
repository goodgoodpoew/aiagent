import { describe, expect, it } from 'vitest';
import {
  fileReducer,
  loadFilesFailure,
  loadFilesStart,
  loadFilesSuccess,
  loadSessionFilesFailure,
  loadSessionFilesStart,
  loadSessionFilesSuccess,
  removeFileFromState,
} from './index';
import type { ChatFile } from '../types';

type FileState = ReturnType<typeof fileReducer>;

function initialState(): FileState {
  return fileReducer(undefined, { type: '@@INIT' });
}

function file(overrides: Partial<ChatFile> & Pick<ChatFile, 'id'>): ChatFile {
  return {
    name: '文件.txt',
    type: 'text/plain',
    size: 100,
    status: 'ready',
    purpose: 'chat',
    createdAt: '2026-06-06T00:00:00.000Z',
    updatedAt: '2026-06-06T00:00:00.000Z',
    sessionCount: 0,
    messageCount: 0,
    ...overrides,
  };
}

describe('fileReducer 全局文件', () => {
  it('loadFilesStart 记录状态筛选，append 时保留筛选', () => {
    let state = fileReducer(initialState(), loadFilesStart({ status: 'failed' }));
    expect(state.globalLoading).toBe(true);
    expect(state.statusFilter).toBe('failed');

    state = fileReducer(state, loadFilesStart({ append: true }));
    expect(state.statusFilter).toBe('failed');
  });

  it('loadFilesSuccess 默认替换列表，append 去重合并', () => {
    let state = fileReducer(
      initialState(),
      loadFilesSuccess({ files: [file({ id: 'f1' })], cursor: 'c1', hasMore: true }),
    );
    expect(state.globalIds).toEqual(['f1']);
    expect(state.globalHasMore).toBe(true);

    state = fileReducer(
      state,
      loadFilesSuccess({ files: [file({ id: 'f1' }), file({ id: 'f2' })], cursor: null, hasMore: false, append: true }),
    );
    expect(state.globalIds).toEqual(['f1', 'f2']);

    state = fileReducer(
      state,
      loadFilesSuccess({ files: [file({ id: 'f3' })], cursor: null, hasMore: false }),
    );
    expect(state.globalIds).toEqual(['f3']);
  });

  it('loadFilesFailure 记录错误', () => {
    const state = fileReducer(initialState(), loadFilesFailure('加载文件失败'));
    expect(state.globalLoading).toBe(false);
    expect(state.globalError).toBe('加载文件失败');
  });
});

describe('fileReducer 会话文件', () => {
  it('loadSessionFiles 起始/成功/失败维护会话维度状态', () => {
    let state = fileReducer(initialState(), loadSessionFilesStart('session-1'));
    expect(state.loadingBySessionId['session-1']).toBe(true);

    state = fileReducer(
      state,
      loadSessionFilesSuccess({
        sessionId: 'session-1',
        files: [file({ id: 'f1' })],
        cursor: null,
        hasMore: false,
      }),
    );
    expect(state.idsBySessionId['session-1']).toEqual(['f1']);
    expect(state.loadingBySessionId['session-1']).toBe(false);

    state = fileReducer(state, loadSessionFilesFailure({ sessionId: 'session-1', error: '加载会话文件失败' }));
    expect(state.errorBySessionId['session-1']).toBe('加载会话文件失败');
  });

  it('removeFileFromState 同步从全局和会话列表移除', () => {
    let state = fileReducer(
      initialState(),
      loadFilesSuccess({ files: [file({ id: 'f1' })], cursor: null, hasMore: false }),
    );
    state = fileReducer(
      state,
      loadSessionFilesSuccess({ sessionId: 'session-1', files: [file({ id: 'f1' })], cursor: null, hasMore: false }),
    );
    state = fileReducer(state, removeFileFromState('f1'));
    expect(state.entities.f1).toBeUndefined();
    expect(state.globalIds).toEqual([]);
    expect(state.idsBySessionId['session-1']).toEqual([]);
  });
});
