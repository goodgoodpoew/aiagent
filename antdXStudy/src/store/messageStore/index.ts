import { createEntityAdapter, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ChatMessage, MessageRuntimeStatus } from '../types';
import { getMessageTextProjection, normalizeStreamMessage } from '../adapters/messageAdapter';
import type {
  ErrorMessagePart,
  MessageCompletedData,
  MessageCreatedData,
  ReasoningMessagePart,
  MessagePartCompletedData,
  MessagePartDeltaData,
  MessagePartStartedData,
  StreamEventEnvelope,
  StreamFailedData,
  ToolCallMessagePart,
} from '@/service/stream-protocol';

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
  processedStreamEventIds: {} as Record<string, true>,
});

function mergeSessionMessageIds(currentIds: string[] | undefined, nextIds: string[]) {
  return Array.from(new Set([...(currentIds ?? []), ...nextIds]));
}

function upsertMessageToSession(
  state: typeof initialState,
  message: ChatMessage,
  status?: MessageRuntimeStatus,
) {
  messagesAdapter.upsertOne(state, message);
  state.idsBySessionId[message.sessionId] = mergeSessionMessageIds(state.idsBySessionId[message.sessionId], [message.id]);
  if (status) {
    state.statusByMessageId[message.id] = status;
  }
}

function removeMessageIdFromSessions(state: typeof initialState, messageId: string) {
  Object.keys(state.idsBySessionId).forEach((sessionId) => {
    state.idsBySessionId[sessionId] = (state.idsBySessionId[sessionId] ?? []).filter((id) => id !== messageId);
  });
}

function findOptimisticUserMessageId(
  state: typeof initialState,
  clientMessageId: string,
) {
  return state.ids.find((id) => {
    const message = state.entities[id];
    return message?.role === 'user'
      && (message.metadata as { clientMessageId?: string } | null | undefined)?.clientMessageId === clientMessageId;
  }) as string | undefined;
}

function findOptimisticAssistantMessageId(
  state: typeof initialState,
  requestId: string,
) {
  return state.ids.find((id) => {
    const message = state.entities[id];
    return message?.role === 'assistant'
      && (message.metadata as { requestId?: string } | null | undefined)?.requestId === requestId
      && state.statusByMessageId[String(id)] === 'streaming';
  }) as string | undefined;
}

function replaceOrUpsertMessage(
  state: typeof initialState,
  oldId: string | undefined,
  nextMessage: ChatMessage,
  status: MessageRuntimeStatus,
) {
  if (oldId && oldId !== nextMessage.id) {
    removeMessageIdFromSessions(state, oldId);
    messagesAdapter.removeOne(state, oldId);
    if (state.statusByMessageId[oldId]) {
      delete state.statusByMessageId[oldId];
    }
    if (state.errorByMessageId[oldId]) {
      delete state.errorByMessageId[oldId];
    }
    if (state.streamingMessageId === oldId) {
      state.streamingMessageId = nextMessage.id;
    }
  }

  upsertMessageToSession(state, nextMessage, status);
}

function ensureAssistantMessage(
  state: typeof initialState,
  params: { messageId: string; sessionId: string; requestId: string },
) {
  const message = state.entities[params.messageId];
  if (message) return message;

  const nextMessage: ChatMessage = {
    id: params.messageId,
    sessionId: params.sessionId,
    role: 'assistant',
    content: '',
    parts: [],
    metadata: { protocol: 'aiagent.stream.v2', requestId: params.requestId },
    createdAt: new Date().toISOString(),
  };
  upsertMessageToSession(state, nextMessage, 'streaming');
  return nextMessage;
}

function projectTextParts(message: ChatMessage) {
  message.content = getMessageTextProjection(message);
}

function readStreamFailureData(data: StreamFailedData | { error?: StreamFailedData }) {
  if ('error' in data && data.error) {
    // 兼容旧的 v2 草案形状，正式协议已改为扁平 stream.failed。
    return {
      ...data.error,
      stage: data.error.stage ?? 'unknown',
    } satisfies StreamFailedData;
  }
  return data as StreamFailedData;
}

