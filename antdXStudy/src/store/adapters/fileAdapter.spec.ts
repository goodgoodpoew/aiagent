import { describe, expect, it } from 'vitest';
import { normalizeFile, normalizeFileList } from './fileAdapter';

describe('fileAdapter', () => {
  it('normalizeFile 收敛字段并把 size 转数字', () => {
    const file = normalizeFile({
      id: 'f1',
      name: '数据.csv',
      type: 'text/csv',
      size: '2048' as unknown as number,
      status: 'ready',
      purpose: 'chat',
      createdAt: '2026-06-06T00:00:00.000Z',
    });
    expect(file).toMatchObject({
      id: 'f1',
      name: '数据.csv',
      size: 2048,
      sessionCount: 0,
      messageCount: 0,
    });
  });

  it('normalizeFileList 用 cursor 推导 hasMore，空列表兜底', () => {
    expect(normalizeFileList({ cursor: 'next' })).toEqual({
      files: [],
      cursor: 'next',
      hasMore: true,
    });
  });
});
