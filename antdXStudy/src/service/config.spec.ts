import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_API_BASE_URL,
  DEFAULT_USER_ID,
  getApiBaseUrl,
  getUserId,
} from './config';

afterEach(() => {
  delete process.env.UMI_APP_API_BASE_URL;
  delete process.env.UMI_APP_USER_ID;
});

describe('service config', () => {
  it('默认使用本地后端与 demo 用户', () => {
    expect(getApiBaseUrl()).toBe(DEFAULT_API_BASE_URL);
    expect(getUserId()).toBe(DEFAULT_USER_ID);
  });

  it('读取灰度环境变量并去掉尾部斜杠', () => {
    process.env.UMI_APP_API_BASE_URL = 'http://gray.example.test/api///';
    process.env.UMI_APP_USER_ID = 'gray-user-id';

    expect(getApiBaseUrl()).toBe('http://gray.example.test/api');
    expect(getUserId()).toBe('gray-user-id');
  });
});
