import { describe, expect, it } from 'vitest';
import {
  appendMessage,
  applyStreamEvent,
  clearSessionMessages,
  loadMessagesFailure,
  loadMessagesStart,
  loadMessagesSuccess,
  markMessageFailed,
  messageReducer,
  replaceMessageId,
  replaceMessageSessionId,
} from './index';
import { STREAM_PROTOCOL_V2, type StreamEventEnvelope } from '@/service/stream-protocol';
import type { ChatMessage } from '../types';

type MessageState = ReturnType<typeof messageReducer>;

const now = '2026-06-06T00:00:00.000Z';

function initialState(): MessageState {
  return messageReducer(undefined, { type: '@@INIT' });
}

let sequence = 0;
function createEvent(overrides: Partial<StreamEventEnvelope> & Pick<StreamEventEnvelope, 'type' | 'data'>): StreamEventEnvelope {
  sequence += 1;
  return {
    protocol: STREAM_PROTOCOL_V2,
    id: `event-${sequence}`,
    traceId: 'trace-1',
    requestId: 'request-1',
    sessionId: 'session-1',
    timestamp: now,
    sequence,
    ...overrides,
  };
}

function localMessage(overrides: Partial<ChatMessage> & Pick<ChatMessage, 'id' | 'role'>): ChatMessage {
  return {
    sessionId: 'session-1',
    content: '',
    metadata: null,
    createdAt: now,
    ...overrides,
  };
}

describe('messageReducer 基础列表 reducer', () => {
  it('loadMessagesStart/Success/Failure 维护加载与错误态', () => {
    let state = messageReducer(initialState(), loadMessagesStart('session-1'));
    expect(state.loadingBySessionId['session-1']).toBe(true);

    state = messageReducer(
      state,
      loadMessagesSuccess({
        sessionId: 'session-1',
        messages: [localMessage({ id: 'm1', role: 'user', content: '历史', status: 'failed' })],
        cursor: 'cursor-1',
        hasMore: true,
      }),
    );
    expect(state.idsBySessionId['session-1']).toEqual(['m1']);
    expect(state.cursorBySessionId['session-1']).toBe('cursor-1');
    expect(state.hasMoreBySessionId['session-1']).toBe(true);
    expect(state.loadingBySessionId['session-1']).toBe(false);
    // 历史消息从 metadata.status 投影出的运行态需要恢复
    expect(state.statusByMessageId.m1).toBe('failed');

    state = messageReducer(state, loadMessagesFailure({ sessionId: 'session-1', error: '加载失败' }));
    expect(state.errorBySessionId['session-1']).toBe('加载失败');
  });

  it('loadMessagesSuccess append 合并历史，不重复 ID', () => {
    let state = messageReducer(
      initialState(),
      loadMessagesSuccess({
        sessionId: 'session-1',
        messages: [localMessage({ id: 'm1', role: 'user' })],
        cursor: null,
        hasMore: false,
      }),
    );
    state = messageReducer(
      state,
      loadMessagesSuccess({
        sessionId: 'session-1',
        messages: [localMessage({ id: 'm1', role: 'user' }), localMessage({ id: 'm2', role: 'assistant' })],
        cursor: null,
        hasMore: false,
        append: true,
      }),
    );
    expect(state.idsBySessionId['session-1']).toEqual(['m1', 'm2']);
  });

  it('replaceMessageId 迁移状态并保留 streaming 指针', () => {
    let state = messageReducer(
      initialState(),
      appendMessage({ message: localMessage({ id: 'temp', role: 'assistant' }), status: 'streaming' }),
    );
    state = messageReducer(
      state,
      applyStreamEvent(
        createEvent({
          type: 'message.part.started',
          messageId: 'temp',
          data: { part: { id: 'text-1', type: 'text', text: '', status: 'streaming' } },
        }),
      ),
    );
    expect(state.streamingMessageId).toBe('temp');
    state = messageReducer(state, replaceMessageId({ oldId: 'temp', nextId: 'real' }));

    expect(state.entities.real).toBeDefined();
    expect(state.entities.temp).toBeUndefined();
    expect(state.idsBySessionId['session-1']).toEqual(['real']);
    expect(state.statusByMessageId.real).toBe('streaming');
    expect(state.streamingMessageId).toBe('real');
  });

  it('replaceMessageSessionId 把消息迁移到新会话', () => {
    let state = messageReducer(
      initialState(),
      appendMessage({ message: localMessage({ id: 'm1', role: 'user', sessionId: 'draft' }) }),
    );
    state = messageReducer(
      state,
      replaceMessageSessionId({ messageId: 'm1', oldSessionId: 'draft', nextSessionId: 'session-1' }),
    );
    expect(state.idsBySessionId.draft).toEqual([]);
    expect(state.idsBySessionId['session-1']).toEqual(['m1']);
    expect(state.entities.m1?.sessionId).toBe('session-1');
  });

  it('clearSessionMessages 清空会话相关全部状态', () => {
    let state = messageReducer(
      initialState(),
      appendMessage({ message: localMessage({ id: 'm1', role: 'user' }), status: 'done' }),
    );
    state = messageReducer(state, clearSessionMessages('session-1'));
    expect(state.idsBySessionId['session-1']).toBeUndefined();
    expect(state.entities.m1).toBeUndefined();
    expect(state.statusByMessageId.m1).toBeUndefined();
  });

  it('markMessageFailed 写入 error part 与失败态', () => {
    let state = messageReducer(
      initialState(),
      appendMessage({ message: localMessage({ id: 'a1', role: 'assistant' }), status: 'streaming' }),
    );
    state = messageReducer(
      state,
      markMessageFailed({
        messageId: 'a1',
        sessionId: 'session-1',
        requestId: 'request-1',
        error: { code: 'CLIENT_REQUEST_FAILED', message: '网络异常', retryable: true, stage: 'unknown' },
      }),
    );
    expect(state.statusByMessageId.a1).toBe('failed');
    expect(state.errorByMessageId.a1).toBe('网络异常');
    expect(state.entities.a1?.parts?.some((part) => part.type === 'error')).toBe(true);
    expect(state.entities.a1?.content).toBe('网络异常');
  });
});

