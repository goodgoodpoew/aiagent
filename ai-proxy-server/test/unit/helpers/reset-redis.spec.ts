import { resetRedis } from '../../helpers/reset-redis';

const ORIGINAL_ENV = process.env;

function setSafeEnv() {
  process.env = {
    ...ORIGINAL_ENV,
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
}

describe('resetRedis', () => {
  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('deletes only keys matching the test prefix', async () => {
    setSafeEnv();
    const redis = {
      scan: jest
        .fn()
        .mockResolvedValueOnce(['1', ['aiagent:test:a', 'aiagent:test:b']])
        .mockResolvedValueOnce(['0', []]),
      del: jest.fn().mockResolvedValue(2),
    };

    await resetRedis(redis);

    expect(redis.scan).toHaveBeenCalledWith('0', 'MATCH', 'aiagent:test:*', 'COUNT', 100);
    expect(redis.del).toHaveBeenCalledWith('aiagent:test:a', 'aiagent:test:b');
  });

  it('refuses to run without a test redis prefix', async () => {
    setSafeEnv();
    process.env.REDIS_KEY_PREFIX = 'aiproxy:';
    const redis = {
      scan: jest.fn(),
      del: jest.fn(),
    };

    await expect(resetRedis(redis)).rejects.toThrow('REDIS_KEY_PREFIX 必须包含 test');
    expect(redis.scan).not.toHaveBeenCalled();
  });
});
