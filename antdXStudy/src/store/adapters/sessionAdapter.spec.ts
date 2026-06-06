import { describe, expect, it } from 'vitest';
import { normalizeSession, normalizeSessionList } from './sessionAdapter';

describe('sessionAdapter', () => {
  it('normalizeSession 补齐默认值并把 Date 转 ISO 字符串', () => {
    const createdAt = new Date('2026-06-06T00:00:00.000Z');
    const session = normalizeSession({ id: 's1', createdAt, updatedAt: createdAt });
    expect(session).toMatchObject({
      id: 's1',
      title: null,
      isDeleted: false,
      createdAt: '2026-06-06T00:00:00.000Z',
      updatedAt: '2026-06-06T00:00:00.000Z',
    });
  });

  it('normalizeSession 缺时间时回填当前时间', () => {
    const session = normalizeSession({ id: 's1' });
    expect(typeof session.createdAt).toBe('string');
    expect(session.createdAt).not.toBe('');
  });

  it('normalizeSessionList 用 cursor 推导 hasMore', () => {
    expect(normalizeSessionList({ sessions: undefined, cursor: 'next' })).toEqual({
      sessions: [],
      cursor: 'next',
      hasMore: true,
    });
    expect(normalizeSessionList({ sessions: [{ id: 's1' }], cursor: null }).hasMore).toBe(false);
  });
});
