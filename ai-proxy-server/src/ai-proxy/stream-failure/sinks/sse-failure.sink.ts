import { Injectable } from '@nestjs/common';
import { writeClientStreamError } from '../../utils/sse-transform.util';
import { StreamFailureSink } from '../stream-failure.sink';
import type { StreamFailureDispatchPayload } from '../stream-failure.types';

@Injectable()
export class SseFailureSink implements StreamFailureSink {
  readonly name = 'sse';

  supports(payload: StreamFailureDispatchPayload): boolean {
    return payload.options.writeSse === true && payload.options.res != null;
  }

  handle(payload: StreamFailureDispatchPayload): void {
    const { ctx, options, sanitized } = payload;
    const res = options.res!;
    if (res.writableEnded) {
      return;
    }
    writeClientStreamError(res, ctx.sessionId, sanitized.userMessage, sanitized.code);
  }
}
