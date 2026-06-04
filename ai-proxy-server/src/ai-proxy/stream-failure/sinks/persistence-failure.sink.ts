import { Injectable } from '@nestjs/common';
import { StreamCompletionService } from '../../stream-completion.service';
import { StreamFailureSink } from '../stream-failure.sink';
import type { StreamFailureDispatchPayload } from '../stream-failure.types';

@Injectable()
export class PersistenceFailureSink implements StreamFailureSink {
  readonly name = 'persistence';

  constructor(private readonly streamCompletion: StreamCompletionService) {}

  handle(payload: StreamFailureDispatchPayload): void {
    const { ctx, sanitized } = payload;
    this.streamCompletion.handleStreamFailure({
      sessionId: ctx.sessionId,
      messageId: ctx.assistantMessageId,
      sanitized,
      userId: ctx.userId,
      platform: ctx.platform,
      model: ctx.model,
    });
  }
}
