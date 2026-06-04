import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './index';
import type { ChatBubbleItem } from './types';

export const selectCurrentSessionId = (state: RootState) => state.sessions.currentSessionId;

const selectSessionIds = (state: RootState) => state.sessions.ids;
const selectSessionEntities = (state: RootState) => state.sessions.entities;
const selectMessageIdsBySessionId = (state: RootState) => state.messages.idsBySessionId;
const selectMessageEntities = (state: RootState) => state.messages.entities;
const selectMessageStatusById = (state: RootState) => state.messages.statusByMessageId;
const selectStreamingMessageId = (state: RootState) => state.messages.streamingMessageId;
const selectFileEntities = (state: RootState) => state.files.entities;

export const selectSessions = createSelector(
  [selectSessionIds, selectSessionEntities],
  (ids, entities) => ids.map((id) => entities[id]).filter(Boolean),
);

export const selectCurrentSession = (state: RootState) => {
  const sessionId = selectCurrentSessionId(state);
  return sessionId ? state.sessions.entities[sessionId] : undefined;
};

export const selectCurrentMessages = createSelector(
  [selectCurrentSessionId, selectMessageIdsBySessionId, selectMessageEntities],
  (sessionId, idsBySessionId, entities) => {
    if (!sessionId) return [];
    const messageIds = idsBySessionId[sessionId] ?? [];
    return messageIds.map((id) => entities[id]).filter(Boolean);
  },
);

export const selectBubbleItems = createSelector(
  [selectCurrentMessages, selectMessageStatusById],
  // selector 是页面展示结构的唯一出口，避免组件里反复把领域消息转换成 Bubble.List items。
  (messages, statusByMessageId): ChatBubbleItem[] => messages.map((message) => {
    return {
      key: message.id,
      role: message.role,
      content: message,
      loading: statusByMessageId[message.id] === 'streaming' && !message.content, // 状态为streaming 并且没有内容产出的时候才loading
    }
  }),
);

export const selectCanSend = (state: RootState) => {
  const input = state.content.input.trim();
  const hasUploadingAttachment = state.content.attachments.some((item) => item.status === 'uploading');
  return Boolean(input) && !state.messages.streamingMessageId && !hasUploadingAttachment;
};

export const selectStreamingState = createSelector([selectStreamingMessageId], (streamingMessageId) => ({
  streamingMessageId,
  isStreaming: Boolean(streamingMessageId),
}));

export const selectCurrentSessionFiles = createSelector(
  [selectCurrentSessionId, (state: RootState) => state.files.idsBySessionId, selectFileEntities],
  (sessionId, idsBySessionId, entities) => {
    if (!sessionId) return [];
    return (idsBySessionId[sessionId] ?? []).map((id) => entities[id]).filter(Boolean);
  },
);

export const selectManagedFiles = createSelector(
  [(state: RootState) => state.files.globalIds, selectFileEntities],
  (ids, entities) => ids.map((id) => entities[id]).filter(Boolean),
);
