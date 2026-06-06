import { MESSAGE_PROTOCOL_V2 } from './dto/create-message.dto';
import { MessageService } from './message.service';
import { testAssistantMessage } from '../../test/fixtures/messages.fixture';
import { testSession } from '../../test/fixtures/sessions.fixture';

function createService() {
  const prisma = {
    message: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    session: {
      update: jest.fn(),
    },
  };
  return {
    prisma,
    service: new MessageService(prisma as any),
  };
}

describe('MessageService', () => {
  it('marks assistant v2 messages as done and preserves structured parts', async () => {
    const { service, prisma } = createService();
    prisma.message.findUnique.mockResolvedValue({ metadata: { requestId: 'req_1' } });
    prisma.message.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...testAssistantMessage, ...data }),
    );

    const result = await service.completeAssistantMessageV2({
      sessionId: testSession.id,
      id: testAssistantMessage.id,
      content: '完整回答',
      parts: [{ id: 'part_1', type: 'text', text: '完整回答', status: 'done' }],
      provider: 'openai',
      model: 'gpt-test',
      usage: { totalTokens: 12, source: 'estimated' },
    });

    expect(result.metadata).toMatchObject({
      protocol: MESSAGE_PROTOCOL_V2,
      status: 'done',
      requestId: 'req_1',
      provider: 'openai',
      model: 'gpt-test',
      usage: { totalTokens: 12 },
    });
    expect(prisma.session.update).toHaveBeenCalledWith({
      where: { id: testSession.id },
      data: { updatedAt: expect.any(Date) },
    });
  });

  it('writes a structured error part for failed assistant messages', async () => {
    const { service, prisma } = createService();
    prisma.message.findUnique.mockResolvedValue({
      metadata: {
        parts: [{ id: 'part_1', type: 'text', text: '半截', status: 'done' }],
      },
    });
    prisma.message.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...testAssistantMessage, ...data }),
    );

    const result = await service.failAssistantMessageV2({
      sessionId: testSession.id,
      id: testAssistantMessage.id,
      content: '上游服务异常',
      error: {
        code: 'UPSTREAM_HTTP_500',
        message: '上游服务异常',
        retryable: true,
        stage: 'provider_stream',
      },
      provider: 'openai',
      model: 'gpt-test',
    });

    expect(result.metadata).toMatchObject({
      protocol: MESSAGE_PROTOCOL_V2,
      status: 'failed',
      error: {
        code: 'UPSTREAM_HTTP_500',
        retryable: true,
        stage: 'provider_stream',
      },
    });
    const metadata = result.metadata as { parts: unknown[] };
    expect(metadata.parts).toEqual([
      { id: 'part_1', type: 'text', text: '半截', status: 'done' },
      expect.objectContaining({
        id: `${testAssistantMessage.id}:error:0`,
        type: 'error',
        code: 'UPSTREAM_HTTP_500',
      }),
    ]);
  });
});