describe('applyStreamEvent 流式事件应用', () => {
  it('幂等：相同 event.id 只处理一次', () => {
    let state = messageReducer(
      initialState(),
      appendMessage({ message: localMessage({ id: 'a1', role: 'assistant' }), status: 'streaming' }),
    );
    const event = createEvent({
      id: 'dup-event',
      type: 'message.part.delta',
      messageId: 'a1',
      data: { partId: 'text-1', type: 'text', delta: 'A' },
    });
    state = messageReducer(state, applyStreamEvent(event));
    state = messageReducer(state, applyStreamEvent(event));
    const textPart = state.entities.a1?.parts?.find((part) => part.id === 'text-1');
    expect(textPart?.type === 'text' && textPart.text).toBe('A');
  });

  it('message.created 用真实 ID 对账乐观用户与 assistant 消息', () => {
    let state = initialState();
    state = messageReducer(
      state,
      appendMessage({
        message: localMessage({
          id: 'temp-user',
          role: 'user',
          content: '你好',
          metadata: { clientMessageId: 'client-1', requestId: 'request-1' },
        }),
        status: 'sending',
      }),
    );
    state = messageReducer(
      state,
      appendMessage({
        message: localMessage({ id: 'temp-assistant', role: 'assistant', metadata: { requestId: 'request-1' } }),
        status: 'streaming',
      }),
    );

    state = messageReducer(
      state,
      applyStreamEvent(
        createEvent({
          type: 'message.created',
          messageId: 'real-assistant',
          data: {
            clientMessageId: 'client-1',
            userMessage: {
              id: 'real-user',
              role: 'user',
              content: '你好',
              parts: [{ id: 'u-text', type: 'text', text: '你好', status: 'done' }],
              status: 'done',
              metadata: { clientMessageId: 'client-1', requestId: 'request-1' },
              createdAt: now,
            },
            assistantMessage: {
              id: 'real-assistant',
              role: 'assistant',
              content: '',
              parts: [],
              status: 'streaming',
              metadata: { requestId: 'request-1' },
              createdAt: now,
            },
          },
        }),
      ),
    );

    expect(state.entities['temp-user']).toBeUndefined();
    expect(state.entities['temp-assistant']).toBeUndefined();
    expect(state.entities['real-user']).toBeDefined();
    expect(state.statusByMessageId['real-user']).toBe('done');
    expect(state.statusByMessageId['real-assistant']).toBe('streaming');
    expect(state.streamingMessageId).toBe('real-assistant');
    expect(state.idsBySessionId['session-1']).toEqual(['real-user', 'real-assistant']);
  });

  it('part.started 后 part.delta 累积文本并投影到 content', () => {
    let state = messageReducer(
      initialState(),
      appendMessage({ message: localMessage({ id: 'a1', role: 'assistant' }), status: 'streaming' }),
    );
    state = messageReducer(
      state,
      applyStreamEvent(
        createEvent({
          type: 'message.part.started',
          messageId: 'a1',
          data: { part: { id: 'text-1', type: 'text', text: '', status: 'streaming' } },
        }),
      ),
    );
    state = messageReducer(
      state,
      applyStreamEvent(
        createEvent({ type: 'message.part.delta', messageId: 'a1', data: { partId: 'text-1', type: 'text', delta: '你' } }),
      ),
    );
    state = messageReducer(
      state,
      applyStreamEvent(
        createEvent({ type: 'message.part.delta', messageId: 'a1', data: { partId: 'text-1', type: 'text', delta: '好' } }),
      ),
    );

    const part = state.entities.a1?.parts?.find((item) => item.id === 'text-1');
    expect(part?.type === 'text' && part.text).toBe('你好');
    expect(state.entities.a1?.content).toBe('你好');
    expect(state.streamingMessageId).toBe('a1');
  });

  it('part.delta 对未知 messageId 会自动补一条 assistant 占位消息', () => {
    const state = messageReducer(
      initialState(),
      applyStreamEvent(
        createEvent({
          type: 'message.part.delta',
          messageId: 'auto-1',
          data: { partId: 'text-1', type: 'text', delta: 'hi' },
        }),
      ),
    );
    expect(state.entities['auto-1']?.role).toBe('assistant');
    expect(state.entities['auto-1']?.content).toBe('hi');
  });

  it('reasoning delta 只写 part，不污染 content', () => {
    let state = messageReducer(
      initialState(),
      appendMessage({ message: localMessage({ id: 'a1', role: 'assistant' }), status: 'streaming' }),
    );
    state = messageReducer(
      state,
      applyStreamEvent(
        createEvent({
          type: 'message.part.delta',
          messageId: 'a1',
          data: { partId: 'reason-1', type: 'reasoning', delta: '思考中', field: 'summary' },
        }),
      ),
    );
    const part = state.entities.a1?.parts?.find((item) => item.id === 'reason-1');
    expect(part?.type === 'reasoning' && part.summary).toBe('思考中');
    expect(state.entities.a1?.content).toBe('');
  });

  it('reasoning part.completed 将思考过程收口为 done', () => {
    let state = messageReducer(
      initialState(),
      appendMessage({
        message: localMessage({
          id: 'a1',
          role: 'assistant',
          parts: [
            {
              id: 'reason-1',
              type: 'reasoning',
              visibility: 'summary',
              status: 'streaming',
              summary: '思考中',
            },
            { id: 'text-1', type: 'text', text: '正式回答', status: 'streaming' },
          ],
        }),
        status: 'streaming',
      }),
    );
    state = messageReducer(
      state,
      applyStreamEvent(
        createEvent({
          type: 'message.part.completed',
          messageId: 'a1',
          data: {
            partId: 'reason-1',
            type: 'reasoning',
            status: 'done',
            summary: '思考完成',
          },
        }),
      ),
    );

    const reasoningPart = state.entities.a1?.parts?.find((item) => item.id === 'reason-1');
    const textPart = state.entities.a1?.parts?.find((item) => item.id === 'text-1');
    expect(reasoningPart?.type === 'reasoning' && reasoningPart.summary).toBe('思考完成');
    expect(reasoningPart?.type === 'reasoning' && reasoningPart.status).toBe('done');
    expect(textPart?.type === 'text' && textPart.status).toBe('streaming');
    expect(state.statusByMessageId.a1).toBe('streaming');
  });

  it('tool_call delta 累积 argumentsText', () => {
    const state = messageReducer(
      initialState(),
      applyStreamEvent(
        createEvent({
          type: 'message.part.delta',
          messageId: 'a1',
          data: { partId: 'tool-1', type: 'tool_call', delta: '{"q":' },
        }),
      ),
    );
    const part = state.entities.a1?.parts?.find((item) => item.id === 'tool-1');
    expect(part?.type === 'tool_call' && part.argumentsText).toBe('{"q":');
    expect(part?.type === 'tool_call' && part.status).toBe('partial');
  });

  it('part.completed 用后端最终文本覆盖本地累积', () => {
    let state = messageReducer(
      initialState(),
      applyStreamEvent(
        createEvent({
          type: 'message.part.delta',
          messageId: 'a1',
          sessionId: 'session-1',
          data: { partId: 'text-1', type: 'text', delta: '部分' },
        }),
      ),
    );
    state = messageReducer(
      state,
      applyStreamEvent(
        createEvent({
          type: 'message.part.completed',
          messageId: 'a1',
          data: { partId: 'text-1', type: 'text', status: 'done', text: '完整最终答案' },
        }),
      ),
    );
    const part = state.entities.a1?.parts?.find((item) => item.id === 'text-1');
    expect(part?.type === 'text' && part.text).toBe('完整最终答案');
    expect(part?.type === 'text' && part.status).toBe('done');
    expect(state.entities.a1?.content).toBe('完整最终答案');
  });

  it('process.trace 起始/增量/完成驱动处理过程 part', () => {
    let state = messageReducer(
      initialState(),
      applyStreamEvent(
        createEvent({
          type: 'process.trace.started',
          messageId: 'a1',
          data: {
            part: {
              id: 'trace-1',
              type: 'process_trace',
              traceType: 'thinking',
              title: '思考',
              status: 'running',
              visibility: 'summary',
            },
          },
        }),
      ),
    );
    state = messageReducer(
      state,
      applyStreamEvent(
        createEvent({
          type: 'process.trace.delta',
          messageId: 'a1',
          data: { partId: 'trace-1', summaryDelta: '正在检索' },
        }),
      ),
    );
    state = messageReducer(
      state,
      applyStreamEvent(
        createEvent({
          type: 'process.trace.completed',
          messageId: 'a1',
          data: { partId: 'trace-1', status: 'done', summary: '检索完成' },
        }),
      ),
    );
    const part = state.entities.a1?.parts?.find((item) => item.id === 'trace-1');
    expect(part?.type === 'process_trace' && part.summary).toBe('检索完成');
    expect(part?.type === 'process_trace' && part.status).toBe('done');
  });

  it('message.completed 用快照覆盖并收口为 done', () => {
    let state = messageReducer(
      initialState(),
      applyStreamEvent(
        createEvent({
          type: 'message.part.delta',
          messageId: 'a1',
          data: { partId: 'text-1', type: 'text', delta: '半截' },
        }),
      ),
    );
    expect(state.streamingMessageId).toBe('a1');
    state = messageReducer(
      state,
      applyStreamEvent(
        createEvent({
          type: 'message.completed',
          messageId: 'a1',
          data: {
            message: {
              id: 'a1',
              role: 'assistant',
              content: '最终回答',
              parts: [{ id: 'text-1', type: 'text', text: '最终回答', status: 'done' }],
              status: 'done',
              metadata: { requestId: 'request-1' },
              createdAt: now,
            },
          },
        }),
      ),
    );
    expect(state.entities.a1?.content).toBe('最终回答');
    expect(state.statusByMessageId.a1).toBe('done');
    expect(state.streamingMessageId).toBeUndefined();
  });

  it('stream.completed 关闭 streaming 状态', () => {
    let state = messageReducer(
      initialState(),
      applyStreamEvent(
        createEvent({
          type: 'message.part.started',
          messageId: 'a1',
          data: { part: { id: 'text-1', type: 'text', text: '', status: 'streaming' } },
        }),
      ),
    );
    expect(state.streamingMessageId).toBe('a1');
    state = messageReducer(
      state,
      applyStreamEvent(createEvent({ type: 'stream.completed', messageId: 'a1', data: { completedAt: now } })),
    );
    expect(state.statusByMessageId.a1).toBe('done');
    expect(state.streamingMessageId).toBeUndefined();
  });

  it('stream.failed 写入唯一 error part 并清空 streaming 指针', () => {
    let state = messageReducer(
      initialState(),
      applyStreamEvent(
        createEvent({
          type: 'message.part.started',
          messageId: 'a1',
          data: { part: { id: 'text-1', type: 'text', text: '', status: 'streaming' } },
        }),
      ),
    );
    expect(state.streamingMessageId).toBe('a1');
    state = messageReducer(
      state,
      applyStreamEvent(
        createEvent({
          type: 'stream.failed',
          messageId: 'a1',
          data: { code: 'PROVIDER_ERROR', message: '上游错误', retryable: false, stage: 'provider_stream' },
        }),
      ),
    );
    const errorParts = state.entities.a1?.parts?.filter((part) => part.type === 'error') ?? [];
    expect(errorParts).toHaveLength(1);
    expect(state.statusByMessageId.a1).toBe('failed');
    expect(state.streamingMessageId).toBeUndefined();
  });

  it('stream.failed 兼容旧版 { error } 包裹结构', () => {
    let state = messageReducer(
      initialState(),
      appendMessage({ message: localMessage({ id: 'a1', role: 'assistant' }), status: 'streaming' }),
    );
    state = messageReducer(
      state,
      applyStreamEvent(
        createEvent({
          type: 'stream.failed',
          messageId: 'a1',
          data: { error: { code: 'X', message: '包裹错误', retryable: true } },
        }),
      ),
    );
    expect(state.errorByMessageId.a1).toBe('包裹错误');
  });
});
