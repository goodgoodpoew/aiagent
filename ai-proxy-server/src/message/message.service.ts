import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { CreateMessageDto } from './dto/create-message.dto';

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  async create(sessionId: string, dto: CreateMessageDto, id?: string) {
    const message = await this.prisma.message.create({
      data: {
        ...(id ? { id } : {}),
        sessionId,
        role: dto.role,
        content: dto.content,
        metadata: (dto.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });

    // 更新会话的 updatedAt，触发侧边栏排序
    await this.prisma.session.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });

    return message;
  }

  async update(id: string, dto: CreateMessageDto) {
    return this.prisma.message.update({
      where: { id },
      data: {
        role: dto.role,
        content: dto.content,
        metadata: (dto.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });
  }

  async completeAssistantMessage(sessionId: string, id: string, content: string) {
    // assistant 消息在调用上游模型前已创建为空占位；完成时只更新内容和状态。
    return this.prisma.message.update({
      where: { id },
      data: {
        role: 'assistant',
        content,
        metadata: {
          status: 'done',
          completedAt: new Date().toISOString(),
        },
      },
    }).then(async (message) => {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });
      return message;
    });
  }

  async failAssistantMessage(
    sessionId: string,
    id: string,
    content: string,
    metadata: Record<string, unknown>,
  ) {
    return this.prisma.message.update({
      where: { id },
      data: {
        role: 'assistant',
        content,
        metadata: metadata as Prisma.InputJsonValue,
      },
    }).then(async (message) => {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });
      return message;
    });
  }

  async findBySessionId(sessionId: string, cursor?: string, limit = 50) {
    const messages = await this.prisma.message.findMany({
      where: {
        sessionId,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    const data = hasMore ? messages.slice(0, limit) : messages;

    return {
      messages: data,
      cursor: hasMore ? data[data.length - 1].createdAt.toISOString() : null,
    };
  }
}
