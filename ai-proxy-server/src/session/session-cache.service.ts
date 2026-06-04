import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ConfigService } from '@nestjs/config';

export interface CachedSession {
  id: string;
  userId: string;
  title: string | null;
  titleStatus?: string;
  version?: number;
  createdAt?: string;
  updatedAt: string;
}

export interface CachedMessage {
  id: string;
  role: string;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class SessionCacheService {
  private readonly logger = new Logger(SessionCacheService.name);
  private readonly sessionTtl: number;

  private readonly SESSION_KEY = 'session:meta:';
  private readonly MESSAGES_KEY = 'session:msgs:';
  private readonly USER_SESSIONS = 'user:sessions:';

  constructor(
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {
    this.sessionTtl = this.config.get<number>('cache.sessionTtl', 3600);
  }

  async cacheSession(session: CachedSession): Promise<void> {
    const key = this.SESSION_KEY + session.id;
    await this.redis.setJson(key, session, this.sessionTtl);
    await this.redis.client.sadd(this.USER_SESSIONS + session.userId, session.id);
    await this.redis.expire(this.USER_SESSIONS + session.userId, this.sessionTtl);
  }

  async getSession(id: string): Promise<CachedSession | null> {
    return this.redis.getJson<CachedSession>(this.SESSION_KEY + id);
  }

  async invalidateSession(id: string, userId: string): Promise<void> {
    await this.redis.del(this.SESSION_KEY + id, this.MESSAGES_KEY + id);
    await this.redis.client.srem(this.USER_SESSIONS + userId, id);
  }

  async cacheMessages(sessionId: string, messages: CachedMessage[]): Promise<void> {
    await this.redis.setJson(this.MESSAGES_KEY + sessionId, messages, this.sessionTtl);
  }

  async getMessages(sessionId: string): Promise<CachedMessage[] | null> {
    return this.redis.getJson<CachedMessage[]>(this.MESSAGES_KEY + sessionId);
  }

  async invalidateMessages(sessionId: string): Promise<void> {
    await this.redis.del(this.MESSAGES_KEY + sessionId);
  }
}
