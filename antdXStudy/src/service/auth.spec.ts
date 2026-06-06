import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearAuthSession, getAuthToken, getStoredAuthUser } from './config';
import { login, logout, register } from './auth';

function authResponse() {
  return new Response(
    JSON.stringify({
      success: true,
      code: 'OK',
      message: '成功',
      data: {
        token: 'token-1',
        user: {
          id: 'user-1',
          username: 'demo',
          email: 'demo@example.test',
          displayName: '演示用户',
        },
      },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  clearAuthSession();
});

describe('auth service', () => {
  it('登录成功后保存 token 和用户', async () => {
    const fetchMock = vi.fn().mockResolvedValue(authResponse());
    vi.stubGlobal('fetch', fetchMock);

    const result = await login({ account: 'demo', password: 'password123' });

    expect(result.token).toBe('token-1');
    expect(getAuthToken()).toBe('token-1');
    expect(getStoredAuthUser()).toMatchObject({ id: 'user-1', username: 'demo' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('注册成功后保存登录态', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(authResponse()));

    await register({
      username: 'demo',
      email: 'demo@example.test',
      password: 'password123',
    });

    expect(getStoredAuthUser()?.email).toBe('demo@example.test');
  });

  it('登出会清理登录态', () => {
    localStorage.setItem('aiagent.auth.token', 'token-1');
    localStorage.setItem('aiagent.auth.user', JSON.stringify({ id: 'user-1' }));

    logout();

    expect(getAuthToken()).toBeUndefined();
    expect(getStoredAuthUser()).toBeUndefined();
  });
});
