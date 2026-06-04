import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import { normalizeError } from '../errors/error-normalizer';
import { RequestWithId } from '../middleware/request-id.middleware';
import { ApiResponse } from '../response/api-response.types';
import { SKIP_RESPONSE_ENVELOPE } from '../response/skip-response-envelope.decorator';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly reflector: Reflector) {}

  catch(exception: unknown, host: ArgumentsHost) {
    if (host.getType() !== 'http') {
      throw exception;
    }

    const context = host.switchToHttp();
    const req = context.getRequest<RequestWithId>();
    const res = context.getResponse<Response>();

    if (res.headersSent) {
      this.logger.warn(`响应已开始，跳过统一错误响应: ${req.method} ${req.originalUrl || req.url}`);
      return;
    }

    if (this.shouldSkip(host) || this.shouldSkipByPath(req)) {
      this.writeDefaultError(res, exception);
      return;
    }

    const normalized = normalizeError(exception);
    const traceId = req.requestId || req.header('x-request-id') || '';

    this.logger.error(
      `[${traceId}] ${req.method} ${req.originalUrl || req.url} -> ${normalized.status} ${normalized.code}: ${normalized.logDetail}`,
    );

    const body: ApiResponse<null> = {
      success: false,
      code: normalized.code,
      message: normalized.message,
      data: null,
      ...(normalized.details ? { error: { details: normalized.details } } : {}),
      traceId,
      timestamp: new Date().toISOString(),
      path: req.originalUrl || req.url,
    };

    res.status(normalized.status).json(body);
  }

  private shouldSkip(host: ArgumentsHost): boolean {
    const context = host as unknown as {
      getHandler?: () => any;
      getClass?: () => any;
    };

    if (!context.getHandler || !context.getClass) {
      return false;
    }

    const handler = context.getHandler();
    const controller = context.getClass();
    if (!handler || !controller) {
      return false;
    }

    return (
      this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_ENVELOPE, [
        handler,
        controller,
      ]) === true
    );
  }

  private writeDefaultError(res: Response, exception: unknown) {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'string') {
        res.status(status).json({
          statusCode: status,
          message: response,
        });
        return;
      }
      res.status(status).json(response);
      return;
    }

    const normalized = normalizeError(exception);
    res.status(normalized.status).json({
      statusCode: normalized.status,
      message: normalized.message,
      code: normalized.code,
    });
  }

  private shouldSkipByPath(req: RequestWithId): boolean {
    const path = req.originalUrl || req.url;
    return path.includes('/api/ai/chat/stream') || path.includes('/download');
  }
}
