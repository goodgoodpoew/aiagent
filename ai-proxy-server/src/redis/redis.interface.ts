import Redis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

export interface RedisModuleOptions {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
}
