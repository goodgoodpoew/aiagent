import { HttpStatus } from '@nestjs/common';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import type { AuthenticatedUser } from './auth.types';

export function resolveUserId(user: AuthenticatedUser | undefined, headerUserId?: string): string {
  const userId = user?.id || headerUserId;
  if (!userId) {
    throw new AppException({ code: ErrorCode.UNAUTHORIZED, status: HttpStatus.UNAUTHORIZED });
  }
  return userId;
}
