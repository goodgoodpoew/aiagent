const DANGEROUS_DATABASE_MARKERS = ['prod', 'production', 'aichat'];
const DANGEROUS_KEY_MARKERS = ['sk-', 'aiza', 'real'];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`测试环境变量缺失: ${name}`);
  }
  return value;
}

function assertIncludesTest(name: string, value: string) {
  if (!value.toLowerCase().includes('test')) {
    throw new Error(`${name} 必须包含 test，当前值: ${value}`);
  }
}

function assertNoProductionDatabase(databaseUrl: string) {
  const normalized = databaseUrl.toLowerCase();
  const hasTestMarker = normalized.includes('test') || normalized.includes('schema=');
  if (!hasTestMarker) {
    throw new Error(`DATABASE_URL 必须指向测试库或临时 schema: ${databaseUrl}`);
  }

  const pathAndQuery = normalized.split('@').pop() ?? normalized;
  const dangerous = DANGEROUS_DATABASE_MARKERS.some(
    (marker) => pathAndQuery.includes(marker) && !pathAndQuery.includes(`${marker}_test`),
  );
  if (dangerous) {
    throw new Error(`DATABASE_URL 疑似生产或开发库，已阻止测试启动: ${databaseUrl}`);
  }
}

function assertNoRealProviderKey(name: string) {
  const value = process.env[name];
  if (!value) return;

  const normalized = value.toLowerCase();
  const looksReal = DANGEROUS_KEY_MARKERS.some((marker) => normalized.includes(marker));
  if (value !== 'test-only' && looksReal) {
    throw new Error(`${name} 疑似真实密钥，普通测试禁止使用真实 provider key`);
  }
}

export function assertTestEnv() {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error(`NODE_ENV 必须为 test，当前值: ${process.env.NODE_ENV ?? '<empty>'}`);
  }

  assertNoProductionDatabase(requireEnv('DATABASE_URL'));
  assertIncludesTest('REDIS_KEY_PREFIX', requireEnv('REDIS_KEY_PREFIX'));
  assertIncludesTest('UPLOAD_ROOT', requireEnv('UPLOAD_ROOT'));

  if (process.env.AI_PROVIDER_MODE !== 'mock') {
    throw new Error(
      `AI_PROVIDER_MODE 必须为 mock，当前值: ${process.env.AI_PROVIDER_MODE ?? '<empty>'}`,
    );
  }

  ['OPENAI_API_KEY', 'DEEPSEEK_API_KEY', 'GEMINI_API_KEY', 'CODEX_API_KEY'].forEach(
    assertNoRealProviderKey,
  );
}

export function registerTestEnvAssertion() {
  beforeAll(() => {
    assertTestEnv();
  });
}
