import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { MESSAGE_PROTOCOL_V2 } from '../../src/message/dto/create-message.dto';
import { MessageService } from '../../src/message/message.service';
import { SessionService } from '../../src/session/session.service';
import {
  closeIntegrationApp,
  createIntegrationApp,
  resetIntegrationState,
  type IntegrationAppContext,
} from '../helpers/create-integration-app';

const userA = {
  id: '11111111-1111-4111-8111-111111111111',
  username: 'integration-user-a',
  email: 'integration-user-a@example.test',
};

const userB = {
  id: '11111111-1111-4111-8111-111111111112',
  username: 'integration-user-b',
  email: 'integration-user-b@example.test',
};

async function seedUsers(context: IntegrationAppContext) {
  await context.prisma.user.createMany({
    data: [userA, userB],
    skipDuplicates: true,
  });
}

describe('session/message integration', () => {
  let context: IntegrationAppContext;
  let sessionService: SessionService;
  let messageService: MessageService;

  beforeAll(async () => {
    context = await createIntegrationApp();
    sessionService = context.app.get(SessionService);
    messageService = context.app.get(MessageService);
  });

  beforeEach(async () => {
    await resetIntegrationState(context);
    await seedUsers(context);
  });

  afterAll(async () => {
    await closeIntegrationApp(context);
  });

  it('creates, lists, updates and soft-deletes sessions with user isolation', async () => {
    const first = await sessionService.create(userA.id, { title: '第一会话' });
    const second = await sessionService.create(userA.id, { title: '第二会话' });
    await sessionService.create(userB.id, { title: '其他用户会话' });

    const firstPage = await sessionService.findAll(userA.id, { limit: 1 });
    expect(firstPage.sessions).toHaveLength(1);
    expect(firstPage.sessions[0].userId).toBe(userA.id);
    expect(firstPage.cursor).toEqual(expect.any(String));

    const secondPage = await sessionService.findAll(userA.id, {
      limit: 10,
      cursor: firstPage.cursor ?? undefined,
    });
    expect(secondPage.sessions.map((session) => session.id)).toContain(first.id);

    const updated = await sessionService.update(second.id, userA.id, { title: '改名会话' });
    expect(updated).toMatchObject({
      id: second.id,
      title: '改名会话',
      titleStatus: 'manual',
      version: 2,
    });

    await expect(sessionService.findOne(second.id, userB.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    await sessionService.softDelete(second.id, userA.id);
    await expect(sessionService.findOne(second.id, userA.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('creates messages, paginates history and persists done/failed v2 metadata', async () => {
    const session = await sessionService.create(userA.id, { title: '消息会话' });
    const userMessage = await messageService.create(session.id, {
      role: 'user',
      content: '你好',
      metadata: { requestId: 'req_user' },
    });
    const assistantMessage = await messageService.create(
      session.id,
      {
        role: 'assistant',
        content: '',
        metadata: { requestId: 'req_done' },
      },
      randomUUID(),
    );
    const failedAssistant = await messageService.create(
      session.id,
      {
        role: 'assistant',
        content: '',
        metadata: {
          requestId: 'req_failed',
          parts: [{ id: 'text_1', type: 'text', text: '半截', status: 'done' }],
        },
      },
      randomUUID(),
    );

    const completed = await messageService.completeAssistantMessageV2({
      sessionId: session.id,
      id: assistantMessage.id,
      content: '完整回答',
      parts: [{ id: 'text_done', type: 'text', text: '完整回答', status: 'done' }],
      provider: 'test-provider',
      model: 'test-model',
      usage: { totalTokens: 18, source: 'estimated' },
    });
    expect(completed.metadata).toMatchObject({
      protocol: MESSAGE_PROTOCOL_V2,
      status: 'done',
      requestId: 'req_done',
      provider: 'test-provider',
      model: 'test-model',
      usage: { totalTokens: 18 },
    });

    const failed = await messageService.failAssistantMessageV2({
      sessionId: session.id,
      id: failedAssistant.id,
      content: '上游异常',
      error: {
        code: 'UPSTREAM_HTTP_500',
        message: '上游异常',
        retryable: true,
        stage: 'provider_stream',
      },
      provider: 'test-provider',
      model: 'test-model',
    });
    expect(failed.metadata).toMatchObject({
      protocol: MESSAGE_PROTOCOL_V2,
      status: 'failed',
      error: {
        code: 'UPSTREAM_HTTP_500',
        retryable: true,
        stage: 'provider_stream',
      },
    });
    const failedMetadata = failed.metadata as Prisma.JsonObject;
    expect(failedMetadata.parts).toEqual([
      expect.objectContaining({ type: 'text', text: '半截' }),
      expect.objectContaining({ type: 'error', code: 'UPSTREAM_HTTP_500' }),
    ]);

    const page = await messageService.findBySessionId(session.id, undefined, 2);
    expect(page.messages.map((message) => message.id)).toEqual([
      userMessage.id,
      assistantMessage.id,
    ]);
    expect(page.cursor).toEqual(expect.any(String));

    const nextPage = await messageService.findBySessionId(session.id, page.cursor ?? undefined, 10);
    expect(nextPage.messages.map((message) => message.id)).toContain(userMessage.id);
  });
});
