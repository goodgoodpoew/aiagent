import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from './index';
import type { ChatBubbleItem } from './types';
import { getMessageTextProjection } from './adapters/messageAdapter';

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
  // selector 是“Redux 领域消息 -> Ant Design X Bubble.List items”的唯一出口。
  // content 保留完整 ChatMessage，真正的正文/思考/工具展示交给 MessagePartsRenderer 分流处理。
  (messages, statusByMessageId): ChatBubbleItem[] => messages.map((message) => {
    const projectedContent = getMessageTextProjection(message);
    return {
      key: message.id,
      role: message.role,
      content: message,
      loading: statusByMessageId[message.id] === 'streaming' && !projectedContent, // 状态为streaming 并且没有内容产出的时候才loading
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
