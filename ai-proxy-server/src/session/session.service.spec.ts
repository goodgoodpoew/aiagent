import { NotFoundException } from '@nestjs/common';
import { SessionService } from './session.service';
import { testSession } from '../../test/fixtures/sessions.fixture';
import { testUser } from '../../test/fixtures/users.fixture';

function createService() {
  const prisma = {
    session: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    message: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
    uploadedFile: {
      findMany: jest.fn(),
    },
    sessionFile: {
      createMany: jest.fn(),
    },
    messageFile: {
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };
  const cache = {
    getSession: jest.fn(),
    cacheSession: jest.fn(),
    invalidateSession: jest.fn(),
  };
  return {
    prisma,
    cache,
    service: new SessionService(prisma as any, cache as any),
  };
}

describe('SessionService', () => {
  it('blocks cross-user access even when cache contains the session id', async () => {
    const { service, cache, prisma } = createService();
    cache.getSession.mockResolvedValue({ ...testSession, userId: 'other-user' });

    await expect(service.findOne(testSession.id, testUser.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.session.findFirst).not.toHaveBeenCalled();
  });

  it('updates title, bumps version and refreshes cache', async () => {
    const { service, cache, prisma } = createService();
    const now = new Date('2026-06-06T00:00:00.000Z');
    cache.getSession.mockResolvedValue(null);
    prisma.session.findFirst.mockResolvedValue({
      ...testSession,
      isDeleted: false,
      titleStatus: 'manual',
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    prisma.session.update.mockResolvedValue({
      ...testSession,
      title: '新标题',
      titleStatus: 'manual',
      version: 2,
      createdAt: now,
      updatedAt: now,
    });

    const result = await service.update(testSession.id, testUser.id, { title: '新标题' });

    expect(result.title).toBe('新标题');
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: testSession.id },
      data: { title: '新标题', titleStatus: 'manual', version: { increment: 1 } },
    });
    expect(cache.cacheSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: testSession.id, title: '新标题', version: 2 }),
    );
  });

  it('confirms existing chat sessions without creating hidden forks', async () => {
    const { service, cache, prisma } = createService();
    const now = new Date('2026-06-06T00:00:00.000Z');
    cache.getSession.mockResolvedValue(null);
    prisma.session.findFirst.mockResolvedValue({
      ...testSession,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    });

    const result = await service.confirmOrCreateForChat(testUser.id, testSession.id, '默认标题');

    expect(result).toEqual({
      session: expect.objectContaining({ id: testSession.id }),
      isNewSession: false,
    });
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
});
