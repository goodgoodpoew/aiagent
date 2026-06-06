import { assertTestEnv } from '../../helpers/assert-test-env';

const ORIGINAL_ENV = process.env;

function withEnv(env: NodeJS.ProcessEnv, run: () => void) {
  process.env = { ...ORIGINAL_ENV, ...env };
  try {
    run();
  } finally {
    process.env = ORIGINAL_ENV;
  }
}

const safeEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://aichat_test:aichat_test@localhost:5433/aichat_test',
  REDIS_KEY_PREFIX: 'aiagent:test:',
  UPLOAD_ROOT: 'uploads-test',
  AI_PROVIDER_MODE: 'mock',
  OPENAI_API_KEY: 'test-only',
  DEEPSEEK_API_KEY: 'test-only',
  GEMINI_API_KEY: 'test-only',
  CODEX_API_KEY: 'test-only',
};

describe('assertTestEnv', () => {
  it('accepts an isolated test environment', () => {
    withEnv(safeEnv, () => {
      expect(() => assertTestEnv()).not.toThrow();
    });
  });

  it('rejects non-test node environments', () => {
    withEnv({ ...safeEnv, NODE_ENV: 'development' }, () => {
      expect(() => assertTestEnv()).toThrow('NODE_ENV 必须为 test');
    });
  });

  it('rejects database urls without a test marker', () => {
    withEnv(
      { ...safeEnv, DATABASE_URL: 'postgresql://aichat:aichat@localhost:5432/aichat' },
      () => {
        expect(() => assertTestEnv()).toThrow('DATABASE_URL 必须指向测试库或临时 schema');
      },
    );
  });

  it('rejects real-looking provider keys', () => {
    withEnv({ ...safeEnv, OPENAI_API_KEY: 'sk-real-provider-key' }, () => {
      expect(() => assertTestEnv()).toThrow('OPENAI_API_KEY 疑似真实密钥');
    });
  });
});
