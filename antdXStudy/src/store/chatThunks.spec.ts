import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createSession = vi.fn();
const deleteSession = vi.fn();
const fetchSessions = vi.fn();
const attachFilesToSession = vi.fn();
const fetchSessionMessages = vi.fn();
const sendChatStreamV2 = vi.fn();
const subscribeSessionEvents = vi.fn();
const fetchSessionFiles = vi.fn();
const acquireClientLocation = vi.fn();

vi.mock('@/service/client-location', () => ({
  acquireClientLocation: (...a: unknown[]) => acquireClientLocation(...a),
  LOCATION_ACQUISITION_TOOL_REF: { source: 'builtin', name: 'location_acquisition' },
}));

vi.mock('@/service/session', () => ({
  createSession: (...a: unknown[]) => createSession(...a),
  deleteSession: (...a: unknown[]) => deleteSession(...a),
  fetchSessions: (...a: unknown[]) => fetchSessions(...a),
  attachFilesToSession: (...a: unknown[]) => attachFilesToSession(...a),
}));
vi.mock('@/service/message', () => ({
  fetchSessionMessages: (...a: unknown[]) => fetchSessionMessages(...a),
}));
vi.mock('@/service/chat-stream-v2', () => ({
  sendChatStreamV2: (...a: unknown[]) => sendChatStreamV2(...a),
}));
vi.mock('@/service/session-events', () => ({
  subscribeSessionEvents: (...a: unknown[]) => subscribeSessionEvents(...a),
}));
vi.mock('@/service/file', () => ({
  fetchSessionFiles: (...a: unknown[]) => fetchSessionFiles(...a),
  fetchFiles: vi.fn().mockResolvedValue({ files: [], cursor: null }),
  deleteFile: vi.fn(),
}));

import { contentReducer, setInput } from './contentStore';
import { fileReducer } from './fileStore';
import { messageReducer } from './messageStore';
import { sessionReducer, setCurrentSessionId, upsertSession } from './sessionStore';
import {
  deleteCurrentSession,
  ensureSessionForUploadedFiles,
  loadMessages,
  loadSessions,
  sendCurrentMessage,
  subscribeToSessionEvents,
  switchSession,
} from './chatThunks';
import { STREAM_PROTOCOL_V2 } from '@/service/stream-protocol';

const now = '2026-06-06T00:00:00.000Z';

function createStore() {
  return configureStore({
    reducer: {
      sessions: sessionReducer,
      messages: messageReducer,
      content: contentReducer,
      files: fileReducer,
    },
  });
}

function env(overrides: Record<string, unknown>) {
  return {
    protocol: STREAM_PROTOCOL_V2,
    id: `event-${Math.random().toString(16).slice(2)}`,
    traceId: 'trace-1',
    requestId: 'request-1',
    sessionId: 's1',
    timestamp: now,
    sequence: 1,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  [
    createSession,
    deleteSession,
    fetchSessions,
    attachFilesToSession,
    fetchSessionMessages,
    sendChatStreamV2,
    subscribeSessionEvents,
    fetchSessionFiles,
    acquireClientLocation,
  ].forEach((m) => m.mockReset());
  fetchSessionFiles.mockResolvedValue({ files: [], cursor: null });
  acquireClientLocation.mockResolvedValue({
    ok: true,
    location: {
      latitude: 31.2304,
      longitude: 121.4737,
      label: '上海市黄浦区',
    },
  });
});

describe('loadSessions / loadMessages', () => {
  it('loadSessions 成功写入会话列表', async () => {
    fetchSessions.mockResolvedValue({ sessions: [{ id: 's1', title: '会话', updatedAt: now, createdAt: now }], cursor: null });
    const store = createStore();
    await store.dispatch(loadSessions());
    expect(store.getState().sessions.ids).toEqual(['s1']);
  });

  it('loadSessions 失败写入错误', async () => {
    fetchSessions.mockRejectedValue(new Error('加载会话失败'));
    const store = createStore();
    await store.dispatch(loadSessions());
    expect(store.getState().sessions.error).toBe('加载会话失败');
  });

  it('loadMessages 成功写入消息', async () => {
    fetchSessionMessages.mockResolvedValue({
      messages: [{ id: 'm1', sessionId: 's1', role: 'user', content: '你好', createdAt: now }],
      cursor: null,
    });
    const store = createStore();
    await store.dispatch(loadMessages('s1'));
    expect(store.getState().messages.idsBySessionId.s1).toEqual(['m1']);
  });

  it('loadMessages 失败写入错误', async () => {
    fetchSessionMessages.mockRejectedValue(new Error('加载消息失败'));
    const store = createStore();
    await store.dispatch(loadMessages('s1'));
    expect(store.getState().messages.errorBySessionId.s1).toBe('加载消息失败');
  });
});

