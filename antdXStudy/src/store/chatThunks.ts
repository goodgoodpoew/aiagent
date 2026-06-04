import { createLocalMessage, normalizeMessageList } from './adapters/messageAdapter';
import { normalizeSession, normalizeSessionList } from './adapters/sessionAdapter';
import {
  appendMessage,
  applyStreamEvent,
  clearSessionMessages,
  loadMessagesFailure,
  loadMessagesStart,
  loadMessagesSuccess,
  markMessageFailed,
  replaceMessageSessionId,
  setMessageStatus,
} from './messageStore';
import {
  getStoredCurrentSessionId,
  loadSessionsFailure,
  loadSessionsStart,
  loadSessionsSuccess,
  removeSession,
  replaceSessionId,
  setCurrentSessionId,
  upsertSession,
} from './sessionStore';
import { clearAttachments, clearInput } from './contentStore';
import { loadSessionFiles } from './fileThunks';
import type { AppDispatch, RootState } from './index';
import {
  attachFilesToSession,
  createSession,
  deleteSession,
  fetchSessions,
} from '@/service/session';
import { subscribeSessionEvents } from '@/service/session-events';
import { fetchSessionMessages } from '@/service/message';
import { sendChatStreamV2 } from '@/service/chat-stream-v2';
import {
  STREAM_PROTOCOL_V2,
  type ChatStreamRequestV2,
  type MessageCreatedData,
  type SessionCreatedData,
  type StreamEventEnvelope,
  type StreamFailedData,
} from '@/service/stream-protocol';

