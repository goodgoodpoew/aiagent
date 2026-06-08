import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_API_BASE_URL,
  buildAuthHeaders,
  clearAuthSession,
  getApiBaseUrl,
  getAuthToken,
  getStoredAuthUser,
  getUserId,
  hasAuthSession,
  saveAuthSession,
} from './config';

afterEach(() => {
  delete process.env.UMI_APP_API_BASE_URL;
  delete process.env.UMI_APP_USER_ID;
  clearAuthSession();
});

describe('service config', () => {
  it('默认使用本地后端且不生成默认用户', () => {
    expect(getApiBaseUrl()).toBe(DEFAULT_API_BASE_URL);
    expect(getUserId()).toBeUndefined();
    expect(hasAuthSession()).toBe(false);
    expect(buildAuthHeaders()).toEqual({});
  });

  it('读取灰度环境变量并去掉尾部斜杠', () => {
    process.env.UMI_APP_API_BASE_URL = 'http://gray.example.test/api///';
    process.env.UMI_APP_USER_ID = 'gray-user-id';

    expect(getApiBaseUrl()).toBe('http://gray.example.test/api');
    expect(getUserId()).toBe('gray-user-id');
  });

  it('优先读取本地登录用户并生成认证头', () => {
    saveAuthSession('token-1', {
      id: 'user-1',
      username: 'demo',
      email: 'demo@example.test',
    });

    expect(getAuthToken()).toBe('token-1');
    expect(getStoredAuthUser()?.id).toBe('user-1');
    expect(getUserId()).toBe('user-1');
    expect(hasAuthSession()).toBe(true);
    expect(buildAuthHeaders()).toEqual({
      'X-User-Id': 'user-1',
      Authorization: 'Bearer token-1',
    });
  });
});
