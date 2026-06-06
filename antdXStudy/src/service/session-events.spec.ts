import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { subscribeSessionEvents } from './session-events';

function streamResponse(chunks: string[], init?: ResponseInit) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(body, { status: 200, ...init });
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

let unsubscribe: (() => void) | undefined;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  vi.unstubAllGlobals();
});

describe('subscribeSessionEvents', () => {
  it('解析 session.created / title.updated / message.completed 并保存 lastEventId', async () => {
    const eventsBody = [
      `event: session.created\ndata: ${JSON.stringify({ sessionId: 's1', createdAt: 'now', updatedAt: 'now' })}\n\n`,
      `event: session.title.updated\nid: evt-9\ndata: ${JSON.stringify({ sessionId: 's1', title: '标题', updatedAt: 'now' })}\n\n`,
      `event: message.completed\ndata: ${JSON.stringify({ sessionId: 's1', messageId: 'm1', status: 'done', updatedAt: 'now' })}\n\n`,
      `event: something.unknown\ndata: ${JSON.stringify({ foo: 'bar' })}\n\n`,
    ].join('');

    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/sessions/events')) return Promise.resolve(streamResponse([eventsBody]));
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const onSessionCreated = vi.fn();
    const onTitleUpdated = vi.fn();
    const onMessageCompleted = vi.fn();
    const onUnknownEvent = vi.fn();

    unsubscribe = subscribeSessionEvents({
      onSessionCreated,
      onTitleUpdated,
      onMessageCompleted,
      onUnknownEvent,
    });

    await flush();
    await flush();

    expect(onSessionCreated).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 's1' }));
    expect(onTitleUpdated).toHaveBeenCalledWith(expect.objectContaining({ title: '标题' }));
    expect(onMessageCompleted).toHaveBeenCalledWith(expect.objectContaining({ messageId: 'm1' }));
    expect(onUnknownEvent).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('sessionEvents.lastEventId')).toBe('evt-9');
  });

  it('携带 Last-Event-ID 请求头进行断点续传', async () => {
    localStorage.setItem('sessionEvents.lastEventId', 'evt-prev');
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/sessions/events')) return Promise.resolve(streamResponse([]));
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    unsubscribe = subscribeSessionEvents({ onTitleUpdated: vi.fn() });
    await flush();

    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>)['Last-Event-ID']).toBe('evt-prev');
  });

  it('连接失败时回调 onError', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('/sessions/events')) return Promise.resolve(new Response(null, { status: 500 }));
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    const onError = vi.fn();
    unsubscribe = subscribeSessionEvents({ onTitleUpdated: vi.fn(), onError });

    await flush();
    await flush();

    expect(onError).toHaveBeenCalledTimes(1);
  });
});
