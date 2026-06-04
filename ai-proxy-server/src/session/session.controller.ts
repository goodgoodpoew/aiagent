import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Headers, Res } from '@nestjs/common';
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

@Controller('api/sessions')
export class SessionController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly sessionEventService: SessionEventService,
    private readonly messageService: MessageService,
    private readonly fileService: FileService,
  ) {}

  @Post()
  create(@Headers('x-user-id') userId: string, @Body() dto: CreateSessionDto) {
    return this.sessionService.create(userId, dto);
  }

  @Get()
  findAll(@Headers('x-user-id') userId: string, @Query() query: QuerySessionDto) {
    return this.sessionService.findAll(userId, query);
  }

  @Get('events')
  @SkipResponseEnvelope()
  events(
    @Headers('x-user-id') userId: string,
    @Headers('last-event-id') lastEventId: string | undefined,
    @Query('lastEventId') queryLastEventId: string | undefined,
    @Res() res: Response,
  ) {
    const effectiveUserId = userId || 'anonymous';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    this.sessionEventService.registerClient(effectiveUserId, res, lastEventId || queryLastEventId);
  }

  @Get(':id')
  findOne(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.sessionService.findOne(id, userId);
  }

  @Get(':id/messages')
  async getMessages(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    await this.sessionService.findOne(id, userId);
    return this.messageService.findBySessionId(id, cursor, limit ? Number(limit) : 50);
  }

  @Patch(':id')
  update(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdateSessionDto,
  ) {
    return this.sessionService.update(id, userId, dto);
  }

  @Post(':id/files')
  attachFiles(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Body() dto: AttachSessionFilesDto,
  ) {
    return this.sessionService.attachFilesToSession(userId, id, dto.fileIds);
  }

  @Get(':id/files')
  async getFiles(
    @Headers('x-user-id') userId: string,
    @Param('id') id: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: number,
  ) {
    await this.sessionService.findOne(id, userId);
    return this.fileService.findAll(userId, {
      sessionId: id,
      cursor,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Delete(':id')
  remove(@Headers('x-user-id') userId: string, @Param('id') id: string) {
    return this.sessionService.softDelete(id, userId);
  }
}
