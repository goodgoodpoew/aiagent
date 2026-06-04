import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-code.enum';
import { getErrorMessage } from './error-message.map';

export interface AppExceptionOptions {
  code: ErrorCode;
  message?: string;
  status?: HttpStatus;
  details?: unknown;
  logMessage?: string;
}

export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly details?: unknown;
  readonly logMessage?: string;

  constructor(options: AppExceptionOptions) {
    const status = options.status ?? HttpStatus.BAD_REQUEST;
    const message = getErrorMessage(options.code, options.message);

    super(
      {
        code: options.code,
        message,
        details: options.details,
      },
      status,
    );

    this.code = options.code;
    this.details = options.details;
    this.logMessage = options.logMessage;
  }
}
