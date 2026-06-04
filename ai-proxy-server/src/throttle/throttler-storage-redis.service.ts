import { Injectable, Inject } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';
import { REDIS_CLIENT } from '../redis/redis.interface';
import Redis from 'ioredis';

@Injectable()
export class ThrottlerStorageRedisService implements ThrottlerStorage {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const redisKey = `throttle:${throttlerName}:${key}`;

    const multi = this.redis.multi();
    multi.incr(redisKey);
    multi.pttl(redisKey);

    const results = (await multi.exec())!;

    const totalHits = (results[0][1] as number) ?? 0;
    const currentTtl = (results[1][1] as number) ?? -1;

    if (currentTtl === -1) {
      await this.redis.pexpire(redisKey, ttl);
    }

    const isBlocked = totalHits > limit;
    const timeToExpire = isBlocked
      ? Date.now() + blockDuration
      : Date.now() + (currentTtl > 0 ? currentTtl : ttl);

    return {
      totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: isBlocked ? timeToExpire : 0,
    };
  }
}
