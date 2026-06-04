import { RuntimeConfig } from '@umijs/max';
import { message as antdMessage } from 'antd';

export interface ApiEnvelope<T = unknown> {
  success: boolean;
  code: string;
  message: string;
  data: T | null;
  traceId?: string;
  timestamp?: string;
  path?: string;
  error?: {
    details?: unknown;
  };
}

export class ApiClientError extends Error {
  code: string;
  status?: number;
  traceId?: string;
  details?: unknown;

  constructor(options: {
    code: string;
    message: string;
    status?: number;
    traceId?: string;
    details?: unknown;
  }) {
    super(options.message);
    this.name = 'ApiClientError';
    this.code = options.code;
    this.status = options.status;
    this.traceId = options.traceId;
    this.details = options.details;
  }
}

function isApiEnvelope<T = unknown>(value: unknown): value is ApiEnvelope<T> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<ApiEnvelope<T>>;
  return (
    typeof candidate.success === 'boolean' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string' &&
    'data' in candidate
  );
}

function toApiClientError(envelope: ApiEnvelope, status?: number): ApiClientError {
  return new ApiClientError({
    code: envelope.code || `HTTP_${status ?? 'UNKNOWN'}`,
    message: envelope.message || '请求失败，请稍后重试',
    status,
    traceId: envelope.traceId,
    details: envelope.error?.details,
  });
}

function toFallbackError(status?: number, message?: string): ApiClientError {
  return new ApiClientError({
    code: status ? `HTTP_${status}` : 'REQUEST_ERROR',
    message: message || '请求失败，请稍后重试',
    status,
  });
}

export async function parseApiEnvelopeResponse<T>(
  response: Response,
  fallbackMessage = '请求失败，请稍后重试',
): Promise<T> {
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => null)
    : null;

  if (isApiEnvelope<T>(body)) {
    if (response.ok && body.success) {
      return body.data as T;
    }
    throw toApiClientError(body, response.status);
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object' && 'message' in body
        ? String((body as { message?: unknown }).message)
        : fallbackMessage;
    throw toFallbackError(response.status, message);
  }

  return body as T;
}

export const request: RuntimeConfig['request'] = {
  timeout: 1000,
  headers: {
    'X-User-Id': '9a74c501-9d60-441b-b1ba-7b3eb469dce0',
  },
  errorConfig: {
    errorThrower(data) {
      if (isApiEnvelope(data) && !data.success) {
        throw toApiClientError(data);
      }
    },
    errorHandler(error, options) {
      if (options?.skipErrorHandler) {
        throw error;
      }

      const responseData = (error as { response?: { data?: unknown; status?: number } }).response
        ?.data;
      const status = (error as { response?: { status?: number } }).response?.status;

      if (isApiEnvelope(responseData)) {
        const apiError = toApiClientError(responseData, status);
        antdMessage.error(apiError.message);
        throw apiError;
      }

      const apiError =
        error instanceof ApiClientError
          ? error
          : toFallbackError(status, (error as { message?: string }).message);

      antdMessage.error(apiError.message);
      throw apiError;
    },
  },
  requestInterceptors: [],
  responseInterceptors: [
    (response: any) => {
      if (isApiEnvelope(response?.data)) {
        if (!response.data.success) {
          throw toApiClientError(response.data, response.status);
        }
        response.data = response.data.data;
      }
      return response;
    },
  ],
};
