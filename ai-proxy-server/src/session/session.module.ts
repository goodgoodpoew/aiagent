import { Module } from '@nestjs/common';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';
import { SessionCacheService } from './session-cache.service';
import { SessionEventService } from './session-event.service';
import { ChatPersistenceListener } from './chat-persistence.listener';
import { MessageModule } from '../message/message.module';
import { FileModule } from '../files/file.module';

@Module({
  imports: [MessageModule, FileModule],
  controllers: [SessionController],
  providers: [SessionService, SessionCacheService, SessionEventService, ChatPersistenceListener],
  exports: [SessionService, SessionCacheService, SessionEventService],
})
export class SessionModule {}
