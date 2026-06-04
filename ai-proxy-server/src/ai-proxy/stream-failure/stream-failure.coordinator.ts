import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { sanitizeStreamError } from '../errors/stream-error.util';
import { STREAM_FAILURE_SINK, StreamFailureSink } from './stream-failure.sink';
import {
  StreamFailureContext,
  StreamFailureDispatchOptions,
  StreamFailureDispatchPayload,
} from './stream-failure.types';

@Injectable()
export class StreamFailureCoordinator {
  private readonly logger = new Logger(StreamFailureCoordinator.name);

  constructor(
    @Optional()
    @Inject(STREAM_FAILURE_SINK)
    private readonly sinks: StreamFailureSink[] = [],
  ) {}

  async dispatch(
    ctx: StreamFailureContext,
    error: unknown,
    options: StreamFailureDispatchOptions,
  ): Promise<void> {
    const payload: StreamFailureDispatchPayload = {
      ctx,
      error,
      options,
      sanitized: sanitizeStreamError(error),
    };

    for (const sink of this.sinks) {
      if (sink.supports && !sink.supports(payload)) {
        continue;
      }

      try {
        await sink.handle(payload);
      } catch (err) {
        this.logger.warn(
          `StreamFailureSink "${sink.name}" 执行失败，继续后续 Sink: session=${ctx.sessionId}`,
          err instanceof Error ? err.message : err,
        );
      }
    }
  }
}
