import { afterEach, describe, expect, it, vi } from 'vitest';
import { STREAM_PROTOCOL_V2, type StreamEventEnvelope } from './stream-protocol';
import { parseSseEvent, sendChatStreamV2 } from './chat-stream-v2';

function streamFromChunks(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
}

function createEvent(overrides?: Partial<StreamEventEnvelope>): StreamEventEnvelope {
  return {
    protocol: STREAM_PROTOCOL_V2,
    id: 'event-1',
    type: 'stream.started',
    traceId: 'trace-1',
    requestId: 'request-1',
    sessionId: 'session-1',
    timestamp: '2026-06-06T00:00:00.000Z',
    sequence: 1,
    data: { createdAt: '2026-06-06T00:00:00.000Z' },
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('parseSseEvent', () => {
  it('解析多行 data 并保留换行', () => {
    expect(parseSseEvent('event: message\ndata: 第一行\ndata: 第二行')).toEqual({
      event: 'message',
      data: '第一行\n第二行',
    });
  });

  it('忽略空事件', () => {
    expect(parseSseEvent(': ping')).toBeUndefined();
  });
});

describe('sendChatStreamV2', () => {
  it('逐段解析 SSE，并忽略 DONE 与非 v2 协议事件', async () => {
    const v2Event = createEvent();
    const legacyEvent = { ...v2Event, protocol: 'legacy.stream.v1' };
    const onEvent = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        streamFromChunks([
          `event: message\ndata: ${JSON.stringify(v2Event)}\n`,
          `\nevent: message\ndata: ${JSON.stringify(legacyEvent)}\n\n`,
          'data: [DONE]\n\n',
        ]),
        { status: 200 },
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    await sendChatStreamV2(
      {
        protocol: STREAM_PROTOCOL_V2,
        requestId: 'request-1',
        clientMessageId: 'client-message-1',
        input: { role: 'user', parts: [{ type: 'text', text: '你好' }] },
      },
      { onEvent },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/ai/chat/stream/v2',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-User-Id': expect.any(String),
        }),
      }),
    );
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(v2Event);
  });

  it('HTTP 错误时抛出明确状态码', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })));

    await expect(
      sendChatStreamV2(
        {
          protocol: STREAM_PROTOCOL_V2,
          requestId: 'request-1',
          clientMessageId: 'client-message-1',
          input: { role: 'user', parts: [{ type: 'text', text: '失败测试' }] },
        },
        { onEvent: vi.fn() },
      ),
    ).rejects.toThrow('请求失败：500');
  });
});
