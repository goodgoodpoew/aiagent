import { ExecutionContext, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ErrorCode } from '../common/errors/error-code.enum';
import { AuthGuard } from './auth.guard';

function createContext(headers: Record<string, string | undefined> = {}): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => ({
        header: (name: string) => headers[name.toLowerCase()],
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('AuthGuard', () => {
  const authService = {
    verifyToken: jest.fn(),
  };
  const reflector = {
    getAllAndOverride: jest.fn(),
  } as unknown as Reflector;

  beforeEach(() => {
    jest.clearAllMocks();
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
  });

  function createGuard(allowHeaderUserId = false) {
    return new AuthGuard(
      authService as any,
      { get: jest.fn(() => allowHeaderUserId) } as any,
      reflector,
    );
  }

  it('公开接口直接放行', async () => {
    (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);

    await expect(createGuard().canActivate(createContext())).resolves.toBe(true);
    expect(authService.verifyToken).not.toHaveBeenCalled();
  });

  it('默认拒绝没有 token 的业务请求', async () => {
    await expect(createGuard().canActivate(createContext())).rejects.toMatchObject({
      code: ErrorCode.UNAUTHORIZED,
      status: HttpStatus.UNAUTHORIZED,
    });
  });

  it('开发开关开启时允许 header fallback 请求继续交给 controller 解析身份', async () => {
    await expect(
      createGuard(true).canActivate(createContext({ 'x-user-id': 'user-dev' })),
    ).resolves.toBe(true);
  });

  it('校验 Bearer token 并写入请求用户', async () => {
    const request = {
      user: undefined,
      header: (name: string) => ({ authorization: 'Bearer token-1' })[name.toLowerCase()],
    };
    const context = {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
    authService.verifyToken.mockResolvedValue({
      id: 'user-1',
      username: 'demo',
      email: 'demo@example.test',
    });

    await expect(createGuard().canActivate(context)).resolves.toBe(true);
    expect(request.user).toMatchObject({ id: 'user-1' });
  });
});
