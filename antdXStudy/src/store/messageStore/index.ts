import { createEntityAdapter, createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { ChatMessage, MessageRuntimeStatus } from '../types';
import { getMessageTextProjection, normalizeStreamMessage } from '../adapters/messageAdapter';
import type {
  ErrorMessagePart,
  FileReadMessagePart,
  MessageCompletedData,
  MessageCreatedData,
  ReasoningMessagePart,
  MessagePartCompletedData,
  MessagePartDeltaData,
  MessagePartStartedData,
  ProcessTraceCompletedData,
  ProcessTraceDeltaData,
  ProcessTraceMessagePart,
  ProcessTraceStartedData,
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

function ensureProcessTracePart(
  message: ChatMessage,
  partId: string,
  fallback?: Partial<ProcessTraceMessagePart>,
) {
  message.parts ??= [];
  let part = message.parts.find((item) => item.id === partId);
  if (!part) {
    part = {
      id: partId,
      type: 'process_trace',
      traceType: fallback?.traceType ?? 'system',
      title: fallback?.title ?? '处理过程',
      status: fallback?.status ?? 'running',
      visibility: fallback?.visibility ?? 'summary',
      summary: fallback?.summary,
      detail: fallback?.detail,
      refs: fallback?.refs,
      metrics: fallback?.metrics,
      error: fallback?.error,
    } satisfies ProcessTraceMessagePart;
    message.parts.push(part);
  }
  return part.type === 'process_trace' ? part : undefined;
}

function applyProcessTraceDelta(
  part: ProcessTraceMessagePart,
  data: ProcessTraceDeltaData,
) {
  if (data.summaryDelta) {
    part.summary = `${part.summary ?? ''}${data.summaryDelta}`;
  }
  if (data.status) {
    part.status = data.status;
  }
  if (data.detailPatch) {
    part.detail = {
      ...(part.detail ?? {}),
      ...data.detailPatch,
    };
  }
  if (data.metricsPatch) {
    part.metrics = {
      ...(part.metrics ?? {}),
      ...data.metricsPatch,
    };
  }
}

function applyProcessTraceCompleted(
  part: ProcessTraceMessagePart,
  data: ProcessTraceCompletedData | MessagePartCompletedData,
) {
  part.status = ('traceStatus' in data && data.traceStatus) ? data.traceStatus : data.status;
  if ('traceType' in data && data.traceType) {
    part.traceType = data.traceType;
  }
  if ('title' in data && data.title) {
    part.title = data.title;
  }
  if ('visibility' in data && data.visibility) {
    part.visibility = data.visibility;
  }
  if (data.summary !== undefined) {
    part.summary = data.summary;
  }
  if (data.detail !== undefined) {
    part.detail = data.detail;
  }
  if (data.refs !== undefined) {
    part.refs = data.refs;
  }
  if (data.metrics !== undefined) {
    part.metrics = data.metrics;
  }
  if ('processError' in data && data.processError !== undefined) {
    part.error = data.processError;
  }
  if ('error' in data && data.error !== undefined) {
    part.error = data.error;
  }
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
      // SSE 在网络抖动或重试场景下可能重复送达同一事件，event.id 是幂等保护。
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

        // message.created 是乐观消息和服务端真实 ID 的对账点：
        // 前端先用临时 ID 渲染，后端创建数据库消息后回传快照，这里保留原展示位置并替换 ID。
        replaceOrUpsertMessage(state, oldUserMessageId, userMessage, 'done');
        replaceOrUpsertMessage(state, oldAssistantMessageId, assistantMessage, 'streaming');
        state.streamingMessageId = assistantMessage.id;
        return;
      }

      if (event.type === 'message.part.started') {
        // part.started 表示 assistant 消息里出现了一个结构化部件：
        // 可能是正文 text、思考 reasoning、工具调用、工具结果或附件读取状态。
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

      if (event.type === 'process.trace.started') {
        const data = event.data as ProcessTraceStartedData;
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
        // part.delta 是流式输出的核心：后端每收到一小段 provider 增量，
        // 就转成某个 part 的 delta，前端在这里把它追加到对应 part 上。
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
        if (!part && data.type === 'process_trace') {
          part = ensureProcessTracePart(message, data.partId);
        }
        if (part?.type === 'text') {
          // text part 的投影会同步写入 message.content，供 Bubble.List 和旧展示逻辑读取。
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
        if (part?.type === 'process_trace') {
          part.summary = `${part.summary ?? ''}${data.delta}`;
          part.status = 'running';
        }
        state.statusByMessageId[event.messageId] = 'streaming';
        state.streamingMessageId = event.messageId;
        return;
      }

      if (event.type === 'process.trace.delta') {
        const data = event.data as ProcessTraceDeltaData;
        if (!event.messageId || !event.sessionId) return;
        const message = ensureAssistantMessage(state, {
          messageId: event.messageId,
          sessionId: event.sessionId,
          requestId: event.requestId,
        });
        const part = ensureProcessTracePart(message, data.partId);
        if (part) {
          applyProcessTraceDelta(part, data);
        }
        state.statusByMessageId[event.messageId] = 'streaming';
        state.streamingMessageId = event.messageId;
        return;
      }

      if (event.type === 'message.part.completed') {
        // part.completed 是单个部件的收口点：用后端最终值覆盖本地增量累积结果，
        // 可以修正丢 chunk、工具参数解析、附件读取失败等中间态。
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
        if (part?.type === 'file_read') {
          const fileReadPart = part as FileReadMessagePart;
          if (data.name !== undefined) {
            fileReadPart.name = data.name;
          }
          if (data.mimeType !== undefined) {
            fileReadPart.mimeType = data.mimeType;
          }
          if (data.tokenEstimate !== undefined) {
            fileReadPart.tokenEstimate = data.tokenEstimate;
          }
          if (data.reason !== undefined) {
            fileReadPart.reason = data.reason;
          }
          fileReadPart.status = data.status;
        }
        if (part?.type === 'process_trace') {
          applyProcessTraceCompleted(part, data);
        }
        const failedMessagePart = data.status === 'failed'
          && data.type !== 'tool_call'
          && data.type !== 'tool_result'
          && data.type !== 'file_read'
          && data.type !== 'process_trace';
        state.statusByMessageId[event.messageId] = failedMessagePart ? 'failed' : 'streaming';
        return;
      }

      if (
        event.type === 'process.trace.completed'
        || event.type === 'process.trace.failed'
        || event.type === 'process.trace.skipped'
      ) {
        const data = event.data as ProcessTraceCompletedData;
        if (!event.messageId || !event.sessionId) return;
        const message = ensureAssistantMessage(state, {
          messageId: event.messageId,
          sessionId: event.sessionId,
          requestId: event.requestId,
        });
        const part = ensureProcessTracePart(message, data.partId);
        if (part) {
          applyProcessTraceCompleted(part, data);
        }
        state.statusByMessageId[event.messageId] = 'streaming';
        return;
      }

      if (event.type === 'message.completed') {
        // message.completed 携带完整 assistant 快照，是整条消息的最终权威版本。
        // 本地累积的 parts/content 会被快照覆盖，保证刷新后和数据库内容一致。
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
        // stream.completed 表示本次 SSE 会话正常结束；此时可以关闭 loading/streaming 状态。
        // 具体消息内容已经由 message.completed 或前面的 part 事件写入。
        if (event.messageId) {
          state.statusByMessageId[event.messageId] = 'done';
        }
        if (!event.messageId || state.streamingMessageId === event.messageId) {
          state.streamingMessageId = undefined;
        }
        return;
      }

      if (event.type === 'stream.failed') {
        // stream.failed 是流式链路的统一失败出口。后端会尽量携带 messageId，
        // 前端把错误写成 error part，让气泡内只出现一份失败提示。
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