function createClientId(prefix: string) {
  const uuid = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${uuid}`;
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function readStreamFailureData(data: StreamFailedData | { error?: StreamFailedData }): StreamFailedData {
  if ('error' in data && data.error) {
    return {
      ...data.error,
      stage: data.error.stage ?? 'unknown',
    };
  }
  return data as StreamFailedData;
}

export const loadSessions =
  (params?: { append?: boolean }) => async (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(loadSessionsStart());
    try {
      const cursor = params?.append ? getState().sessions.cursor : undefined;
      const response = await fetchSessions({ cursor });
      dispatch(loadSessionsSuccess({ ...normalizeSessionList(response), append: params?.append }));
    } catch (error) {
      dispatch(loadSessionsFailure(getErrorMessage(error, '加载会话失败')));
    }
  };

export const loadMessages =
  (sessionId: string, params?: { append?: boolean }) =>
    async (dispatch: AppDispatch, getState: () => RootState) => {
      dispatch(loadMessagesStart(sessionId));
      try {
        const cursor = params?.append ? getState().messages.cursorBySessionId[sessionId] : undefined;
        const response = await fetchSessionMessages(sessionId, { cursor });
        dispatch(loadMessagesSuccess({ sessionId, ...normalizeMessageList(response), append: params?.append }));
      } catch (error) {
        dispatch(loadMessagesFailure({ sessionId, error: getErrorMessage(error, '加载消息失败') }));
      }
    };

export const subscribeToSessionEvents =
  () => (dispatch: AppDispatch, getState: () => RootState) =>
    subscribeSessionEvents({
      onSessionCreated: (event) => {
        dispatch(upsertSession(normalizeSession({
          id: event.sessionId,
          title: event.title ?? null,
          titleStatus: event.titleStatus,
          version: event.version,
          createdAt: event.createdAt,
          updatedAt: event.updatedAt,
        })));
      },
      onTitleUpdated: (event) => {
        const current = getState().sessions.entities[event.sessionId];

        if (!current) {
          // 实时事件只是加速通道；本地没有实体时回源拉列表对账，不在前端猜测创建。
          void dispatch(loadSessions());
          return;
        }

        if (event.version && current.version && event.version <= current.version) {
          return;
        }

        dispatch(upsertSession(normalizeSession({
          ...current,
          id: event.sessionId,
          title: event.title,
          titleStatus: event.titleStatus ?? current.titleStatus,
          version: event.version ?? current.version,
          updatedAt: event.updatedAt,
        })));
      },
      onMessageCompleted: (event) => {
        const currentSessionId = getState().sessions.currentSessionId;
        if (currentSessionId === event.sessionId) {
          dispatch(setMessageStatus({ messageId: event.messageId, status: 'done' }));
        }
      },
      onUnknownEvent: () => {
        void dispatch(loadSessions());
      },
    });

export const initializeChat = () => async (dispatch: AppDispatch, getState: () => RootState) => {
  await dispatch(loadSessions());
  const state = getState();
  const storedSessionId = getStoredCurrentSessionId();
  const fallbackSessionId = state.sessions.ids[0] ? String(state.sessions.ids[0]) : undefined;
  const nextSessionId =
    storedSessionId && state.sessions.entities[storedSessionId] ? storedSessionId : fallbackSessionId;

  dispatch(setCurrentSessionId(nextSessionId));
  if (nextSessionId) {
    await dispatch(loadMessages(nextSessionId));
    await dispatch(loadSessionFiles(nextSessionId));
  }
};

export const switchSession =
  (sessionId: string) => async (dispatch: AppDispatch, getState: () => RootState) => {
    dispatch(setCurrentSessionId(sessionId));
    dispatch(clearInput());
    dispatch(clearAttachments());
    if (!getState().messages.idsBySessionId[sessionId]?.length) {
      await dispatch(loadMessages(sessionId));
    }
    await dispatch(loadSessionFiles(sessionId));
  };

export const startNewChat = () => (dispatch: AppDispatch) => {
  dispatch(setCurrentSessionId(undefined));
  dispatch(clearInput());
  dispatch(clearAttachments());
};

export const deleteCurrentSession =
  (sessionId: string) => async (dispatch: AppDispatch, getState: () => RootState) => {
    await deleteSession(sessionId);
    dispatch(removeSession(sessionId));
    dispatch(clearSessionMessages(sessionId));
    const nextSessionId = getState().sessions.currentSessionId;
    if (nextSessionId && !getState().messages.idsBySessionId[nextSessionId]?.length) {
      await dispatch(loadMessages(nextSessionId));
    }
  };

export const ensureSessionForUploadedFiles =
  (fileIds: string[], title?: string) =>
    async (dispatch: AppDispatch, getState: () => RootState) => {
      const normalizedFileIds = Array.from(new Set(fileIds.filter(Boolean)));
      if (!normalizedFileIds.length) return undefined;

      const currentSessionId = getState().sessions.currentSessionId;
      if (currentSessionId) {
        await attachFilesToSession(currentSessionId, normalizedFileIds);
        await dispatch(loadSessionFiles(currentSessionId));
        return currentSessionId;
      }

      const session = await createSession({
        title: title?.slice(0, 30) || '文件会话',
        fileIds: normalizedFileIds,
      });
      const normalizedSession = normalizeSession(session);

      dispatch(upsertSession(normalizedSession));
      dispatch(setCurrentSessionId(normalizedSession.id));
      await dispatch(loadSessionFiles(normalizedSession.id));

      return normalizedSession.id;
    };

export const sendCurrentMessage = () => async (dispatch: AppDispatch, getState: () => RootState) => {
  const state = getState();
  const query = state.content.input.trim();
  if (!query || state.messages.streamingMessageId) return;

  const attachments = state.content.attachments;
  const readyAttachments = attachments.filter((a) => a.status === 'ready');
  const readyFileIds = readyAttachments.map((a) => a.id);
  const inputParts: ChatStreamRequestV2['input']['parts'] = [
    { type: 'text', text: query },
    ...readyAttachments.map((attachment) => ({
      type: 'file' as const,
      fileId: attachment.id,
      name: attachment.name,
      mimeType: attachment.type,
    })),
  ];

  const requestId = crypto.randomUUID?.() ?? createClientId('request');
  const clientMessageId = crypto.randomUUID?.() ?? createClientId('client-message');
  const originalSessionId = state.sessions.currentSessionId;
  const draftSessionId = originalSessionId ?? `draft-${Date.now()}`;
  let userMessageId = createClientId('user');
  let assistantMessageId = createClientId('assistant');

  // 说明：如果没有原始会话，则创建一个草稿会话
  if (!originalSessionId) {
    dispatch(setCurrentSessionId(draftSessionId));
    dispatch(upsertSession(normalizeSession({
      id: draftSessionId,
      title: query.slice(0, 30),
      titleStatus: 'pending',
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })));
  }
  // 说明：添加用户消息到会话
  dispatch(appendMessage({
    message: createLocalMessage({
      id: userMessageId,
      sessionId: draftSessionId,
      role: 'user',
      content: query,
      ...(readyAttachments.length ? {
        metadata: {
          clientMessageId,
          requestId,
          attachments: readyAttachments.map((a) => ({
            fileId: a.id,
            name: a.name,
            type: a.type,
            size: a.size,
          })),
        },
      } : { metadata: { clientMessageId, requestId } }),
    }),
    status: 'sending',
  }));
  // 创建一个等待中的回复消息
  dispatch(appendMessage({
    message: createLocalMessage({
      id: assistantMessageId,
      sessionId: draftSessionId,
      role: 'assistant',
      content: '',
      metadata: { requestId },
    }),
    status: 'streaming',
  }));
  // 说明：清除输入和附件
  dispatch(clearInput());
  dispatch(clearAttachments());

  let resolvedSessionId = originalSessionId;
  let streamFailed = false;

  const syncSession = (payload: {
    sessionId: string;
    title?: string | null;
    titleStatus?: string;
    createdAt?: string;
    updatedAt?: string;
    version?: number;
  }) => {
    const sessionId = payload.sessionId;
    if (resolvedSessionId === sessionId) {
      // 获取当前会话实体
      const current = getState().sessions.entities[sessionId];
      // 说明：如果当前会话实体存在，则更新会话实体
      if (current && (payload.title !== undefined || payload.version !== undefined)) {
        dispatch(upsertSession(normalizeSession({
          ...current,
          title: payload.title ?? current.title,
          titleStatus: payload.titleStatus ?? current.titleStatus,
          version: payload.version ?? current.version,
          createdAt: payload.createdAt ?? current.createdAt,
          updatedAt: payload.updatedAt ?? current.updatedAt,
        })));
      }
      return;
    }
    // 说明：如果当前会话实体不存在，则创建一个新会话
    const oldSessionId = resolvedSessionId ?? draftSessionId;
    // 说明：设置当前会话 ID
    resolvedSessionId = sessionId;
    // 说明：设置当前会话 ID
    dispatch(setCurrentSessionId(sessionId));
    // 说明：替换用户消息的会话 ID
    dispatch(replaceMessageSessionId({ messageId: userMessageId, oldSessionId, nextSessionId: sessionId }));
    // 说明：替换回复消息的会话 ID
    dispatch(replaceMessageSessionId({ messageId: assistantMessageId, oldSessionId, nextSessionId: sessionId }));
    const existing = getState().sessions.entities[sessionId];
    const nextSession = normalizeSession({
      id: sessionId,
      title: payload.title ?? existing?.title ?? query.slice(0, 30),
      titleStatus: payload.titleStatus ?? existing?.titleStatus ?? 'pending',
      version: payload.version ?? existing?.version ?? 1,
      createdAt: payload.createdAt ?? existing?.createdAt ?? new Date().toISOString(),
      updatedAt: payload.updatedAt ?? existing?.updatedAt ?? new Date().toISOString(),
    });

    if (oldSessionId.startsWith('draft-')) {
      dispatch(replaceSessionId({ oldId: oldSessionId, nextSession }));
    } else {
      dispatch(upsertSession(nextSession));
    }
    void dispatch(loadSessionFiles(sessionId));
  };

  try {
    const handleStreamEvent = (event: StreamEventEnvelope) => {
      if (event.sessionId) {
        syncSession({ sessionId: event.sessionId });
      }

      if (event.type === 'session.created') {
        const data = event.data as SessionCreatedData;
        syncSession({
          sessionId: data.session.id,
          title: data.session.title,
          titleStatus: data.session.titleStatus,
          createdAt: data.session.createdAt,
          updatedAt: data.session.updatedAt,
          version: data.session.version,
        });
      }

      dispatch(applyStreamEvent(event));

      if (event.type === 'message.created') {
        const data = event.data as MessageCreatedData;
        userMessageId = data.userMessage.id;
        assistantMessageId = data.assistantMessage.id;
      }

      if (event.type === 'stream.failed') {
        streamFailed = true;
        const data = readStreamFailureData(event.data as StreamFailedData | { error?: StreamFailedData });
        if (!event.messageId) {
          // 极早期失败可能没有服务端 messageId，此时把错误落到本地乐观 assistant 消息上。
          dispatch(markMessageFailed({
            messageId: assistantMessageId,
            sessionId: resolvedSessionId ?? draftSessionId,
            requestId,
            error: data,
          }));
        }
      }
    };

    await sendChatStreamV2(
      {
        protocol: STREAM_PROTOCOL_V2,
        input: {
          role: 'user',
          parts: inputParts,
        },
        sessionId: originalSessionId,
        requestId,
        clientMessageId,
        context: readyFileIds.length ? { fileIds: readyFileIds } : undefined,
        // 主聊天页从这里开始只发送 v2 协议，provider 原始 chunk 由后端转换为 message.part.*。
        runtime: {
          provider: state.content.provider,
          model: state.content.model,
          credentialId: state.content.credentialId,
          temperature: state.content.temperature,
          maxTokens: state.content.max_tokens,
          stream: true,
          reasoning: state.content.reasoning,
          autoGenerateSessionName: true,
        },
      },
      {
        onEvent: handleStreamEvent,
      },
    );

    dispatch(setMessageStatus({ messageId: userMessageId, status: 'done' }));
    if (!streamFailed) {
      dispatch(setMessageStatus({ messageId: assistantMessageId, status: 'done' }));
    }
  } catch (error) {
    const message = getErrorMessage(error, '请求失败，请稍后重试');
    dispatch(setMessageStatus({ messageId: userMessageId, status: 'done' }));
    dispatch(markMessageFailed({
      messageId: assistantMessageId,
      sessionId: resolvedSessionId ?? draftSessionId,
      requestId,
      error: {
        code: 'CLIENT_REQUEST_FAILED',
        message,
        retryable: true,
        stage: 'unknown',
      },
    }));
  }
};
