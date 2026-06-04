import {
  createEntityAdapter,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit';
import type { ChatFile } from '../types';

const filesAdapter = createEntityAdapter<ChatFile>({
  sortComparer: (a, b) => b.createdAt.localeCompare(a.createdAt),
});

const initialState = filesAdapter.getInitialState({
  globalIds: [] as string[],
  globalCursor: null as string | null,
  globalHasMore: false,
  globalLoading: false,
  globalError: undefined as string | undefined,
  statusFilter: undefined as string | undefined,
  idsBySessionId: {} as Record<string, string[]>,
  cursorBySessionId: {} as Record<string, string | null>,
  hasMoreBySessionId: {} as Record<string, boolean>,
  loadingBySessionId: {} as Record<string, boolean>,
  errorBySessionId: {} as Record<string, string | undefined>,
});

const fileSlice = createSlice({
  name: 'files',
  initialState,
  reducers: {
    loadFilesStart(state, action: PayloadAction<{ status?: string; append?: boolean } | undefined>) {
      state.globalLoading = true;
      state.globalError = undefined;
      if (!action.payload?.append) {
        state.statusFilter = action.payload?.status;
      }
    },
    loadFilesSuccess(
      state,
      action: PayloadAction<{ files: ChatFile[]; cursor: string | null; hasMore: boolean; append?: boolean }>,
    ) {
      filesAdapter.upsertMany(state, action.payload.files);
      const nextIds = action.payload.files.map((file) => file.id);
      state.globalIds = action.payload.append
        ? Array.from(new Set([...state.globalIds, ...nextIds]))
        : nextIds;
      state.globalCursor = action.payload.cursor;
      state.globalHasMore = action.payload.hasMore;
      state.globalLoading = false;
      state.globalError = undefined;
    },
    loadFilesFailure(state, action: PayloadAction<string>) {
      state.globalLoading = false;
      state.globalError = action.payload;
    },
    loadSessionFilesStart(state, action: PayloadAction<string>) {
      state.loadingBySessionId[action.payload] = true;
      state.errorBySessionId[action.payload] = undefined;
    },
    loadSessionFilesSuccess(
      state,
      action: PayloadAction<{
        sessionId: string;
        files: ChatFile[];
        cursor: string | null;
        hasMore: boolean;
        append?: boolean;
      }>,
    ) {
      const { sessionId, files, cursor, hasMore, append } = action.payload;
      filesAdapter.upsertMany(state, files);
      const nextIds = files.map((file) => file.id);
      state.idsBySessionId[sessionId] = append
        ? Array.from(new Set([...(state.idsBySessionId[sessionId] ?? []), ...nextIds]))
        : nextIds;
      state.cursorBySessionId[sessionId] = cursor;
      state.hasMoreBySessionId[sessionId] = hasMore;
      state.loadingBySessionId[sessionId] = false;
      state.errorBySessionId[sessionId] = undefined;
    },
    loadSessionFilesFailure(state, action: PayloadAction<{ sessionId: string; error: string }>) {
      state.loadingBySessionId[action.payload.sessionId] = false;
      state.errorBySessionId[action.payload.sessionId] = action.payload.error;
    },
    removeFileFromState(state, action: PayloadAction<string>) {
      filesAdapter.removeOne(state, action.payload);
      state.globalIds = state.globalIds.filter((id) => id !== action.payload);
      Object.keys(state.idsBySessionId).forEach((sessionId) => {
        state.idsBySessionId[sessionId] = state.idsBySessionId[sessionId].filter(
          (id) => id !== action.payload,
        );
      });
    },
  },
});

export const {
  loadFilesStart,
  loadFilesSuccess,
  loadFilesFailure,
  loadSessionFilesStart,
  loadSessionFilesSuccess,
  loadSessionFilesFailure,
  removeFileFromState,
} = fileSlice.actions;
export const fileReducer = fileSlice.reducer;
export const fileEntitySelectors = filesAdapter.getSelectors();
