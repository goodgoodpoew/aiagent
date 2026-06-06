import { Readable } from 'stream';
import type { IncomingMessage } from 'http';
import { OpenAiCompatibleStreamAdapter } from './openai-compatible-stream.adapter';
import type { ProviderStreamEvent } from './provider-stream-adapter.interface';
import {
  openAiDoneChunk,
  openAiFinishChunk,
  openAiTextDeltaChunk,
} from '../../../test/fixtures/stream.fixture';

function upstreamFrom(chunks: string[]): IncomingMessage {
  return Readable.from(chunks) as unknown as IncomingMessage;
}

async function collect(upstreamChunks: string[]) {
  const adapter = new OpenAiCompatibleStreamAdapter();
  const events: ProviderStreamEvent[] = [];
  for await (const event of adapter.read(upstreamFrom(upstreamChunks))) {
    events.push(event);
  }
  return events;
}

describe('OpenAiCompatibleStreamAdapter', () => {
  it('normalizes text delta and done events', async () => {
    const events = await collect([
      `data: ${openAiTextDeltaChunk('你')}\n\n`,
      `data: ${openAiTextDeltaChunk('好')}\n\n`,
      `data: ${openAiDoneChunk}\n\n`,
    ]);

    expect(events).toEqual([
      { type: 'text.delta', delta: '你' },
      { type: 'text.delta', delta: '好' },
      { type: 'done' },
    ]);
  });

  it('emits done once when provider sends finish_reason', async () => {
    const events = await collect([
      `data: ${openAiTextDeltaChunk('完成')}\n\n`,
      `data: ${openAiFinishChunk}\n\n`,
    ]);

    expect(events).toEqual([
      { type: 'text.delta', delta: '完成' },
      { type: 'done', finishReason: 'stop' },
    ]);
  });

  it('skips invalid chunks and closes with a synthetic done event', async () => {
    const events = await collect([
      'data: {"choices": [}\n\n',
      `data: ${openAiTextDeltaChunk('恢复')}\n\n`,
    ]);

    expect(events).toEqual([{ type: 'text.delta', delta: '恢复' }, { type: 'done' }]);
  });
});
