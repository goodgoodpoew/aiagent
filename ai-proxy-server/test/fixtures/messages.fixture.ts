import { testSession } from './sessions.fixture';

export const testUserMessage = {
  id: '33333333-3333-4333-8333-333333333333',
  sessionId: testSession.id,
  role: 'user',
  content: '你好',
};

export const testAssistantMessage = {
  id: '44444444-4444-4444-8444-444444444444',
  sessionId: testSession.id,
  role: 'assistant',
  content: '',
};
