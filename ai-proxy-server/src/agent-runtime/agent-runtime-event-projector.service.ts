import { Injectable } from '@nestjs/common';
import type { StreamEventWriter } from '@/streaming/protocol/stream-event-writer';
import type { AgentRuntimeEvent } from './agent-runtime.types';

@Injectable()
export class AgentRuntimeEventProjector {
  project(event: AgentRuntimeEvent, params: {
    res: { setHeader(name: string, value: string): void; end(): void; writableEnded: boolean };
    writer: StreamEventWriter;
  }): void {
    if (event.kind === 'header') {
      params.res.setHeader(event.name, event.value);
      return;
    }

    if (event.kind === 'sse') {
      params.writer.write(event.type, event.data, event.scope);
      return;
    }

    if (!params.res.writableEnded) {
      params.res.end();
    }
  }
}
