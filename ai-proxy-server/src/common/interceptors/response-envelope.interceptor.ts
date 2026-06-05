import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';
import { ErrorCode } from '../errors/error-code.enum';
import { getErrorMessage } from '../errors/error-message.map';
import { RequestWithId } from '../middleware/request-id.middleware';
import { ApiResponse, isApiResponse } from '../response/api-response.types';
import { SKIP_RESPONSE_ENVELOPE } from '../response/skip-response-envelope.decorator';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http' || this.shouldSkip(context)) {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<RequestWithId>();
    const res = http.getResponse<Response>();
    if (this.shouldSkipByPath(req)) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data: unknown) => {
        if (this.shouldSkipByResponse(res, data)) {
          return data;
        }

        if (res.statusCode === HttpStatus.NO_CONTENT) {
          res.status(HttpStatus.OK);
        }

        if (isApiResponse(data)) {
          return data;
        }

        const body: ApiResponse = {
          success: true,
          code: ErrorCode.OK,
          message: getErrorMessage(ErrorCode.OK),
          data: data ?? null,
          traceId: req.requestId || req.header('x-request-id') || '',
          timestamp: new Date().toISOString(),
          path: req.originalUrl || req.url,
        };

        return body;
      }),
    );
  }

  private shouldSkip(context: ExecutionContext): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(SKIP_RESPONSE_ENVELOPE, [
        context.getHandler(),
        context.getClass(),
      ]) === true
    );
  }

  private shouldSkipByResponse(res: Response, data: unknown): boolean {
    if (data instanceof StreamableFile) {
      return true;
    }

    const contentType = String(res.getHeader('content-type') || '').toLowerCase();
    return (
      contentType.includes('text/event-stream') ||
      contentType.includes('application/octet-stream') ||
      contentType.includes('application/pdf')
    );
  }

  private shouldSkipByPath(req: RequestWithId): boolean {
    const path = req.originalUrl || req.url;
    return path.includes('/api/ai/chat/stream/v2') || path.includes('/download');
  }
}
