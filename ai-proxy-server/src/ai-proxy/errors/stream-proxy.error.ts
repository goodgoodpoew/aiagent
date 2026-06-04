import { SanitizedStreamError } from './stream-error.util';

/**
 * 代理层统一异常，携带已脱敏的错误信息
 */
export class StreamProxyError extends Error {
  readonly sanitized: SanitizedStreamError;

  constructor(sanitized: SanitizedStreamError) {
    super(sanitized.logDetail);
    this.name = 'StreamProxyError';
    this.sanitized = sanitized;
  }
}
