import { Module } from '@nestjs/common';
import { ThrottlerStorageRedisService } from './throttler-storage-redis.service';

@Module({
  providers: [ThrottlerStorageRedisService],
  exports: [ThrottlerStorageRedisService],
})
export class ThrottlerStorageRedisModule {}
