import { AxiosError } from 'axios';

export enum StreamErrorCode {
  CONFIG_ERROR = 'CONFIG_ERROR',
  UPSTREAM_HTTP_4XX = 'UPSTREAM_HTTP_4XX',
  UPSTREAM_HTTP_5XX = 'UPSTREAM_HTTP_5XX',
  UPSTREAM_NETWORK = 'UPSTREAM_NETWORK',
  STREAM_INTERRUPTED = 'STREAM_INTERRUPTED',
  UNKNOWN = 'UNKNOWN',
}

export const FAILED_ASSISTANT_CONTENT = '抱歉，回复生成失败，请重试。';

const USER_MESSAGES: Record<StreamErrorCode, string> = {
  [StreamErrorCode.CONFIG_ERROR]: '服务未配置，请联系管理员',
  [StreamErrorCode.UPSTREAM_HTTP_4XX]: '模型服务拒绝请求，请稍后重试',
  [StreamErrorCode.UPSTREAM_HTTP_5XX]: '模型服务暂时不可用',
  [StreamErrorCode.UPSTREAM_NETWORK]: '无法连接模型服务',
  [StreamErrorCode.STREAM_INTERRUPTED]: '回复生成中断，请重试',
  [StreamErrorCode.UNKNOWN]: '生成失败，请重试',
};

const METADATA_ERROR_MAX_LEN = 200;

export interface SanitizedStreamError {
  code: StreamErrorCode;
  userMessage: string;
  logDetail: string;
}

export interface FailedMessageMetadata {
  status: 'failed';
  code: string;
  error: string;
  platform: string;
  model: string;
  failedAt: string;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '…';
}

function formatAxiosData(data: unknown): string {
  if (data == null) return '';
  if (typeof data === 'string') return truncate(data, 500);
  try {
    return truncate(JSON.stringify(data), 500);
  } catch {
    return '[unserializable response]';
  }
}

function mapConfigError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes('api key not configured') ||
    lower.includes('custombaseurl') ||
    lower.includes('customapikey') ||
    lower.includes('is required for custom platform')
  );
}

function mapNetworkError(error: AxiosError): boolean {
  const code = error.code;
  if (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNABORTED'
  ) {
    return true;
  }
  const msg = error.message.toLowerCase();
  return msg.includes('network error') || msg.includes('timeout');
}

function classifyAxiosError(error: AxiosError): StreamErrorCode {
  if (mapNetworkError(error)) {
    return StreamErrorCode.UPSTREAM_NETWORK;
  }
  const status = error.response?.status;
  if (status != null) {
    if (status >= 400 && status < 500) return StreamErrorCode.UPSTREAM_HTTP_4XX;
    if (status >= 500) return StreamErrorCode.UPSTREAM_HTTP_5XX;
  }
  return StreamErrorCode.UNKNOWN;
}

function buildLogDetail(error: unknown): string {
  if (error instanceof AxiosError) {
    const status = error.response?.status;
    const data = formatAxiosData(error.response?.data);
    return truncate(
      `AxiosError status=${status ?? 'n/a'} code=${error.code ?? 'n/a'} message=${error.message}${data ? ` body=${data}` : ''}`,
      1000,
    );
  }
  if (error instanceof Error) {
    return truncate(error.message, 1000);
  }
  return truncate(String(error), 1000);
}

export function sanitizeStreamError(error: unknown): SanitizedStreamError {
  if (error != null && typeof error === 'object' && 'sanitized' in error) {
    const wrapped = error as { sanitized: SanitizedStreamError };
    if (wrapped.sanitized?.code && wrapped.sanitized?.userMessage) {
      return wrapped.sanitized;
    }
  }

  let code = StreamErrorCode.UNKNOWN;
  const logDetail = buildLogDetail(error);

  if (error instanceof AxiosError) {
    if (mapConfigError(error.message)) {
      code = StreamErrorCode.CONFIG_ERROR;
    } else {
      code = classifyAxiosError(error);
    }
  } else if (error instanceof Error) {
    if (mapConfigError(error.message)) {
      code = StreamErrorCode.CONFIG_ERROR;
    } else if (error.message.toLowerCase().includes('stream')) {
      code = StreamErrorCode.STREAM_INTERRUPTED;
    }
  }

  return {
    code,
    userMessage: USER_MESSAGES[code],
    logDetail,
  };
}

export function buildFailedMessageMetadata(
  sanitized: SanitizedStreamError,
  platform: string,
  model: string,
): FailedMessageMetadata {
  return {
    status: 'failed',
    code: sanitized.code,
    error: truncate(sanitized.logDetail, METADATA_ERROR_MAX_LEN),
    platform,
    model,
    failedAt: new Date().toISOString(),
  };
}