function applyFailedMessage(
  state: typeof initialState,
  params: {
    messageId: string;
    sessionId?: string;
    requestId: string;
    error: StreamFailedData;
    sequence?: number;
  },
) {
  const existing = state.entities[params.messageId];
  const message = existing ?? (params.sessionId
    ? ensureAssistantMessage(state, {
      messageId: params.messageId,
      sessionId: params.sessionId,
      requestId: params.requestId,
    })
    : undefined);
  if (!message) return;

  const errorPart: ErrorMessagePart = {
    id: `${params.messageId}:error:${params.sequence ?? 0}`,
    type: 'error',
    code: params.error.code,
    message: params.error.message,
    retryable: params.error.retryable,
    stage: params.error.stage,
  };

  // 失败态只保留一个 error part，避免 catch 和 stream.failed 双入口重复追加同一条错误文案。
  message.parts = [...(message.parts ?? []).filter((part) => part.type !== 'error'), errorPart];
  if (!getMessageTextProjection(message)) {
    message.content = params.error.message;
  }
  state.statusByMessageId[params.messageId] = 'failed';
  state.errorByMessageId[params.messageId] = params.error.message;
  if (state.streamingMessageId === params.messageId) {
    state.streamingMessageId = undefined;
  }
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
      messages.forEach((message) => {
        // 历史消息从 metadata.status 恢复运行态，刷新后失败消息和未完成占位不会丢状态。
        if (message.status) {
          state.statusByMessageId[message.id] = message.status;
        }
      });
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
    applyStreamEvent(state, action: PayloadAction<StreamEventEnvelope>) {
      const event = action.payload;
      if (state.processedStreamEventIds[event.id]) return;
      state.processedStreamEventIds[event.id] = true;

      if (event.type === 'message.created') {
        const data = event.data as MessageCreatedData;
        const sessionId = event.sessionId;
        if (!sessionId) return;

        const oldUserMessageId = findOptimisticUserMessageId(state, data.clientMessageId);
        const oldAssistantMessageId = findOptimisticAssistantMessageId(state, event.requestId);
        const userMessage = normalizeStreamMessage(
          data.userMessage,
          sessionId,
          oldUserMessageId ? state.entities[oldUserMessageId] : undefined,
        );
        const assistantMessage = normalizeStreamMessage(
          data.assistantMessage,
          sessionId,
          oldAssistantMessageId ? state.entities[oldAssistantMessageId] : undefined,
        );

        // message.created 是乐观消息和服务端真实 ID 的对账点。
        replaceOrUpsertMessage(state, oldUserMessageId, userMessage, 'done');
        replaceOrUpsertMessage(state, oldAssistantMessageId, assistantMessage, 'streaming');
        state.streamingMessageId = assistantMessage.id;
        return;
      }

      if (event.type === 'message.part.started') {
        const data = event.data as MessagePartStartedData;
        if (!event.messageId || !event.sessionId) return;
        const message = ensureAssistantMessage(state, {
          messageId: event.messageId,
          sessionId: event.sessionId,
          requestId: event.requestId,
        });
        message.parts ??= [];
        if (!message.parts.some((part) => part.id === data.part.id)) {
          message.parts.push(data.part);
        }
        state.statusByMessageId[event.messageId] = 'streaming';
        state.streamingMessageId = event.messageId;
        return;
      }

      if (event.type === 'message.part.delta') {
        const data = event.data as MessagePartDeltaData;
        if (!event.messageId || !event.sessionId) return;
        const message = ensureAssistantMessage(state, {
          messageId: event.messageId,
          sessionId: event.sessionId,
          requestId: event.requestId,
        });
        message.parts ??= [];
        let part = message.parts.find((item) => item.id === data.partId);
        if (!part && data.type === 'text') {
          part = { id: data.partId, type: 'text', text: '', status: 'streaming' };
          message.parts.push(part);
        }
        if (!part && data.type === 'reasoning') {
          part = {
            id: data.partId,
            type: 'reasoning',
            visibility: 'summary',
            status: 'streaming',
          };
          message.parts.push(part);
        }
        if (!part && data.type === 'tool_call') {
          part = {
            id: data.partId,
            type: 'tool_call',
            toolCallId: data.partId,
            toolName: '未知工具',
            source: 'custom',
            argumentsText: '',
            status: 'partial',
          };
          message.parts.push(part);
        }
        if (part?.type === 'text') {
          part.text += data.delta;
          part.status = 'streaming';
          projectTextParts(message);
        }
        if (part?.type === 'reasoning') {
          // reasoning part 只更新自身，禁止回写 message.content，避免思考内容混入最终回答。
          const field = data.field ?? 'text';
          if (field === 'summary') {
            part.summary = `${part.summary ?? ''}${data.delta}`;
          } else if (field === 'encryptedContent') {
            part.encryptedContent = `${part.encryptedContent ?? ''}${data.delta}`;
          } else if (part.visibility === 'full') {
            part.text = `${part.text ?? ''}${data.delta}`;
          }
          part.status = 'streaming';
        }
        if (part?.type === 'tool_call') {
          // 工具参数是模型流式生成的 JSON 字符串，先保留原文，完成时再用解析后的 arguments 覆盖展示。
          part.argumentsText = `${part.argumentsText ?? ''}${data.delta}`;
          part.status = 'partial';
        }
        state.statusByMessageId[event.messageId] = 'streaming';
        state.streamingMessageId = event.messageId;
        return;
      }

      if (event.type === 'message.part.completed') {
        const data = event.data as MessagePartCompletedData;
        if (!event.messageId || !event.sessionId) return;
        const message = ensureAssistantMessage(state, {
          messageId: event.messageId,
          sessionId: event.sessionId,
          requestId: event.requestId,
        });
        const part = message.parts?.find((item) => item.id === data.partId);
        if (part?.type === 'text') {
          if (data.text !== undefined) {
            part.text = data.text;
          }
          part.status = data.status === 'done' ? 'done' : part.status;
          projectTextParts(message);
        }
        if (part?.type === 'reasoning') {
          const reasoningPart = part as ReasoningMessagePart;
          if (data.text !== undefined && reasoningPart.visibility === 'full') {
            reasoningPart.text = data.text;
          }
          if (data.summary !== undefined) {
            reasoningPart.summary = data.summary;
          }
          if (data.encryptedContent !== undefined) {
            reasoningPart.encryptedContent = data.encryptedContent;
          }
          reasoningPart.status = data.status === 'done' ? 'done' : reasoningPart.status;
        }
        if (part?.type === 'tool_call') {
          const toolCallPart = part as ToolCallMessagePart;
          if (data.argumentsText !== undefined) {
            toolCallPart.argumentsText = data.argumentsText;
          }
          if (data.arguments !== undefined) {
            toolCallPart.arguments = data.arguments;
          }
          toolCallPart.status = data.toolStatus ?? (data.status === 'failed' ? 'failed' : 'done');
        }
        if (part?.type === 'tool_result') {
          if (data.result !== undefined) {
            part.result = data.result;
          }
          if (data.error !== undefined) {
            part.error = data.error;
          }
          part.status = data.status;
        }
        const failedMessagePart = data.status === 'failed'
          && data.type !== 'tool_call'
          && data.type !== 'tool_result';
        state.statusByMessageId[event.messageId] = failedMessagePart ? 'failed' : 'streaming';
        return;
      }

      if (event.type === 'message.completed') {
        const data = event.data as MessageCompletedData;
        if (!event.sessionId) return;
        const message = normalizeStreamMessage(data.message, event.sessionId, state.entities[data.message.id]);
        upsertMessageToSession(state, message, 'done');
        if (state.streamingMessageId === message.id) {
          state.streamingMessageId = undefined;
        }
        return;
      }

      if (event.type === 'stream.completed') {
        if (event.messageId) {
          state.statusByMessageId[event.messageId] = 'done';
        }
        if (!event.messageId || state.streamingMessageId === event.messageId) {
          state.streamingMessageId = undefined;
        }
        return;
      }

      if (event.type === 'stream.failed') {
        const data = readStreamFailureData(event.data as StreamFailedData | { error?: StreamFailedData });
        if (event.messageId) {
          applyFailedMessage(state, {
            messageId: event.messageId,
            sessionId: event.sessionId,
            requestId: event.requestId,
            error: data,
            sequence: event.sequence,
          });
        }
        state.streamingMessageId = undefined;
      }
    },
    markMessageFailed(
      state,
      action: PayloadAction<{
        messageId: string;
        sessionId?: string;
        requestId: string;
        error: StreamFailedData;
      }>,
    ) {
      applyFailedMessage(state, action.payload);
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
  applyStreamEvent,
  markMessageFailed,
  replaceMessageSessionId,
  replaceMessageId,
  setMessageStatus,
  clearSessionMessages,
} = messageSlice.actions;
export const messageReducer = messageSlice.reducer;
export const messageEntitySelectors = messagesAdapter.getSelectors();
