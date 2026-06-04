import { AxiosError } from 'axios';
import { StreamErrorCode, sanitizeStreamError } from './stream-error.util';
import { toLlmMessages, isFailedMessage } from '../../message/message-filter.util';

function createAxiosError(status?: number, code?: string, message = 'Request failed'): AxiosError {
  const error = new AxiosError(message, code);
  if (status != null) {
    error.response = {
      status,
      statusText: String(status),
      headers: {},
      config: {} as AxiosError['config'],
      data: { error: 'upstream' },
    };
  }
  return error;
}

describe('sanitizeStreamError', () => {
  it('maps config errors', () => {
    const result = sanitizeStreamError(new Error('API key not configured for platform: openai'));
    expect(result.code).toBe(StreamErrorCode.CONFIG_ERROR);
    expect(result.userMessage).toContain('未配置');
  });

  it('maps upstream 401 to 4xx', () => {
    const result = sanitizeStreamError(createAxiosError(401));
    expect(result.code).toBe(StreamErrorCode.UPSTREAM_HTTP_4XX);
  });

  it('maps upstream 429 to 4xx', () => {
    const result = sanitizeStreamError(createAxiosError(429));
    expect(result.code).toBe(StreamErrorCode.UPSTREAM_HTTP_4XX);
  });

  it('maps upstream 500 to 5xx', () => {
    const result = sanitizeStreamError(createAxiosError(500));
    expect(result.code).toBe(StreamErrorCode.UPSTREAM_HTTP_5XX);
  });

  it('maps network errors', () => {
    const result = sanitizeStreamError(createAxiosError(undefined, 'ECONNREFUSED'));
    expect(result.code).toBe(StreamErrorCode.UPSTREAM_NETWORK);
  });
});

describe('message filter', () => {
  it('filters failed messages for LLM context', () => {
    const messages = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'failed', metadata: { status: 'failed' } },
      { role: 'assistant', content: 'ok' },
    ];
    expect(toLlmMessages(messages)).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'ok' },
    ]);
    expect(isFailedMessage({ status: 'failed' })).toBe(true);
    expect(isFailedMessage(null)).toBe(false);
  });
});
