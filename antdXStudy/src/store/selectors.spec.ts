import { configureStore } from '@reduxjs/toolkit';
import { describe, expect, it } from 'vitest';
import { contentReducer, setInput, addAttachment } from './contentStore';
import { messageReducer, appendMessage, applyStreamEvent } from './messageStore';
import { sessionReducer, setCurrentSessionId, upsertSession } from './sessionStore';
import { fileReducer } from './fileStore';
import {
  selectBubbleItems,
  selectCanSend,
  selectCurrentMessages,
  selectSessions,
} from './selectors';
import type { RootState } from './index';
import { STREAM_PROTOCOL_V2 } from '@/service/stream-protocol';

function createTestStore() {
  return configureStore({
    reducer: {
      sessions: sessionReducer,
      messages: messageReducer,
      content: contentReducer,
      files: fileReducer,
    },
  });
}

function createState() {
  return createTestStore().getState() as RootState;
}

describe('selectors', () => {
  it('selectSessions 按更新时间倒序返回会话', () => {
    const store = createTestStore();
    store.dispatch(upsertSession({
      id: 'session-old',
      title: '旧会话',
      createdAt: '2026-06-05T00:00:00.000Z',
      updatedAt: '2026-06-05T00:00:00.000Z',
    }));
    store.dispatch(upsertSession({
      id: 'session-new',
      title: '新会话',
      createdAt: '2026-06-06T00:00:00.000Z',
      updatedAt: '2026-06-06T00:00:00.000Z',
    }));

    expect(selectSessions(store.getState() as RootState).map((session) => session.id)).toEqual([
      'session-new',
      'session-old',
    ]);
  });

  it('selectCurrentMessages 只返回当前会话消息', () => {
    const store = createTestStore();
    store.dispatch(setCurrentSessionId('session-1'));
    store.dispatch(appendMessage({
      message: {
        id: 'message-1',
        sessionId: 'session-1',
        role: 'user',
        content: '当前会话',
        metadata: null,
        createdAt: '2026-06-06T00:00:00.000Z',
      },
    }));
    store.dispatch(appendMessage({
      message: {
        id: 'message-2',
        sessionId: 'session-2',
        role: 'user',
        content: '其他会话',
        metadata: null,
        createdAt: '2026-06-06T00:00:01.000Z',
      },
    }));

    expect(selectCurrentMessages(store.getState() as RootState).map((message) => message.id)).toEqual([
      'message-1',
    ]);
  });

  it('selectBubbleItems 在空流式 assistant 消息上显示 loading', () => {
    const store = createTestStore();
    store.dispatch(setCurrentSessionId('session-1'));
    store.dispatch(appendMessage({
      message: {
        id: 'assistant-1',
        sessionId: 'session-1',
        role: 'assistant',
        content: '',
        parts: [],
        metadata: null,
        createdAt: '2026-06-06T00:00:00.000Z',
      },
      status: 'streaming',
    }));

    expect(selectBubbleItems(store.getState() as RootState)[0]).toMatchObject({
      key: 'assistant-1',
      role: 'assistant',
      loading: true,
    });
  });

  it('selectCanSend 拦截空输入、上传中附件和流式中消息', () => {
    const emptyState = createState();
    expect(selectCanSend(emptyState)).toBe(false);

    const readyStore = createTestStore();
    readyStore.dispatch(setInput('你好'));
    expect(selectCanSend(readyStore.getState() as RootState)).toBe(true);

    const uploadingStore = createTestStore();
    uploadingStore.dispatch(setInput('你好'));
    uploadingStore.dispatch(addAttachment({
      id: 'file-1',
      name: '上传中.txt',
      type: 'text/plain',
      size: 10,
      status: 'uploading',
    }));
    expect(selectCanSend(uploadingStore.getState() as RootState)).toBe(false);

    const streamingStore = createTestStore();
    streamingStore.dispatch(setInput('你好'));
    streamingStore.dispatch(applyStreamEvent({
      protocol: STREAM_PROTOCOL_V2,
      id: 'event-1',
      type: 'message.part.started',
      traceId: 'trace-1',
      requestId: 'request-1',
      sessionId: 'session-1',
      messageId: 'assistant-1',
      timestamp: '2026-06-06T00:00:00.000Z',
      sequence: 1,
      data: {
        part: {
          id: 'part-1',
          type: 'text',
          text: '',
          status: 'streaming',
        },
      },
    }));
    expect(selectCanSend(streamingStore.getState() as RootState)).toBe(false);
  });
});
