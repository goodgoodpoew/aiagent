import { createEntityAdapter, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ChatMessage, MessageRuntimeStatus } from '../types';

const messagesAdapter = createEntityAdapter<ChatMessage>({
  sortComparer: (a, b) => a.createdAt.localeCompare(b.createdAt),
});

const initialState = messagesAdapter.getInitialState({
  idsBySessionId: {} as Record<string, string[]>,
  cursorBySessionId: {} as Record<string, string | null>,
  hasMoreBySessionId: {} as Record<string, boolean>,
  loadingBySessionId: {} as Record<string, boolean>,
  errorBySessionId: {} as Record<string, string | undefined>,
  statusByMessageId: {} as Record<string, MessageRuntimeStatus>,
  errorByMessageId: {} as Record<string, string | undefined>,
  streamingMessageId: undefined as string | undefined,
});

function mergeSessionMessageIds(currentIds: string[] | undefined, nextIds: string[]) {
  return Array.from(new Set([...(currentIds ?? []), ...nextIds]));
}

const messageSlice = createSlice({
  name: 'messages',
  initialState,
  reducers: {
    loadMessagesStart(state, action: PayloadAction<string>) {
      state.loadingBySessionId[action.payload] = true;
    },
    loadMessagesSuccess(
      state,
      action: PayloadAction<{
        sessionId: string;
        messages: ChatMessage[];
        cursor: string | null;
        hasMore: boolean;
        append?: boolean;
      }>,
    ) {
      const { sessionId, messages, cursor, hasMore, append } = action.payload;
      messagesAdapter.upsertMany(state, messages);
      const nextIds = messages.map((item) => item.id);
      state.idsBySessionId[sessionId] = append
        ? mergeSessionMessageIds(state.idsBySessionId[sessionId], nextIds)
        : nextIds;
      state.cursorBySessionId[sessionId] = cursor;
      state.hasMoreBySessionId[sessionId] = hasMore;
      state.loadingBySessionId[sessionId] = false;
      state.errorBySessionId[sessionId] = undefined;
    },
    loadMessagesFailure(state, action: PayloadAction<{ sessionId: string; error: string }>) {
      state.loadingBySessionId[action.payload.sessionId] = false;
      state.errorBySessionId[action.payload.sessionId] = action.payload.error;
    },
    appendMessage(
      state,
      action: PayloadAction<{ message: ChatMessage; status?: MessageRuntimeStatus }>,
    ) {
      messagesAdapter.upsertOne(state, action.payload.message);
      const { sessionId, id } = action.payload.message;
      state.idsBySessionId[sessionId] = mergeSessionMessageIds(state.idsBySessionId[sessionId], [id]);
      if (action.payload.status) {
        state.statusByMessageId[id] = action.payload.status;
      }
    },
    appendAssistantDelta(state, action: PayloadAction<{ messageId: string; delta: string }>) {
      const message = state.entities[action.payload.messageId];
      if (!message) return;
      // SSE 返回的是 delta 增量，这里只负责合并前端运行时内容，最终持久化以后端落库结果为准。
      message.content += action.payload.delta;
      state.statusByMessageId[action.payload.messageId] = 'streaming';
      state.streamingMessageId = action.payload.messageId;
    },
    replaceMessageSessionId(
      state,
      action: PayloadAction<{ messageId: string; oldSessionId: string; nextSessionId: string }>,
    ) {
      const message = state.entities[action.payload.messageId];
      if (!message || action.payload.oldSessionId === action.payload.nextSessionId) return;
      message.sessionId = action.payload.nextSessionId;
      state.idsBySessionId[action.payload.oldSessionId] = (state.idsBySessionId[action.payload.oldSessionId] ?? [])
        .filter((id) => id !== action.payload.messageId);
      state.idsBySessionId[action.payload.nextSessionId] = mergeSessionMessageIds(
        state.idsBySessionId[action.payload.nextSessionId],
        [action.payload.messageId],
      );
    },
    replaceMessageId(
      state,
      action: PayloadAction<{ oldId: string; nextId: string }>,
    ) {
      const { oldId, nextId } = action.payload;
      if (oldId === nextId || state.entities[nextId]) return;
      const message = state.entities[oldId];
      if (!message) return;

      const nextMessage = { ...message, id: nextId };
      messagesAdapter.removeOne(state, oldId);
      messagesAdapter.upsertOne(state, nextMessage);

      const ids = state.idsBySessionId[message.sessionId] ?? [];
      state.idsBySessionId[message.sessionId] = ids.map((id) => (id === oldId ? nextId : id));
      if (state.statusByMessageId[oldId]) {
        state.statusByMessageId[nextId] = state.statusByMessageId[oldId];
        delete state.statusByMessageId[oldId];
      }
      if (state.errorByMessageId[oldId]) {
        state.errorByMessageId[nextId] = state.errorByMessageId[oldId];
        delete state.errorByMessageId[oldId];
      }
      if (state.streamingMessageId === oldId) {
        state.streamingMessageId = nextId;
      }
    },
    setMessageStatus(
      state,
      action: PayloadAction<{ messageId: string; status: MessageRuntimeStatus; error?: string }>,
    ) {
      state.statusByMessageId[action.payload.messageId] = action.payload.status;
      state.errorByMessageId[action.payload.messageId] = action.payload.error;
      if (action.payload.status !== 'streaming' && state.streamingMessageId === action.payload.messageId) {
        state.streamingMessageId = undefined;
      }
    },
    clearSessionMessages(state, action: PayloadAction<string>) {
      const messageIds = state.idsBySessionId[action.payload] ?? [];
      messagesAdapter.removeMany(state, messageIds);
      delete state.idsBySessionId[action.payload];
      delete state.cursorBySessionId[action.payload];
      delete state.hasMoreBySessionId[action.payload];
      delete state.loadingBySessionId[action.payload];
      delete state.errorBySessionId[action.payload];
      messageIds.forEach((id) => {
        delete state.statusByMessageId[id];
        delete state.errorByMessageId[id];
      });
    },
  },
});

export const {
  loadMessagesStart,
  loadMessagesSuccess,
  loadMessagesFailure,
  appendMessage,
  appendAssistantDelta,
  replaceMessageSessionId,
  replaceMessageId,
  setMessageStatus,
  clearSessionMessages,
} = messageSlice.actions;
export const messageReducer = messageSlice.reducer;
export const messageEntitySelectors = messagesAdapter.getSelectors();
