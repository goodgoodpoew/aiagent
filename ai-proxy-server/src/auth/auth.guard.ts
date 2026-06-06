import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const token = this.extractBearerToken(request);
    if (!token) {
      return true;
    }

    const user = await this.authService.verifyToken(token);
    if (!user) {
      throw new AppException({ code: ErrorCode.UNAUTHORIZED, status: HttpStatus.UNAUTHORIZED });
    }

    request.user = user;
    return true;
  }

  private extractBearerToken(request: Request): string | undefined {
    const authorization = request.header('authorization');
    if (!authorization) {
      return undefined;
    }

    const [scheme, token] = authorization.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      throw new AppException({ code: ErrorCode.UNAUTHORIZED, status: HttpStatus.UNAUTHORIZED });
    }
    return token;
  }
}
