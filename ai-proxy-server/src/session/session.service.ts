import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import type { Session } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  FileDbDelegate,
  MessageFileDbDelegate,
  SessionFileDbDelegate,
} from '../files/file-db.types';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateSessionDto } from './dto/update-session.dto';
import { QuerySessionDto } from './dto/query-session.dto';
import { SessionCacheService } from './session-cache.service';

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessionCache: SessionCacheService,
  ) { }

  private get uploadedFileDb(): FileDbDelegate {
    return (this.prisma as unknown as { uploadedFile: FileDbDelegate }).uploadedFile;
  }

  private get sessionFileDb(): SessionFileDbDelegate {
    return (this.prisma as unknown as { sessionFile: SessionFileDbDelegate }).sessionFile;
  }

  private get messageFileDb(): MessageFileDbDelegate {
    return (this.prisma as unknown as { messageFile: MessageFileDbDelegate }).messageFile;
  }

  async create(
    userId: string,
    dto: CreateSessionDto,
    id?: string,
    options?: { titleStatus?: 'pending' | 'auto' | 'manual' | 'failed' },
  ) {
    const session = await this.prisma.session.create({
      data: {
        ...(id ? { id } : {}),
        userId,
        title: dto.title,
        titleStatus: options?.titleStatus ?? 'manual',
      },
    });

    if (dto.fileIds?.length) {
      await this.attachFilesToSession(userId, session.id, dto.fileIds);
    }

    return session;
  }

  async findAll(userId: string, query: QuerySessionDto) {
    const { cursor, limit = 20 } = query;

    const sessions = await this.prisma.session.findMany({
      where: {
        userId,
        isDeleted: false,
        ...(cursor ? { updatedAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = sessions.length > limit;
    const data = hasMore ? sessions.slice(0, limit) : sessions;

    return {
      sessions: data,
      cursor: hasMore ? data[data.length - 1].updatedAt.toISOString() : null,
    };
  }

  async findOne(id: string, userId: string) {
    const cached = await this.sessionCache.getSession(id);
    if (cached && cached.userId !== userId) {
      throw new NotFoundException('会话不存在');
    }

    const session = await this.prisma.session.findFirst({
      where: { id, userId, isDeleted: false },
    });

    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    await this.sessionCache.cacheSession({
      id: session.id,
      userId: session.userId,
      title: session.title,
      titleStatus: session.titleStatus,
      version: session.version,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    });

    return session;
  }

  /**
   * 查找最新会话
   * @param id 会话 ID
   * @param userId 用户 ID
   * @returns 会话
   */
  async findOneFresh(id: string, userId: string): Promise<Session> {
    const session = await this.prisma.session.findFirst({
      where: { id, userId, isDeleted: false },
    });

    if (!session) {
      throw new NotFoundException('会话不存在');
    }

    return session;
  }

  async update(id: string, userId: string, dto: UpdateSessionDto) {
    await this.findOne(id, userId);

    const session = await this.prisma.session.update({
      where: { id },
      data: {
        title: dto.title,
        titleStatus: 'manual',
        version: { increment: 1 },
      },
    });

    await this.sessionCache.cacheSession({
      id: session.id,
      userId: session.userId,
      title: session.title,
      titleStatus: session.titleStatus,
      version: session.version,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    });

    return session;
  }

  async applyAutoTitle(params: {
    sessionId: string;
    userId: string;
    title: string;
    baseVersion: number;
  }) {
    const { sessionId, userId, title, baseVersion } = params;

    // 自动标题只能写入仍处于自动标题生命周期的会话，避免覆盖用户手动改名。
    const result = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
        isDeleted: false,
        titleStatus: { in: ['pending', 'failed'] },
        version: baseVersion,
      },
      data: {
        title,
        titleStatus: 'auto',
        version: { increment: 1 },
      },
    });

    if (!result.count) {
      return null;
    }

    const session = await this.findOneFresh(sessionId, userId);
    await this.cacheSessionSnapshot(session);
    return session;
  }

  async markAutoTitleFailed(params: { sessionId: string; userId: string; baseVersion: number }) {
    const { sessionId, userId, baseVersion } = params;
    const result = await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        userId,
        isDeleted: false,
        titleStatus: 'pending',
        version: baseVersion,
      },
      data: {
        titleStatus: 'failed',
        version: { increment: 1 },
      },
    });

    if (!result.count) {
      return null;
    }

    const session = await this.findOneFresh(sessionId, userId);
    await this.cacheSessionSnapshot(session);
    return session;
  }

  async findAllMessages(sessionId: string) {
    return this.prisma.message.findMany({
      where: { sessionId },
    });
  }

  async softDelete(id: string, userId: string) {
    await this.findOne(id, userId);

    return this.prisma.session.update({
      where: { id },
      data: { isDeleted: true, version: { increment: 1 } },
    });
  }

  private normalizeFileIds(fileIds: string[] | undefined): string[] {
    if (!fileIds?.length) return [];
    return Array.from(new Set(fileIds.filter(Boolean)));
  }

  private async findOwnedFiles(userId: string, fileIds: string[]) {
    if (!fileIds.length) return [];

    return this.uploadedFileDb.findMany({
      where: {
        id: { in: fileIds },
        userId,
        isDeleted: false,
      },
    });
  }

  /**
   * 会话级文件关联只做归档：说明文件在该会话出现过，不代表每轮都进入模型上下文。
   */
  async attachFilesToSession(userId: string, sessionId: string, fileIds: string[]) {
    await this.findOne(sessionId, userId);

    const normalizedIds = this.normalizeFileIds(fileIds);
    const files = await this.findOwnedFiles(userId, normalizedIds);
    if (!files.length) return { attachedFileIds: [] };

    await this.sessionFileDb.createMany({
      data: files.map((file) => ({
        sessionId,
        fileId: file.id,
        userId,
      })),
      skipDuplicates: true,
    });

    return { attachedFileIds: files.map((file) => file.id) };
  }

  /**
   * 消息级文件关联是事实来源：决定这条消息发送时模型实际可以读取哪些文件。
   */
  async attachFilesToMessage(
    userId: string,
    sessionId: string,
    messageId: string,
    fileIds: string[],
  ) {
    await this.findOne(sessionId, userId);

    const normalizedIds = this.normalizeFileIds(fileIds);
    const files = await this.findOwnedFiles(userId, normalizedIds);
    if (!files.length) return { attachedFileIds: [] };

    const message = await this.prisma.message.findFirst({
      where: {
        id: messageId,
        sessionId,
      },
    });
    if (!message) {
      throw new NotFoundException('消息不存在');
    }

    await this.prisma.$transaction([
      this.sessionFileDb.createMany({
        data: files.map((file) => ({
          sessionId,
          fileId: file.id,
          userId,
        })),
        skipDuplicates: true,
      }),
      this.messageFileDb.createMany({
        data: files.map((file) => ({
          messageId,
          sessionId,
          fileId: file.id,
          userId,
        })),
        skipDuplicates: true,
      }),
    ]);

    return { attachedFileIds: files.map((file) => file.id) };
  }

  private async cacheSessionSnapshot(session: {
    id: string;
    userId: string;
    title: string | null;
    titleStatus?: string;
    version?: number;
    createdAt?: Date;
    updatedAt: Date;
  }) {
    await this.sessionCache.cacheSession({
      id: session.id,
      userId: session.userId,
      title: session.title,
      titleStatus: session.titleStatus,
      version: session.version,
      createdAt: session.createdAt?.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    });
  }

  /**
   * 聊天主链确认或创建会话。
   * 有 sessionId 时只确认既有会话；查不到直接报错，禁止静默创建隐藏分叉。
   */
  async confirmOrCreateForChat(
    userId: string,
    sessionId: string | undefined,
    title: string,
    options?: { titleStatus?: 'pending' | 'manual' },
  ): Promise<{ session: Session; isNewSession: boolean }> {
    if (sessionId) { // 如果存在会话 ID，则直接查找会话
      const session = await this.findOneFresh(sessionId, userId); // 查找会话
      this.logger.debug(`确认已有会话: ${sessionId}`); // 记录日志
      return { session, isNewSession: false }; // 返回会话和是否是新会话
    }

    const sId = crypto.randomUUID(); // 生成新的会话 ID
    const session = await this.create( // 创建新会话
      userId,
      { title },
      sId,
      { titleStatus: options?.titleStatus ?? 'manual' },
    );
    await this.cacheSessionSnapshot(session); // 缓存会话快照
    this.logger.log(`聊天主链创建新会话: ${sId}`); // 记录日志

    return { session, isNewSession: true }; // 返回会话和是否是新会话
  }

  /**
   * 兼容旧调用；新聊天链路请使用 confirmOrCreateForChat。
   */
  async resolveOrCreate(
    userId: string,
    sessionId: string | undefined,
    title: string,
  ): Promise<{ sessionId: string; isNewSession: boolean }> {
    const { session, isNewSession } = await this.confirmOrCreateForChat(userId, sessionId, title);
    return { sessionId: session.id, isNewSession };
  }
}
