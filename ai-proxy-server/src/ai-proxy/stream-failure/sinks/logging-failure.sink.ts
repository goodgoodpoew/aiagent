import { Injectable, Logger } from '@nestjs/common';
import { StreamFailureSink } from '../stream-failure.sink';
import type { StreamFailureDispatchPayload } from '../stream-failure.types';

@Injectable()
export class LoggingFailureSink implements StreamFailureSink {
  readonly name = 'logging';
  private readonly logger = new Logger(LoggingFailureSink.name);

  handle(payload: StreamFailureDispatchPayload): void {
    const { ctx, sanitized } = payload;
    this.logger.error(
      `LLM 请求失败: session=${ctx.sessionId}, message=${ctx.assistantMessageId}, code=${sanitized.code}`,
      sanitized.logDetail,
    );
  }
}
