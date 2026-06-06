import type { Response } from 'express';
import { AgentRuntimeEventProjector } from '../../agent-runtime/agent-runtime-event-projector.service';
import type { AgentEnginePort } from '../../agent-runtime/ports/agent-engine.port';
import type { AgentRuntimeEvent } from '../../agent-runtime/agent-runtime.types';
import { createStreamEventWriter } from '../protocol/stream-event-writer';
import { StreamOrchestratorService } from './stream-orchestrator.service';

function createMockResponse() {
  const headers = new Map<string, string>();
  const chunks: string[] = [];
  const res = {
    writableEnded: false,
    setHeader: jest.fn((name: string, value: string) => {
      headers.set(name, value);
    }),
    write: jest.fn((chunk: string) => {
      chunks.push(chunk);
      return true;
    }),
    end: jest.fn(() => {
      res.writableEnded = true;
    }),
    headers,
    chunks,
  };
  return res;
}

function createEngine(events: AgentRuntimeEvent[]): AgentEnginePort {
  return {
    async *run() {
      for (const event of events) {
        yield event;
      }
    },
  };
}

describe('StreamOrchestratorService', () => {
  it('writes the v2 SSE success sequence and ends the response', async () => {
    const res = createMockResponse();
    const service = new StreamOrchestratorService(
      createEngine([
        { kind: 'sse', type: 'stream.started', data: { createdAt: 'now' } },
        {
          kind: 'sse',
          type: 'message.part.delta',
          data: { partId: 'part_1', type: 'text', delta: '你好' },
          scope: { sessionId: 'session_1', messageId: 'message_1' },
        },
        { kind: 'sse', type: 'stream.completed', data: { finishReason: 'stop' } },
      ]),
      new AgentRuntimeEventProjector(),
      createStreamEventWriter,
    );

    await service.streamChat(
      {
        protocol: 'aiagent.stream.v2',
        requestId: 'req_1',
        clientMessageId: 'client_1',
        input: { role: 'user', parts: [{ type: 'text', text: '你好' }] },
      },
      'user_1',
      res as unknown as Response,
    );

    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.chunks.join('')).toContain('event: stream.started');
    expect(res.chunks.join('')).toContain('event: message.part.delta');
    expect(res.chunks.join('')).toContain('event: stream.completed');
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it('passes stream.failed events through with request diagnostics', async () => {
    const res = createMockResponse();
    const service = new StreamOrchestratorService(
      createEngine([
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
      ]),
      new AgentRuntimeEventProjector(),
      createStreamEventWriter,
    );

    await service.streamChat(
      {
        protocol: 'aiagent.stream.v2',
        requestId: 'req_failed',
        clientMessageId: 'client_1',
        input: { role: 'user', parts: [{ type: 'text', text: '失败用例' }] },
      },
      'user_1',
      res as unknown as Response,
    );

    const raw = res.chunks.join('');
    expect(raw).toContain('event: stream.failed');
    expect(raw).toContain('req_failed');
    expect(raw).toContain('UPSTREAM_HTTP_500');
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  it('ends immediately when the agent emits an interrupt/end event', async () => {
    const res = createMockResponse();
    const service = new StreamOrchestratorService(
      createEngine([
        { kind: 'sse', type: 'stream.started', data: { createdAt: 'now' } },
        { kind: 'end' },
        { kind: 'sse', type: 'stream.completed', data: {} },
      ]),
      new AgentRuntimeEventProjector(),
      createStreamEventWriter,
    );

    await service.streamChat(
      {
        protocol: 'aiagent.stream.v2',
        requestId: 'req_interrupted',
        clientMessageId: 'client_1',
        input: { role: 'user', parts: [{ type: 'text', text: '中断' }] },
      },
      'user_1',
      res as unknown as Response,
    );

    expect(res.chunks.join('')).toContain('event: stream.started');
    expect(res.chunks.join('')).not.toContain('event: stream.completed');
    expect(res.end).toHaveBeenCalledTimes(1);
  });
});
