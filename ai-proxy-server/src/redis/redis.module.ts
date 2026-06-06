import { Global, Module, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { RedisService } from './redis.service';
import { REDIS_CLIENT } from './redis.interface';

@Global()
@Module({})
export class RedisModule {
  static forRootAsync() {
    return {
      module: RedisModule,
      imports: [ConfigModule],
      providers: [
        {
          provide: REDIS_CLIENT,
          inject: [ConfigService],
          useFactory: (config: ConfigService) => {
            const logger = new Logger('RedisModule');

            const redis = new Redis({
              host: config.get<string>('redis.host', 'localhost'),
              port: config.get<number>('redis.port', 6379),
              password: config.get<string>('redis.password') || undefined,
              db: config.get<number>('redis.db', 0),
              keyPrefix: config.get<string>('redis.keyPrefix', 'aiproxy:'),
              retryStrategy: (times) => {
                const delay = Math.min(times * 50, 2000);
                logger.warn(`Redis 重连第 ${times} 次，延迟 ${delay}ms`);
                return delay;
              },
              maxRetriesPerRequest: 3,
              lazyConnect: false,
            });

            redis.on('connect', () => logger.log('Redis 已连接'));
            redis.on('error', (err) => logger.error('Redis 错误', err));

            return redis;
          },
        },
        RedisService,
      ],
      exports: [REDIS_CLIENT, RedisService],
    };
  }
}
