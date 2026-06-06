const DANGEROUS_DATABASE_MARKERS = ['prod', 'production'];
const DANGEROUS_KEY_MARKERS = ['sk-', 'aiza', 'real'];

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`灰度环境变量缺失: ${name}`);
  }
  return value;
}

function assertIncludesGray(name: string, value: string) {
  if (!value.toLowerCase().includes('gray')) {
    throw new Error(`${name} 必须包含 gray，当前值: ${value}`);
  }
}

function assertNoProductionDatabase(databaseUrl: string) {
  const normalized = databaseUrl.toLowerCase();
  assertIncludesGray('DATABASE_URL', normalized);
  const pathAndQuery = normalized.split('@').pop() ?? normalized;
  const dangerous = DANGEROUS_DATABASE_MARKERS.some((marker) => pathAndQuery.includes(marker));
  if (dangerous) {
    throw new Error(`DATABASE_URL 疑似生产库，已阻止灰度任务启动: ${databaseUrl}`);
  }
}

function assertNoRealProviderKey(name: string) {
  const value = process.env[name];
  if (!value) return;

  const normalized = value.toLowerCase();
  const looksReal = DANGEROUS_KEY_MARKERS.some((marker) => normalized.includes(marker));
  if (value !== 'test-only' && looksReal) {
    throw new Error(`${name} 疑似真实密钥，灰度 mock 流程禁止使用真实 provider key`);
  }
}

export function assertGrayEnv() {
  if (process.env.NODE_ENV !== 'gray') {
    throw new Error(`NODE_ENV 必须为 gray，当前值: ${process.env.NODE_ENV ?? '<empty>'}`);
  }

  assertNoProductionDatabase(requireEnv('DATABASE_URL'));
  assertIncludesGray('REDIS_KEY_PREFIX', requireEnv('REDIS_KEY_PREFIX'));
  assertIncludesGray('UPLOAD_ROOT', requireEnv('UPLOAD_ROOT'));

  if (process.env.AI_PROVIDER_MODE !== 'mock') {
    throw new Error(
      `AI_PROVIDER_MODE 必须为 mock，当前值: ${process.env.AI_PROVIDER_MODE ?? '<empty>'}`,
    );
  }

  [
    'OPENAI_API_KEY',
    'DEEPSEEK_API_KEY',
    'CLAUDE_API_KEY',
    'GEMINI_API_KEY',
    'CODEX_API_KEY',
  ].forEach(assertNoRealProviderKey);
}
