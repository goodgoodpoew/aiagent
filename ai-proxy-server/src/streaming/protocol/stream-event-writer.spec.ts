import { createStreamEventWriter } from './stream-event-writer';
import { STREAM_PROTOCOL_V2 } from './stream-event.types';

function createMockResponse() {
  const chunks: string[] = [];
  return {
    chunks,
    writableEnded: false,
    write: jest.fn((chunk: string) => {
      chunks.push(chunk);
      return true;
    }),
  };
}

describe('StreamEventWriter', () => {
  it('writes stable SSE envelopes with sequence numbers', () => {
    const res = createMockResponse();
    const writer = createStreamEventWriter(res as any, {
      requestId: 'req_1',
      traceId: 'trace_1',
    });

    const first = writer.write('stream.started', { createdAt: '2026-06-06T00:00:00.000Z' });
    const second = writer.write(
      'stream.completed',
      { finishReason: 'stop' },
      {
        sessionId: 'session_1',
        messageId: 'message_1',
      },
    );

    expect(first).toMatchObject({
      protocol: STREAM_PROTOCOL_V2,
      type: 'stream.started',
      requestId: 'req_1',
      traceId: 'trace_1',
      sequence: 1,
    });
    expect(second).toMatchObject({
      type: 'stream.completed',
      sequence: 2,
      sessionId: 'session_1',
      messageId: 'message_1',
    });
    expect(res.chunks.join('')).toContain('event: stream.started');
    expect(res.chunks.join('')).toContain('event: stream.completed');
  });

  it('does not write after the response has ended', () => {
    const res = createMockResponse();
    res.writableEnded = true;
    const writer = createStreamEventWriter(res as any, {
      requestId: 'req_1',
      traceId: 'trace_1',
    });

    expect(writer.write('stream.completed', {})).toBeUndefined();
    expect(res.write).not.toHaveBeenCalled();
  });
});
