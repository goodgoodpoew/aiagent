import * as request from 'supertest';
import type {
  AgentRuntimeEvent,
  AgentRuntimeInput,
} from '../../src/agent-runtime/agent-runtime.types';
import {
  AGENT_ENGINE,
  type AgentEnginePort,
} from '../../src/agent-runtime/ports/agent-engine.port';
import type { StreamEventEnvelope } from '../../src/streaming/protocol/stream-event.types';
import {
  closeIntegrationApp,
  createIntegrationApp,
  resetIntegrationState,
  type IntegrationAppContext,
} from '../helpers/create-integration-app';
import { parseSseEvents } from '../helpers/sse-reader';

function parseTextStream(
  res: NodeJS.ReadableStream,
  callback: (error: Error | null, body: string) => void,
) {
  let raw = '';
  res.setEncoding('utf8');
  res.on('data', (chunk: string) => {
    raw += chunk;
  });
  res.on('end', () => callback(null, raw));
  res.on('error', (error) => callback(error, raw));
}

const parseSseResponse = parseTextStream as unknown as (
  res: unknown,
  callback: (error: Error | null, body: string) => void,
) => void;

function createStreamRequest(requestId: string) {
  return {
    protocol: 'aiagent.stream.v2',
    requestId,
    clientMessageId: `client_${requestId}`,
    input: {
      role: 'user',
      parts: [{ type: 'text', text: '测试流式请求' }],
    },
  };
}

describe('POST /api/ai/chat/stream/v2 e2e', () => {
  let context: IntegrationAppContext;
  let engineEvents: AgentRuntimeEvent[] = [];
  const capturedInputs: AgentRuntimeInput[] = [];

  const fakeEngine: AgentEnginePort = {
    async *run(input: AgentRuntimeInput) {
      capturedInputs.push(input);
      for (const event of engineEvents) {
        yield event;
      }
    },
  };

  beforeAll(async () => {
    context = await createIntegrationApp({
      overrides: [{ provide: AGENT_ENGINE, useValue: fakeEngine }],
    });
  });

  beforeEach(async () => {
    engineEvents = [];
    capturedInputs.length = 0;
    await resetIntegrationState(context);
  });

  afterAll(async () => {
    await closeIntegrationApp(context);
  });

  it('streams started, delta and completed events with request diagnostics', async () => {
    engineEvents = [
      { kind: 'sse', type: 'stream.started', data: { createdAt: '2026-06-06T00:00:00.000Z' } },
      {
        kind: 'sse',
        type: 'message.part.delta',
        data: { partId: 'text_1', type: 'text', delta: '你好' },
        scope: { sessionId: 'session_1', messageId: 'message_1' },
      },
      { kind: 'sse', type: 'stream.completed', data: { finishReason: 'stop' } },
    ];

    const response = await request(context.app.getHttpServer())
      .post('/api/ai/chat/stream/v2')
      .set('x-user-id', 'user_e2e')
      .send(createStreamRequest('req_success'))
      .buffer(true)
      .parse(parseSseResponse);

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);
    expect(response.headers['content-type']).toContain('text/event-stream');

    const events = parseSseEvents<StreamEventEnvelope>(String(response.body));
    expect(events.map((event) => event.event)).toEqual([
      'stream.started',
      'message.part.delta',
      'stream.completed',
    ]);
    expect(events.map((event) => event.data?.sequence)).toEqual([1, 2, 3]);
    expect(events.every((event) => event.data?.requestId === 'req_success')).toBe(true);
    expect(events[1].data).toMatchObject({
      type: 'message.part.delta',
      sessionId: 'session_1',
      messageId: 'message_1',
      data: { partId: 'text_1', delta: '你好' },
    });
    expect(capturedInputs[0]).toMatchObject({
      userId: 'user_e2e',
      requestId: 'req_success',
    });
  });

  it('streams failed events and ends the response', async () => {
    engineEvents = [
      {
        kind: 'sse',
        type: 'stream.failed',
        data: {
          code: 'UPSTREAM_HTTP_500',
          message: '上游服务异常',
          retryable: true,
          stage: 'provider_stream',
        },
      },
    ];

    const response = await request(context.app.getHttpServer())
      .post('/api/ai/chat/stream/v2')
      .set('x-user-id', 'user_e2e')
      .send(createStreamRequest('req_failed'))
      .buffer(true)
      .parse(parseSseResponse);

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);

    const events = parseSseEvents<StreamEventEnvelope>(String(response.body));
    expect(events.map((event) => event.event)).toEqual(['stream.failed']);
    expect(events[0].data).toMatchObject({
      requestId: 'req_failed',
      sequence: 1,
      type: 'stream.failed',
      data: {
        code: 'UPSTREAM_HTTP_500',
        message: '上游服务异常',
        retryable: true,
        stage: 'provider_stream',
      },
    });
  });

  it('ends interrupted streams without writing completed events', async () => {
    engineEvents = [
      { kind: 'sse', type: 'stream.started', data: { createdAt: '2026-06-06T00:00:00.000Z' } },
      { kind: 'end' },
      { kind: 'sse', type: 'stream.completed', data: { finishReason: 'stop' } },
    ];

    const response = await request(context.app.getHttpServer())
      .post('/api/ai/chat/stream/v2')
      .set('x-user-id', 'user_e2e')
      .send(createStreamRequest('req_interrupted'))
      .buffer(true)
      .parse(parseSseResponse);

    expect(response.status).toBeGreaterThanOrEqual(200);
    expect(response.status).toBeLessThan(300);

    const events = parseSseEvents<StreamEventEnvelope>(String(response.body));
    expect(events.map((event) => event.event)).toEqual(['stream.started']);
    expect(events[0].data).toMatchObject({
      requestId: 'req_interrupted',
      sequence: 1,
      type: 'stream.started',
    });
  });

  it('rejects requests without token or enabled header fallback identity', async () => {
    const previous = process.env.AUTH_ALLOW_HEADER_USER_ID;
    process.env.AUTH_ALLOW_HEADER_USER_ID = 'false';
    const strictContext = await createIntegrationApp({
      overrides: [{ provide: AGENT_ENGINE, useValue: fakeEngine }],
    });

    try {
      const response = await request(strictContext.app.getHttpServer())
        .post('/api/ai/chat/stream/v2')
        .send(createStreamRequest('req_unauthorized'));

      expect(response.status).toBe(401);
    } finally {
      await closeIntegrationApp(strictContext);
      if (previous === undefined) {
        delete process.env.AUTH_ALLOW_HEADER_USER_ID;
      } else {
        process.env.AUTH_ALLOW_HEADER_USER_ID = previous;
      }
    }
  });
});
