import { Injectable } from '@nestjs/common';
import { StreamErrorCode } from '../../errors/stream-error.util';
import { StreamFailureSink } from '../stream-failure.sink';
import type { StreamFailureDispatchPayload } from '../stream-failure.types';

@Injectable()
export class SseFailureSink implements StreamFailureSink {
  readonly name = 'sse';

  supports(payload: StreamFailureDispatchPayload): boolean {
    if (payload.options.writeSse !== true) return false;
    return Boolean(payload.options.writer);
  }

  handle(payload: StreamFailureDispatchPayload): void {
    const { ctx, options, sanitized } = payload;
    const retryable = ![
      StreamErrorCode.CONFIG_ERROR,
      StreamErrorCode.UPSTREAM_HTTP_4XX,
    ].includes(sanitized.code);

    options.writer?.write(
      'stream.failed',
      {
        code: sanitized.code,
        message: sanitized.userMessage,
        retryable,
        stage: options.stage ?? 'unknown',
      },
      {
        sessionId: ctx.sessionId,
        messageId: ctx.assistantMessageId,
      },
    );
  }
}
