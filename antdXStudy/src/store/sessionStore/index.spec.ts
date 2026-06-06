import { afterEach, describe, expect, it } from 'vitest';
import {
  getStoredCurrentSessionId,
  loadSessionsFailure,
  loadSessionsStart,
  loadSessionsSuccess,
  removeSession,
  replaceSessionId,
  sessionReducer,
  setCurrentSessionId,
  upsertSession,
} from './index';
import type { ChatSession } from '../types';

type SessionState = ReturnType<typeof sessionReducer>;

function initialState(): SessionState {
  return sessionReducer(undefined, { type: '@@INIT' });
}

function session(overrides: Partial<ChatSession> & Pick<ChatSession, 'id'>): ChatSession {
  return {
    title: '会话',
    createdAt: '2026-06-06T00:00:00.000Z',
    updatedAt: '2026-06-06T00:00:00.000Z',
    ...overrides,
  };
}

afterEach(() => {
  localStorage.clear();
});

describe('sessionReducer', () => {
  it('loadSessionsStart 进入加载态并清错误', () => {
    const state = sessionReducer({ ...initialState(), error: '旧错误' }, loadSessionsStart());
    expect(state.loading).toBe(true);
    expect(state.error).toBeUndefined();
  });

  it('loadSessionsSuccess 默认 setAll，append 时 upsert 合并', () => {
    let state = sessionReducer(
      initialState(),
      loadSessionsSuccess({ sessions: [session({ id: 's1' })], cursor: 'c1', hasMore: true }),
    );
    expect(state.ids).toEqual(['s1']);
    expect(state.cursor).toBe('c1');
    expect(state.hasMore).toBe(true);

    state = sessionReducer(
      state,
      loadSessionsSuccess({ sessions: [session({ id: 's2' })], cursor: null, hasMore: false, append: true }),
    );
    expect(new Set(state.ids)).toEqual(new Set(['s1', 's2']));

    state = sessionReducer(
      state,
      loadSessionsSuccess({ sessions: [session({ id: 's3' })], cursor: null, hasMore: false }),
    );
    expect(state.ids).toEqual(['s3']);
  });

  it('loadSessionsFailure 记录错误并退出加载', () => {
    const state = sessionReducer({ ...initialState(), loading: true }, loadSessionsFailure('加载会话失败'));
    expect(state.loading).toBe(false);
    expect(state.error).toBe('加载会话失败');
  });

  it('setCurrentSessionId 持久化到 localStorage', () => {
    let state = sessionReducer(initialState(), setCurrentSessionId('s1'));
    expect(state.currentSessionId).toBe('s1');
    expect(getStoredCurrentSessionId()).toBe('s1');

    state = sessionReducer(state, setCurrentSessionId(undefined));
    expect(state.currentSessionId).toBeUndefined();
    expect(getStoredCurrentSessionId()).toBeUndefined();
  });

  it('replaceSessionId 把草稿会话替换为服务端会话并设为当前', () => {
    let state = sessionReducer(initialState(), upsertSession(session({ id: 'draft-1', title: '草稿' })));
    state = sessionReducer(
      state,
      replaceSessionId({ oldId: 'draft-1', nextSession: session({ id: 'real-1', title: '真实会话' }) }),
    );
    expect(state.entities['draft-1']).toBeUndefined();
    expect(state.entities['real-1']?.title).toBe('真实会话');
    expect(state.currentSessionId).toBe('real-1');
  });

  it('removeSession 删除后把当前会话回退到剩余会话', () => {
    let state = sessionReducer(initialState(), upsertSession(session({ id: 's1', updatedAt: '2026-06-06T00:00:02.000Z' })));
    state = sessionReducer(state, upsertSession(session({ id: 's2', updatedAt: '2026-06-06T00:00:01.000Z' })));
    state = sessionReducer(state, setCurrentSessionId('s1'));

    state = sessionReducer(state, removeSession('s1'));
    expect(state.entities.s1).toBeUndefined();
    expect(state.currentSessionId).toBe('s2');
  });

  it('removeSession 删除最后一个会话时当前会话置空', () => {
    let state = sessionReducer(initialState(), upsertSession(session({ id: 's1' })));
    state = sessionReducer(state, setCurrentSessionId('s1'));
    state = sessionReducer(state, removeSession('s1'));
    expect(state.currentSessionId).toBeUndefined();
  });
});