describe('sendCurrentMessage 完整流式链路', () => {
  it('无会话发送：创建草稿会话并完成流式回答', async () => {
    sendChatStreamV2.mockImplementation(async (_req: unknown, { onEvent }: { onEvent: (e: unknown) => void }) => {
      onEvent(env({
        type: 'session.created',
        data: { session: { id: 's1', title: '新会话', titleStatus: 'pending', version: 1, createdAt: now, updatedAt: now } },
      }));
      onEvent(env({
        type: 'message.created',
        messageId: 'assistant-real',
        data: {
          clientMessageId: 'will-be-overridden',
          userMessage: { id: 'user-real', role: 'user', content: '你好', parts: [], status: 'done', metadata: {}, createdAt: now },
          assistantMessage: { id: 'assistant-real', role: 'assistant', content: '', parts: [], status: 'streaming', metadata: { requestId: 'request-1' }, createdAt: now },
        },
      }));
      onEvent(env({
        type: 'message.part.started',
        messageId: 'assistant-real',
        data: { part: { id: 'text-1', type: 'text', text: '', status: 'streaming' } },
      }));
      onEvent(env({ type: 'message.part.delta', messageId: 'assistant-real', data: { partId: 'text-1', type: 'text', delta: '最终回答' } }));
      onEvent(env({
        type: 'message.completed',
        messageId: 'assistant-real',
        data: { message: { id: 'assistant-real', role: 'assistant', content: '最终回答', parts: [{ id: 'text-1', type: 'text', text: '最终回答', status: 'done' }], status: 'done', metadata: {}, createdAt: now } },
      }));
      onEvent(env({ type: 'stream.completed', messageId: 'assistant-real', data: { completedAt: now } }));
    });

    const store = createStore();
    store.dispatch(setInput('你好'));
    await store.dispatch(sendCurrentMessage());

    const state = store.getState();
    expect(state.sessions.currentSessionId).toBe('s1');
    expect(state.messages.streamingMessageId).toBeUndefined();
    const assistant = state.messages.entities['assistant-real'];
    expect(assistant?.content).toBe('最终回答');
    expect(state.messages.statusByMessageId['assistant-real']).toBe('done');
    // 输入区已清空
    expect(state.content.input).toBe('');
    expect(acquireClientLocation).toHaveBeenCalled();
    expect(sendChatStreamV2).toHaveBeenCalledWith(
      expect.objectContaining({
        context: {
          clientLocation: {
            latitude: 31.2304,
            longitude: 121.4737,
            label: '上海市黄浦区',
          },
        },
        runtime: expect.objectContaining({
          tools: [{ source: 'builtin', name: 'location_acquisition' }],
        }),
      }),
      expect.any(Object),
    );
  });

  it('空输入或正在流式时不发送', async () => {
    const store = createStore();
    await store.dispatch(sendCurrentMessage());
    expect(sendChatStreamV2).not.toHaveBeenCalled();
  });

  it('stream.failed 把 assistant 消息标记为失败', async () => {
    sendChatStreamV2.mockImplementation(async (_req: unknown, { onEvent }: { onEvent: (e: unknown) => void }) => {
      onEvent(env({
        type: 'message.created',
        messageId: 'assistant-real',
        data: {
          clientMessageId: 'x',
          userMessage: { id: 'user-real', role: 'user', content: '你好', parts: [], status: 'done', metadata: {}, createdAt: now },
          assistantMessage: { id: 'assistant-real', role: 'assistant', content: '', parts: [], status: 'streaming', metadata: { requestId: 'request-1' }, createdAt: now },
        },
      }));
      onEvent(env({
        type: 'stream.failed',
        messageId: 'assistant-real',
        data: { code: 'PROVIDER_ERROR', message: '上游错误', retryable: false, stage: 'provider_stream' },
      }));
    });

    const store = createStore();
    store.dispatch(setCurrentSessionId('s1'));
    store.dispatch(setInput('你好'));
    await store.dispatch(sendCurrentMessage());

    const state = store.getState();
    expect(state.messages.statusByMessageId['assistant-real']).toBe('failed');
    expect(state.messages.streamingMessageId).toBeUndefined();
  });

  it('客户端异常落到本地 assistant 占位消息', async () => {
    sendChatStreamV2.mockRejectedValue(new Error('网络中断'));
    const store = createStore();
    store.dispatch(setCurrentSessionId('s1'));
    store.dispatch(setInput('你好'));
    await store.dispatch(sendCurrentMessage());

    const state = store.getState();
    const failed = Object.values(state.messages.entities).find(
      (m) => m?.role === 'assistant' && state.messages.statusByMessageId[m.id] === 'failed',
    );
    expect(failed).toBeDefined();
    expect(failed?.content).toBe('网络中断');
  });
});

