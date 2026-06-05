import { Injectable } from '@nestjs/common';
import { StreamCompletionService } from '../../stream-completion.service';
import { StreamFailureSink } from '../stream-failure.sink';
import type { StreamFailureDispatchPayload } from '../stream-failure.types';

@Injectable()
export class PersistenceFailureSink implements StreamFailureSink {
  readonly name = 'persistence';

  constructor(private readonly streamCompletion: StreamCompletionService) {}

  supports(payload: StreamFailureDispatchPayload): boolean {
    if (payload.options.persist === false) return false;
    return Boolean(payload.ctx.sessionId && payload.ctx.assistantMessageId);
  }

  handle(payload: StreamFailureDispatchPayload): void {
    const { ctx, sanitized } = payload;
    this.streamCompletion.handleStreamFailure({
      sessionId: ctx.sessionId!,
      messageId: ctx.assistantMessageId!,
      sanitized,
      userId: ctx.userId,
      platform: ctx.platform,
      model: ctx.model,
    });
  }
}
