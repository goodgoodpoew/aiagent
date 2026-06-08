import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../common/errors/error-code.enum';
import type { AuthenticatedUser } from './auth.types';
import { resolveUserId } from './user-id.util';

const user: AuthenticatedUser = {
  id: 'user-authenticated',
  username: 'demo',
  email: 'demo@example.test',
};

describe('resolveUserId', () => {
  it('优先使用认证上下文中的用户 ID', () => {
    expect(resolveUserId(user, 'user-header')).toBe('user-authenticated');
  });

  it('默认拒绝裸 X-User-Id', () => {
    expect(() => resolveUserId(undefined, 'user-header')).toThrow(
      expect.objectContaining({
        code: ErrorCode.UNAUTHORIZED,
        status: HttpStatus.UNAUTHORIZED,
      }),
    );
  });

  it('仅在显式开启时接受 header 用户 ID', () => {
    expect(resolveUserId(undefined, 'user-header', { allowHeaderUserId: true })).toBe(
      'user-header',
    );
  });
});
