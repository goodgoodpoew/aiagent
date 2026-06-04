import {
  createEntityAdapter,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import type { ChatSession } from '../types';

const CURRENT_SESSION_STORAGE_KEY = 'currentSessionId';

export const getStoredCurrentSessionId = () => {
  if (typeof localStorage === 'undefined') return undefined;
  return localStorage.getItem(CURRENT_SESSION_STORAGE_KEY) || undefined;
};

function persistCurrentSessionId(sessionId?: string) {
  // localStorage 只保存轻量偏好，真实会话与消息仍以后端持久化数据为准。
  if (typeof localStorage === 'undefined') return;
  if (sessionId) {
    localStorage.setItem(CURRENT_SESSION_STORAGE_KEY, sessionId);
    localStorage.setItem('sessionId', sessionId);
  } else {
    localStorage.removeItem(CURRENT_SESSION_STORAGE_KEY);
    localStorage.removeItem('sessionId');
  }
}

const sessionsAdapter = createEntityAdapter<ChatSession>({
  sortComparer: (a, b) => b.updatedAt.localeCompare(a.updatedAt),
});

const initialState = sessionsAdapter.getInitialState({
  currentSessionId: undefined as string | undefined,
  cursor: null as string | null,
  hasMore: false,
  loading: false,
  error: undefined as string | undefined,
});

const sessionSlice = createSlice({
  name: 'sessions',
  initialState,
  reducers: {
    loadSessionsStart(state) {
      state.loading = true;
      state.error = undefined;
    },
    loadSessionsSuccess(
      state,
      action: PayloadAction<{ sessions: ChatSession[]; cursor: string | null; hasMore: boolean; append?: boolean }>,
    ) {
      if (action.payload.append) {
        sessionsAdapter.upsertMany(state, action.payload.sessions);
      } else {
        sessionsAdapter.setAll(state, action.payload.sessions);
      }
      state.cursor = action.payload.cursor;
      state.hasMore = action.payload.hasMore;
      state.loading = false;
      state.error = undefined;
    },
    loadSessionsFailure(state, action: PayloadAction<string>) {
      state.loading = false;
      state.error = action.payload;
    },
    setCurrentSessionId(state, action: PayloadAction<string | undefined>) {
      state.currentSessionId = action.payload;
      persistCurrentSessionId(action.payload);
    },
    upsertSession(state, action: PayloadAction<ChatSession>) {
      sessionsAdapter.upsertOne(state, action.payload);
    },
    replaceSessionId(state, action: PayloadAction<{ oldId: string; nextSession: ChatSession }>) {
      const { oldId, nextSession } = action.payload;
      // draft 会话只是前端乐观展示，拿到后端真实 sessionId 后必须合并成一个实体。
      if (oldId !== nextSession.id) {
        sessionsAdapter.removeOne(state, oldId);
      }
      sessionsAdapter.upsertOne(state, nextSession);
      state.currentSessionId = nextSession.id;
      persistCurrentSessionId(nextSession.id);
    },
    removeSession(state, action: PayloadAction<string>) {
      sessionsAdapter.removeOne(state, action.payload);
      if (state.currentSessionId === action.payload || !state.entities[state.currentSessionId ?? '']) {
        const nextSessionId = state.ids.find((id) => state.entities[id]);
        state.currentSessionId = nextSessionId ? String(nextSessionId) : undefined;
        persistCurrentSessionId(state.currentSessionId);
      }
    },
    clearSessionError(state) {
      state.error = undefined;
    },
  },
});

export const {
  loadSessionsStart,
  loadSessionsSuccess,
  loadSessionsFailure,
  setCurrentSessionId,
  upsertSession,
  replaceSessionId,
  removeSession,
  clearSessionError,
} = sessionSlice.actions;
export const sessionReducer = sessionSlice.reducer;
export const sessionEntitySelectors = sessionsAdapter.getSelectors();
