import { Injectable, Inject } from '@nestjs/common';
import { REDIS_CLIENT } from './redis.interface';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  get client(): Redis {
    return this.redis;
  }

  async getJson<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.redis.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setJson(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.redis.setex(key, ttlSeconds, serialized);
    } else {
      await this.redis.set(key, serialized);
    }
  }

  async hgetJson<T = unknown>(key: string, field: string): Promise<T | null> {
    const raw = await this.redis.hget(key, field);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async hsetJson(key: string, field: string, value: unknown): Promise<void> {
    await this.redis.hset(key, field, JSON.stringify(value));
  }

  async expire(key: string, seconds: number): Promise<void> {
    await this.redis.expire(key, seconds);
  }

  async del(...keys: string[]): Promise<number> {
    return this.redis.del(...keys);
  }

  async exists(key: string): Promise<number> {
    return this.redis.exists(key);
  }
}
