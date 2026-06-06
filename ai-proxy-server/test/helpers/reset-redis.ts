import { assertTestEnv } from './assert-test-env';

interface TestRedisClient {
  scan(
    cursor: string,
    mode: 'MATCH',
    pattern: string,
    countMode: 'COUNT',
    count: number,
  ): Promise<[string, string[]]>;
  del(...keys: string[]): Promise<number>;
}

export async function resetRedis(redis: TestRedisClient) {
  assertTestEnv();

  const prefix = process.env.REDIS_KEY_PREFIX;
  if (!prefix?.includes('test')) {
    throw new Error(`REDIS_KEY_PREFIX 必须包含 test，当前值: ${prefix ?? '<empty>'}`);
  }

  let cursor = '0';
  do {
    const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100);
    cursor = nextCursor;
    if (keys.length) {
      await redis.del(...keys);
    }
  } while (cursor !== '0');
}
