import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, pbkdf2 as pbkdf2Callback, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import type { AuthenticatedUser } from './auth.types';

const pbkdf2 = promisify(pbkdf2Callback);
const HASH_ALGORITHM = 'pbkdf2_sha256';
const HASH_ITERATIONS = 120000;
const HASH_KEY_LENGTH = 32;

interface TokenPayload {
  sub: string;
  username: string;
  exp: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const username = dto.username.trim();
    const email = dto.email.trim().toLowerCase();
    const existed = await this.prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { id: true },
    });

    if (existed) {
      throw new AppException({
        code: ErrorCode.CONFLICT,
        status: HttpStatus.CONFLICT,
        message: '用户名或邮箱已存在',
      });
    }

    const user = await this.prisma.user.create({
      data: {
        username,
        email,
        passwordHash: await this.hashPassword(dto.password),
        displayName: dto.displayName?.trim() || username,
      },
    });

    return this.createAuthResult(this.toSafeUser(user));
  }

  async login(dto: LoginDto) {
    const account = dto.account.trim();
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: account }, { email: account.toLowerCase() }],
      },
    });

    if (!user || user.status !== 'active' || !(await this.verifyPassword(dto.password, user.passwordHash))) {
      throw new AppException({
        code: ErrorCode.UNAUTHORIZED,
        status: HttpStatus.UNAUTHORIZED,
        message: '账号或密码错误',
      });
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    return this.createAuthResult(this.toSafeUser(updatedUser));
  }

  async findMe(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || user.status !== 'active') {
      throw new AppException({ code: ErrorCode.UNAUTHORIZED, status: HttpStatus.UNAUTHORIZED });
    }

    return this.toSafeUser(user);
  }

  async verifyToken(token: string): Promise<AuthenticatedUser | undefined> {
    const payload = this.decodeAndVerifyToken(token);
    if (!payload) {
      return undefined;
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || user.status !== 'active') {
      return undefined;
    }

    return this.toSafeUser(user);
  }

  private async hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16).toString('base64url');
    const hash = await pbkdf2(password, salt, HASH_ITERATIONS, HASH_KEY_LENGTH, 'sha256');
    return `${HASH_ALGORITHM}$${HASH_ITERATIONS}$${salt}$${hash.toString('base64url')}`;
  }

  private async verifyPassword(password: string, storedHash: string): Promise<boolean> {
    const [algorithm, iterationsText, salt, hashText] = storedHash.split('$');
    if (algorithm !== HASH_ALGORITHM || !iterationsText || !salt || !hashText) {
      return false;
    }

    const iterations = Number(iterationsText);
    if (!Number.isInteger(iterations) || iterations <= 0) {
      return false;
    }

    const expected = Buffer.from(hashText, 'base64url');
    const actual = await pbkdf2(password, salt, iterations, expected.length, 'sha256');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  private createAuthResult(user: AuthenticatedUser) {
    return {
      token: this.signToken(user),
      user,
    };
  }

  private signToken(user: AuthenticatedUser): string {
    const ttl = this.config.get<number>('auth.tokenTtlSeconds', 7 * 24 * 60 * 60);
    const payload: TokenPayload = {
      sub: user.id,
      username: user.username,
      exp: Math.floor(Date.now() / 1000) + ttl,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    const signature = this.sign(encodedPayload);
    return `${encodedPayload}.${signature}`;
  }

  private decodeAndVerifyToken(token: string): TokenPayload | undefined {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature || this.sign(encodedPayload) !== signature) {
      return undefined;
    }

    try {
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TokenPayload;
      if (!payload.sub || !payload.username || payload.exp < Math.floor(Date.now() / 1000)) {
        return undefined;
      }
      return payload;
    } catch {
      return undefined;
    }
  }

  private sign(value: string): string {
    return createHmac('sha256', this.config.get<string>('auth.tokenSecret', 'dev-auth-token-secret'))
      .update(value)
      .digest('base64url');
  }

  private toSafeUser(user: {
    id: string;
    username: string;
    email: string;
    displayName?: string | null;
  }): AuthenticatedUser {
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
    };
  }
}
