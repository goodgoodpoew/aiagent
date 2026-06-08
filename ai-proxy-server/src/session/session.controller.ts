import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Headers,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { SessionService } from './session.service';
import { SessionEventService } from './session-event.service';
import { MessageService } from '../message/message.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { QuerySessionDto } from './dto/query-session.dto';
import { AttachSessionFilesDto } from './dto/attach-session-files.dto';
import { FileService } from '../files/file.service';
import { SkipResponseEnvelope } from '../common/response/skip-response-envelope.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import { resolveUserId } from '../auth/user-id.util';
import type { AuthenticatedUser } from '../auth/auth.types';

@Controller('api/sessions')
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly sessionEventService: SessionEventService,
    private readonly messageService: MessageService,
    private readonly fileService: FileService,
    private readonly config: ConfigService,
  ) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('x-user-id') userId: string,
    @Body() dto: CreateSessionDto,
  ) {
    return this.sessionService.create(this.resolveEffectiveUserId(user, userId), dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('x-user-id') userId: string,
    @Query() query: QuerySessionDto,
  ) {
    return this.sessionService.findAll(this.resolveEffectiveUserId(user, userId), query);
  }

  @Get('events')
  @SkipResponseEnvelope()
  events(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('x-user-id') userId: string,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Query('lastEventId') queryLastEventId: string | undefined,
    @Res() res: Response,
  ) {
    const effectiveUserId = this.resolveEffectiveUserId(user, userId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    this.sessionEventService.registerClient(effectiveUserId, res, lastEventId || queryLastEventId);
  }

  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.sessionService.findOne(id, this.resolveEffectiveUserId(user, userId));
  }

  @Get(':id/messages')
  async getMessages(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    await this.sessionService.findOne(id, this.resolveEffectiveUserId(user, userId));
    return this.messageService.findBySessionId(id, cursor, limit ? Number(limit) : 50);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionService.update(id, this.resolveEffectiveUserId(user, userId), dto);
  }

  @Post(':id/files')
  attachFiles(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() dto: AttachSessionFilesDto,
  ) {
    return this.sessionService.attachFilesToSession(
      this.resolveEffectiveUserId(user, userId),
      id,
      dto.fileIds,
    );
  }

  @Get(':id/files')
  async getFiles(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    const effectiveUserId = this.resolveEffectiveUserId(user, userId);
    await this.sessionService.findOne(id, effectiveUserId);
    return this.fileService.findAll(effectiveUserId, {
      sessionId: id,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
  ) {
    return this.sessionService.softDelete(id, this.resolveEffectiveUserId(user, userId));
  }

  private resolveEffectiveUserId(user: AuthenticatedUser | undefined, headerUserId?: string) {
    return resolveUserId(user, headerUserId, {
      allowHeaderUserId: this.config.get<boolean>('auth.allowHeaderUserId', false),
    });
  }
}
