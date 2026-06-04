import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerStorageRedisService } from './throttler-storage-redis.service';
import { ThrottlerStorageRedisModule } from './throttler-storage-redis.module';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule, ThrottlerStorageRedisModule],
      inject: [ConfigService, ThrottlerStorageRedisService],
      useFactory: (config: ConfigService, storage: ThrottlerStorageRedisService) => ({
        storage,
        throttlers: [
          {
            ttl: config.get<number>('throttle.ttl', 60000),
            limit: config.get<number>('throttle.limit', 20),
          },
        ],
      }),
    }),
  ],
})
export class ThrottleModule {}
