import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import {
  CreateMessageDto,
  MESSAGE_PROTOCOL_V2,
  type MessageMetadataV2,
  type TokenUsage,
} from './dto/create-message.dto';
import type { ErrorMessagePart, MessagePart } from '@/streaming/protocol/message-part.types';

function toMetadataObject(metadata: Prisma.JsonValue | null | undefined): MessageMetadataV2 {
  if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return metadata as MessageMetadataV2;
  }
  return {};
}

function toJson(metadata: MessageMetadataV2): Prisma.InputJsonValue {
  return metadata as unknown as Prisma.InputJsonValue;
}

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
    const current = await this.prisma.message.findUnique({
      where: { id },
      select: { metadata: true },
    });
    const metadata = {
      ...toMetadataObject(current?.metadata),
      status: 'done',
      completedAt: new Date().toISOString(),
    } satisfies MessageMetadataV2;

    return this.prisma.message.update({
      where: { id },
      data: {
        role: 'assistant',
        content,
        metadata: toJson(metadata),
      },
    }).then(async (message) => {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });
      return message;
    });
  }

  async completeAssistantMessageV2(params: {
    sessionId: string;
    id: string;
    content: string;
    parts: MessagePart[];
    provider?: string;
    model?: string;
    usage?: TokenUsage;
  }) {
    const { sessionId, id, content, parts, provider, model, usage } = params;
    const current = await this.prisma.message.findUnique({
      where: { id },
      select: { metadata: true },
    });
    const metadata = {
      ...toMetadataObject(current?.metadata),
      protocol: MESSAGE_PROTOCOL_V2,
      status: 'done',
      parts,
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      ...(usage ? { usage } : {}),
      completedAt: new Date().toISOString(),
    } satisfies MessageMetadataV2;

    // content 是面向旧接口和列表渲染的文本投影；结构化内容统一保存在 metadata.parts。
    return this.prisma.message
      .update({
        where: { id },
        data: {
          role: 'assistant',
          content,
          metadata: toJson(metadata),
        },
      })
      .then(async (message) => {
        await this.prisma.session.update({
          where: { id: sessionId },
          data: { updatedAt: new Date() },
        });
        return message;
      });
  }

  async completeAssistantMessageWithParts(
    sessionId: string,
    id: string,
    content: string,
    parts: MessagePart[],
  ) {
    // 兼容计划 02 的旧方法名，内部转到 v2 消息协议，避免调用方分批迁移时协议不一致。
    return this.completeAssistantMessageV2({ sessionId, id, content, parts });
  }

  async failAssistantMessage(
    sessionId: string,
    id: string,
    content: string,
    metadata: Record<string, unknown>,
  ) {
    const current = await this.prisma.message.findUnique({
      where: { id },
      select: { metadata: true },
    });
    const nextMetadata = {
      ...toMetadataObject(current?.metadata),
      ...metadata,
      status: 'failed',
    } satisfies MessageMetadataV2;

    return this.prisma.message.update({
      where: { id },
      data: {
        role: 'assistant',
        content,
        metadata: toJson(nextMetadata),
      },
    }).then(async (message) => {
      await this.prisma.session.update({
        where: { id: sessionId },
        data: { updatedAt: new Date() },
      });
      return message;
    });
  }

  async failAssistantMessageV2(params: {
    sessionId: string;
    id: string;
    content: string;
    error: {
      code: string;
      message: string;
      retryable: boolean;
      stage?: string;
      detail?: unknown;
    };
    provider?: string;
    model?: string;
  }) {
    const { sessionId, id, content, error, provider, model } = params;
    const current = await this.prisma.message.findUnique({
      where: { id },
      select: { metadata: true },
    });
    const currentMetadata = toMetadataObject(current?.metadata);
    const errorPart: ErrorMessagePart = {
      id: `${id}:error:0`,
      type: 'error',
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(error.stage ? { stage: error.stage } : {}),
    };
    const existingParts = Array.isArray(currentMetadata.parts) ? currentMetadata.parts : [];
    const metadata = {
      ...currentMetadata,
      protocol: MESSAGE_PROTOCOL_V2,
      status: 'failed',
      parts: [...existingParts.filter((part) => part.type !== 'error'), errorPart],
      error: {
        code: error.code,
        message: error.message,
        retryable: error.retryable,
        ...(error.stage ? { stage: error.stage } : {}),
        ...(error.detail !== undefined ? { detail: error.detail } : {}),
      },
      ...(provider ? { provider } : {}),
      ...(model ? { model } : {}),
      failedAt: new Date().toISOString(),
    } satisfies MessageMetadataV2;

    // 失败消息同样保留用户友好 content，error part 供刷新后的结构化渲染和排错使用。
    return this.prisma.message.update({
      where: { id },
      data: {
        role: 'assistant',
        content,
        metadata: toJson(metadata),
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
