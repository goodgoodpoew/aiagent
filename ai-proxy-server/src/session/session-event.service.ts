import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import { RedisService } from '../redis/redis.service';

export type SessionRealtimeEventType =
  | 'session.created'
  | 'session.updated'
  | 'session.deleted'
  | 'session.title.updated'
  | 'message.created'
  | 'message.completed'
  | 'message.failed';

export interface RealtimeSessionEvent {
  eventType: SessionRealtimeEventType;
  userId: string;
  sessionId: string;
  aggregateVersion: number;
  occurredAt: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class SessionEventService {
  private readonly logger = new Logger(SessionEventService.name);
  private readonly maxLen = 5000;

  constructor(private readonly redis: RedisService) {}

  private streamKey(userId: string) {
    return `user:${userId}:session-events`;
  }

  async publish(event: RealtimeSessionEvent): Promise<string | undefined> {
    try {
      const eventId = await this.redis.client.xadd(
        this.streamKey(event.userId),
        'MAXLEN',
        '~',
        this.maxLen,
        '*',
        'eventType',
        event.eventType,
        'userId',
        event.userId,
        'sessionId',
        event.sessionId,
        'aggregateVersion',
        String(event.aggregateVersion),
        'occurredAt',
        event.occurredAt,
        'payload',
        JSON.stringify(event.payload),
      );
      return eventId ?? undefined;
    } catch (err) {
      // Redis Streams 是实时增强通道，失败不能打断聊天主链。
      this.logger.warn(
        `写入会话事件失败: user=${event.userId}, event=${event.eventType}, session=${event.sessionId}`,
        err,
      );
      return undefined;
    }
  }

  async publishTitleUpdated(
    userId: string,
    session: {
      id: string;
      title: string | null;
      titleStatus?: string;
      version?: number;
      updatedAt: Date | string;
    },
  ): Promise<void> {
    const updatedAt =
      session.updatedAt instanceof Date ? session.updatedAt.toISOString() : session.updatedAt;

    await this.publish({
      eventType: 'session.title.updated',
      userId,
      sessionId: session.id,
      aggregateVersion: session.version ?? 1,
      occurredAt: updatedAt,
      payload: {
        sessionId: session.id,
        title: session.title,
        titleStatus: session.titleStatus ?? 'auto',
        updatedAt,
        version: session.version ?? 1,
      },
    });
  }

  emitTitleUpdated(
    userId: string,
    session: {
      id: string;
      title: string | null;
      titleStatus?: string;
      version?: number;
      updatedAt: Date | string;
    },
  ): void {
    void this.publishTitleUpdated(userId, session);
  }

  registerClient(userId: string, res: Response, lastEventId?: string): void {
    const key = this.streamKey(userId);
    const client = this.redis.client.duplicate();
    let cursor = lastEventId || '$';
    let closed = false;

    res.write(': connected\n\n');

    res.on('close', () => {
      closed = true;
      client.disconnect();
    });

    const readLoop = async () => {
      try {
        await client.connect();
      } catch {
        // ioredis duplicate 可能已经自动连接，继续进入读取循环即可。
      }

      while (!closed && !res.writableEnded) {
        try {
          const result = await client.xread('BLOCK', 30000, 'STREAMS', key, cursor);

          if (!result) {
            res.write(': heartbeat\n\n');
            continue;
          }

          const streams = result as Array<[string, Array<[string, string[]]>]>;
          for (const [, entries] of streams) {
            for (const [id, fields] of entries) {
              cursor = id;
              this.writeStreamEntry(res, id, fields);
            }
          }
        } catch (err) {
          if (!closed) {
            this.logger.warn(`读取会话事件失败: user=${userId}`, err);
            res.write(`event: error\ndata: ${JSON.stringify({ code: 'SESSION_EVENT_STREAM_ERROR' })}\n\n`);
          }
          break;
        }
      }

      if (!closed && !res.writableEnded) {
        res.end();
      }
      client.disconnect();
    };

    void readLoop();
  }

  private writeStreamEntry(res: Response, id: string, fields: string[]): void {
    const record: Record<string, string> = {};
    for (let i = 0; i < fields.length; i += 2) {
      record[fields[i]] = fields[i + 1];
    }

    const eventType = record.eventType;
    if (!eventType) return;

    let payload: unknown = {};
    try {
      payload = record.payload ? JSON.parse(record.payload) : {};
    } catch {
      payload = {};
    }

    res.write(`id: ${id}\nevent: ${eventType}\ndata: ${JSON.stringify(payload)}\n\n`);
  }
}
