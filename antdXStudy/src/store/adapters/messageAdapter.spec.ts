import { describe, expect, it, vi } from 'vitest';
import {
  getMessageTextProjection,
  normalizeMessage,
  normalizeMessageList,
  normalizeStreamMessage,
} from './messageAdapter';

describe('messageAdapter', () => {
  it('旧消息没有 parts 时补齐 text part', () => {
    const message = normalizeMessage({
      id: 'message-1',
      sessionId: 'session-1',
      role: 'unknown',
      content: '旧消息正文',
      metadata: null,
      createdAt: '2026-06-06T00:00:00.000Z',
    });

    expect(message.role).toBe('assistant');
    expect(message.parts).toEqual([
      {
        id: 'message-1:text:0',
        type: 'text',
        text: '旧消息正文',
        status: 'done',
      },
    ]);
  });

  it('优先读取 metadata.parts 和运行状态', () => {
    const message = normalizeMessage({
      id: 'message-2',
      sessionId: 'session-1',
      role: 'assistant',
      content: '',
      metadata: {
        status: 'streaming',
        parts: [
          { id: 'part-1', type: 'text', text: '流式内容', status: 'streaming' },
        ],
      },
    });

    expect(message.status).toBe('streaming');
    expect(getMessageTextProjection(message)).toBe('流式内容');
  });

  it('normalizeMessageList 兼容空列表和 cursor', () => {
    expect(normalizeMessageList({ cursor: 'next' })).toEqual({
      messages: [],
      cursor: 'next',
      hasMore: true,
    });
  });

  it('流式消息不合成额外 text part，避免扰乱 part 顺序', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-06T00:00:00.000Z'));

    const message = normalizeStreamMessage(
      {
        id: 'assistant-1',
        role: 'assistant',
        content: '',
        parts: [],
        status: 'streaming',
      },
      'session-1',
    );

    expect(message.parts).toEqual([]);
    expect(message.status).toBe('streaming');
    expect(message.createdAt).toBe('2026-06-06T00:00:00.000Z');
    vi.useRealTimers();
  });
});
