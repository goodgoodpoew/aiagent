import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createKeyv } from '@keyv/redis';
import { AiProxyModule } from './ai-proxy/ai-proxy.module';
import { SessionModule } from './session/session.module';
import { ModelProviderModule } from './model-provider/model-provider.module';
import { PrismaModule } from './prisma/prisma.module';
import { FileModule } from './files/file.module';
import { RedisModule } from './redis/redis.module';
import { QueueModule } from './queue/queue.module';
import { ThrottleModule } from './throttle/throttle.module';
import configuration from './config/configuration';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const redisKeyPrefix = config.get<string>('redis.keyPrefix', 'aiproxy:');
        return {
          stores: [
            createKeyv(
              {
                url: `redis://${config.get<string>('redis.host', 'localhost')}:${config.get<number>('redis.port', 6379)}`,
                ...(config.get<string>('redis.password')
                  ? { password: config.get<string>('redis.password') }
                  : {}),
              },
              {
                namespace: redisKeyPrefix.replace(/:+$/, ''),
              },
            ),
          ],
          ttl: config.get<number>('cache.chatTtl', 300) * 1000,
        };
      },
    }),
    RedisModule.forRootAsync(),
    ThrottleModule,
    QueueModule,
    PrismaModule,
    AuthModule,
    AiProxyModule,
    SessionModule,
    ModelProviderModule,
    FileModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
