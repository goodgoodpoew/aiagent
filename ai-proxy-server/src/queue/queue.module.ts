import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MessagePersistProcessor } from './processors/message-persist.processor';
import { StreamCompletionProcessor } from './processors/stream-completion.processor';
import { MessageModule } from '../message/message.module';
import { SessionModule } from '@/session/session.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('redis.host', 'localhost'),
          port: config.get<number>('redis.port', 6379),
          password: config.get<string>('redis.password') || undefined,
          db: config.get<number>('redis.db', 0),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 500,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        },
      }),
    }),
    BullModule.registerQueue({ name: 'message-persist' }, { name: 'stream-completion' }),
    MessageModule,
    SessionModule,
  ],
  providers: [MessagePersistProcessor, StreamCompletionProcessor],
  exports: [BullModule],
})
export class QueueModule {}
