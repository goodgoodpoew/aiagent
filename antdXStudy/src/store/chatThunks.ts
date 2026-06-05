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

  // 入口阶段：把输入框文本和已上传完成的附件统一组装成 v2 input.parts。
  // 后端会先把 text parts 投影成给 LLM 的普通 messages，同时用 file parts 找到要读取的附件。
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

  // requestId 贯穿一次流式请求，用于把前端乐观 assistant 消息和后端真实消息对账。
  // clientMessageId 只标识本次用户输入，后端回传 message.created 后用它替换本地临时 user 消息。
  const requestId = crypto.randomUUID?.() ?? createClientId('request');
  const clientMessageId = crypto.randomUUID?.() ?? createClientId('client-message');
  const originalSessionId = state.sessions.currentSessionId;
  const draftSessionId = originalSessionId ?? `draft-${Date.now()}`;
  let userMessageId = createClientId('user');
  let assistantMessageId = createClientId('assistant');

  // 没有当前会话时先创建一个前端草稿会话，让用户刚点发送就能看到消息落在列表里。
  // 等后端真正创建 session 后，syncSession 会把 draft-* 替换成服务端 sessionId。
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

  // 乐观渲染用户消息：请求还没到后端，Bubble.List 先展示用户刚发送的内容。
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

  // 同时创建一个空的 assistant 占位消息。后续 message.part.delta 到来时，
  // reducer 会不断把增量文本拼到这条消息的 parts/content 上，形成流式输出效果。
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

  // 本地消息已经保存了文本和附件元数据，可以清空输入区，避免用户重复提交。
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
      const current = getState().sessions.entities[sessionId];
      // 同一个 session 后续可能只补充 title/version 等元信息，这里只做轻量更新。
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

    // 后端返回了真实 sessionId：把草稿会话和两条乐观消息迁移到服务端会话下。
    const oldSessionId = resolvedSessionId ?? draftSessionId;
    resolvedSessionId = sessionId;
    dispatch(setCurrentSessionId(sessionId));
    dispatch(replaceMessageSessionId({ messageId: userMessageId, oldSessionId, nextSessionId: sessionId }));
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
      // 所有后端 SSE 都是 StreamEventEnvelope；sessionId/messageId 在 envelope 顶层，
      // data 里才是该事件自己的负载。先同步 session，再把事件交给 messageStore 更新消息。
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
        // message.created 是“临时 ID -> 服务端真实 ID”的交接点。
        // 之后 stream.failed 或最终 done 都必须使用真实 assistantMessageId。
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
        // 主聊天页从这里开始只发送 v2 协议；provider 原始 chunk 由后端统一转换为 message.part.*。
        // 这样前端只关心“消息部件如何变化”，不用适配 OpenAI/DeepSeek 等供应商的私有字段。
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

    // sendChatStreamV2 resolve 表示 HTTP 字节流已经结束。失败事件会提前把 streamFailed 置 true，
    // 正常结束则把用户消息和 assistant 消息都收口到 done。
    dispatch(setMessageStatus({ messageId: userMessageId, status: 'done' }));
    if (!streamFailed) {
      dispatch(setMessageStatus({ messageId: assistantMessageId, status: 'done' }));
    }
  } catch (error) {
    // 网络错误、JSON 解析错误等没有进入标准 stream.failed 的客户端异常，落到本地 assistant 占位消息。
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
