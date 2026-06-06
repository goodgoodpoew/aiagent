import { HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AppException } from '../common/errors/app.exception';
import { ErrorCode } from '../common/errors/error-code.enum';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'demo',
  email: 'demo@example.test',
  displayName: '演示用户',
  passwordHash: '',
  status: 'active',
  lastLoginAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('AuthService', () => {
  let prisma: {
    user: {
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
  let service: AuthService;

  beforeEach(() => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    service = new AuthService(prisma as any, {
      get: jest.fn((key: string, fallback: unknown) => {
        if (key === 'auth.tokenSecret') return 'unit-test-secret';
        if (key === 'auth.tokenTtlSeconds') return 3600;
        return fallback;
      }),
    } as any);
  });

  it('注册成功后返回 token 与安全用户信息', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }) => ({
      ...user,
      username: data.username,
      email: data.email,
      displayName: data.displayName,
      passwordHash: data.passwordHash,
    }));

    const result = await service.register({
      username: 'demo',
      email: 'DEMO@example.test',
      password: 'password123',
      displayName: '演示用户',
    });

    expect(result.token).toEqual(expect.any(String));
    expect(result.user).toMatchObject({
      id: user.id,
      username: 'demo',
      email: 'demo@example.test',
      displayName: '演示用户',
    });
    expect(prisma.user.create.mock.calls[0][0].data.passwordHash).toContain('pbkdf2_sha256');
  });

  it('注册时拒绝重复用户名或邮箱', async () => {
    prisma.user.findFirst.mockResolvedValue({ id: user.id });

    await expect(
      service.register({
        username: 'demo',
        email: 'demo@example.test',
        password: 'password123',
      }),
    ).rejects.toMatchObject({
      code: ErrorCode.CONFLICT,
      status: HttpStatus.CONFLICT,
    });
  });

  it('登录成功后刷新最后登录时间并返回 token', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockImplementation(async ({ data }) => ({
      ...user,
      passwordHash: data.passwordHash,
    }));
    const registered = await service.register({
      username: 'demo',
      email: 'demo@example.test',
      password: 'password123',
    });

    prisma.user.findFirst.mockResolvedValue({
      ...user,
      passwordHash: prisma.user.create.mock.calls[0][0].data.passwordHash,
    });
    prisma.user.update.mockResolvedValue(user);

    const result = await service.login({ account: 'demo', password: 'password123' });

    expect(result.token).toEqual(expect.any(String));
    expect(result.user.id).toBe(registered.user.id);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { lastLoginAt: expect.any(Date) },
    });
  });

  it('登录时拒绝错误密码', async () => {
    prisma.user.findFirst.mockResolvedValue({ ...user, passwordHash: 'unusable' });

    await expect(service.login({ account: 'demo', password: 'wrong' })).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('能校验已签发 token 并读取当前用户', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(user);
    const { token } = await service.register({
      username: 'demo',
      email: 'demo@example.test',
      password: 'password123',
    });

    prisma.user.findUnique.mockResolvedValue(user);

    await expect(service.verifyToken(token)).resolves.toMatchObject({
      id: user.id,
      username: user.username,
    });
  });
});