describe('会话切换与删除', () => {
  it('switchSession 在无缓存消息时拉取消息', async () => {
    fetchSessionMessages.mockResolvedValue({ messages: [], cursor: null });
    const store = createStore();
    await store.dispatch(switchSession('s2'));
    expect(store.getState().sessions.currentSessionId).toBe('s2');
    expect(fetchSessionMessages).toHaveBeenCalledWith('s2', expect.anything());
  });

  it('deleteCurrentSession 删除后从 state 移除会话', async () => {
    deleteSession.mockResolvedValue({});
    const store = createStore();
    store.dispatch(upsertSession({ id: 's1', title: '会话', createdAt: now, updatedAt: now }));
    store.dispatch(setCurrentSessionId('s1'));
    await store.dispatch(deleteCurrentSession('s1'));
    expect(deleteSession).toHaveBeenCalledWith('s1');
    expect(store.getState().sessions.entities.s1).toBeUndefined();
  });
});

describe('ensureSessionForUploadedFiles', () => {
  it('无当前会话时创建新会话并挂载文件', async () => {
    createSession.mockResolvedValue({ id: 's-new', title: '文件会话', createdAt: now, updatedAt: now });
    const store = createStore();
    const sessionId = await store.dispatch(ensureSessionForUploadedFiles(['f1'], '报告.pdf'));
    expect(createSession).toHaveBeenCalledWith(expect.objectContaining({ fileIds: ['f1'] }));
    expect(sessionId).toBe('s-new');
    expect(store.getState().sessions.currentSessionId).toBe('s-new');
  });

  it('已有会话时挂载文件到当前会话', async () => {
    attachFilesToSession.mockResolvedValue({ attachedFileIds: ['f1'] });
    const store = createStore();
    store.dispatch(setCurrentSessionId('s1'));
    const sessionId = await store.dispatch(ensureSessionForUploadedFiles(['f1']));
    expect(attachFilesToSession).toHaveBeenCalledWith('s1', ['f1']);
    expect(sessionId).toBe('s1');
  });

  it('空文件列表直接返回 undefined', async () => {
    const store = createStore();
    const result = await store.dispatch(ensureSessionForUploadedFiles([]));
    expect(result).toBeUndefined();
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe('subscribeToSessionEvents', () => {
  it('实时事件驱动会话与消息状态更新', () => {
    let captured: Record<string, (p: unknown) => void> = {};
    subscribeSessionEvents.mockImplementation((handlers: Record<string, (p: unknown) => void>) => {
      captured = handlers;
      return () => {};
    });
    fetchSessions.mockResolvedValue({ sessions: [], cursor: null });

    const store = createStore();
    store.dispatch(subscribeToSessionEvents());

    captured.onSessionCreated?.({ sessionId: 's1', title: '会话', createdAt: now, updatedAt: now });
    expect(store.getState().sessions.entities.s1?.title).toBe('会话');

    store.dispatch(setCurrentSessionId('s1'));
    store.dispatch(upsertSession({ id: 's1', title: '会话', createdAt: now, updatedAt: now }));
    captured.onMessageCompleted?.({ sessionId: 's1', messageId: 'm1', status: 'done', updatedAt: now });
    expect(store.getState().messages.statusByMessageId.m1).toBe('done');
  });
});
