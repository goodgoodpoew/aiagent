import { HttpException, HttpStatus } from '@nestjs/common';
import { AxiosError } from 'axios';
import { Prisma } from '@prisma/client';
import { StreamProxyError } from '../../ai-proxy/errors/stream-proxy.error';
import { AppException } from './app.exception';
import { ErrorCode } from './error-code.enum';
import { getErrorMessage } from './error-message.map';

export interface NormalizedError {
  status: HttpStatus;
  code: ErrorCode;
  message: string;
  details?: unknown;
  logDetail: string;
}

interface StreamLikeError {
  sanitized?: {
    code?: string;
    userMessage?: string;
    logDetail?: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object';
}

function truncate(value: string, max = 1000): string {
  if (value.length <= max) return value;
  return value.slice(0, max) + '...';
}

function stringifySafe(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === 'string') {
    return value;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function pickHttpCode(status: number, response: unknown): ErrorCode {
  if (status === HttpStatus.BAD_REQUEST) {
    const message = isRecord(response) ? response.message : undefined;
    return Array.isArray(message) ? ErrorCode.VALIDATION_ERROR : ErrorCode.BAD_REQUEST;
  }
  if (status === HttpStatus.UNAUTHORIZED) return ErrorCode.UNAUTHORIZED;
  if (status === HttpStatus.FORBIDDEN) return ErrorCode.FORBIDDEN;
  if (status === HttpStatus.NOT_FOUND) return ErrorCode.NOT_FOUND;
  if (status === HttpStatus.CONFLICT) return ErrorCode.CONFLICT;
  if (status === HttpStatus.TOO_MANY_REQUESTS) return ErrorCode.RATE_LIMITED;
  return status >= 500 ? ErrorCode.INTERNAL_SERVER_ERROR : ErrorCode.BAD_REQUEST;
}

function normalizeValidationDetails(message: unknown): unknown {
  if (!Array.isArray(message)) return undefined;
  return message.map((item) => ({ message: String(item) }));
}

function normalizeHttpException(error: HttpException): NormalizedError {
  const status = error.getStatus();
  const response = error.getResponse();

  if (error instanceof AppException) {
    return {
      status,
      code: error.code,
      message: error.message,
      details: error.details,
      logDetail: truncate(error.logMessage || error.message),
    };
  }

  const code = pickHttpCode(status, response);
  const messageFromResponse = isRecord(response) ? response.message : response;
  const details = normalizeValidationDetails(messageFromResponse);
  const message =
    typeof messageFromResponse === 'string' && code !== ErrorCode.INTERNAL_SERVER_ERROR
      ? messageFromResponse
      : getErrorMessage(code);

  return {
    status,
    code,
    message,
    details,
    logDetail: truncate(stringifySafe(response)),
  };
}

function normalizePrismaError(error: Prisma.PrismaClientKnownRequestError): NormalizedError {
  if (error.code === 'P2002') {
    return {
      status: HttpStatus.CONFLICT,
      code: ErrorCode.CONFLICT,
      message: getErrorMessage(ErrorCode.CONFLICT),
      details: { target: error.meta?.target },
      logDetail: truncate(error.message),
    };
  }

  if (error.code === 'P2025') {
    return {
      status: HttpStatus.NOT_FOUND,
      code: ErrorCode.NOT_FOUND,
      message: getErrorMessage(ErrorCode.NOT_FOUND),
      logDetail: truncate(error.message),
    };
  }

  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode.INTERNAL_SERVER_ERROR,
    message: getErrorMessage(ErrorCode.INTERNAL_SERVER_ERROR),
    logDetail: truncate(error.message),
  };
}

function normalizeAxiosError(error: AxiosError): NormalizedError {
  const upstreamStatus = error.response?.status;
  const status =
    upstreamStatus != null && upstreamStatus >= 400 && upstreamStatus < 500
      ? HttpStatus.BAD_GATEWAY
      : HttpStatus.SERVICE_UNAVAILABLE;

  const code =
    upstreamStatus == null
      ? ErrorCode.UPSTREAM_NETWORK_ERROR
      : upstreamStatus >= 500
        ? ErrorCode.UPSTREAM_UNAVAILABLE
        : ErrorCode.UPSTREAM_REJECTED;

  return {
    status,
    code,
    message: getErrorMessage(code),
    logDetail: truncate(
      `AxiosError status=${upstreamStatus ?? 'n/a'} code=${error.code ?? 'n/a'} message=${error.message}`,
    ),
  };
}

function normalizeStreamLikeError(error: StreamLikeError): NormalizedError | null {
  const sanitized = error.sanitized;
  if (!sanitized?.code) {
    return null;
  }

  let code = ErrorCode.INTERNAL_SERVER_ERROR;
  let status = HttpStatus.INTERNAL_SERVER_ERROR;

  if (sanitized.code === 'CONFIG_ERROR') {
    code = ErrorCode.AI_PROVIDER_NOT_CONFIGURED;
    status = HttpStatus.BAD_REQUEST;
  } else if (sanitized.code === 'UPSTREAM_HTTP_4XX') {
    code = ErrorCode.UPSTREAM_REJECTED;
    status = HttpStatus.BAD_GATEWAY;
  } else if (sanitized.code === 'UPSTREAM_HTTP_5XX') {
    code = ErrorCode.UPSTREAM_UNAVAILABLE;
    status = HttpStatus.SERVICE_UNAVAILABLE;
  } else if (sanitized.code === 'UPSTREAM_NETWORK') {
    code = ErrorCode.UPSTREAM_NETWORK_ERROR;
    status = HttpStatus.SERVICE_UNAVAILABLE;
  }

  return {
    status,
    code,
    message: getErrorMessage(code, sanitized.userMessage),
    logDetail: truncate(sanitized.logDetail || sanitized.userMessage || sanitized.code),
  };
}

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof HttpException) {
    return normalizeHttpException(error);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return normalizePrismaError(error);
  }

  if (error instanceof AxiosError) {
    return normalizeAxiosError(error);
  }

  if (error instanceof StreamProxyError) {
    const normalized = normalizeStreamLikeError(error);
    if (normalized) return normalized;
  }

  if (isRecord(error)) {
    const normalized = normalizeStreamLikeError(error as StreamLikeError);
    if (normalized) return normalized;
  }

  const logDetail = truncate(stringifySafe(error));
  return {
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    code: ErrorCode.INTERNAL_SERVER_ERROR,
    message: getErrorMessage(ErrorCode.INTERNAL_SERVER_ERROR),
    logDetail,
  };
}
