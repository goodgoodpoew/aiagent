import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

const MODEL_CREDENTIAL_SECRET =
  process.env.MODEL_CREDENTIAL_SECRET || 'dev-model-credential-secret';

function encryptConfig(config: Record<string, unknown>): string {
  const key = crypto.createHash('sha256').update(MODEL_CREDENTIAL_SECRET).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify(config), 'utf8'),
    cipher.final(),
  ]);

  return Buffer.from(
    JSON.stringify({
      v: 1,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    }),
    'utf8',
  ).toString('base64');
}

const configSchema = {
  fields: [
    { name: 'apiKey', label: 'API Key', type: 'password', required: true },
    { name: 'baseUrl', label: 'Base URL', type: 'text', required: false },
  ],
};

interface SeedProvider {
  name: string;
  displayName: string;
  baseUrl: string;
  adapterType: string;
  env: string;
  providerType?: string;
  models: string[];
  features?: string[];
}

const providers: SeedProvider[] = [
  {
    name: 'openai',
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    adapterType: 'openai-compatible',
    env: 'OPENAI_API_KEY',
    models: ['gpt-4o', 'gpt-4o-mini'],
    features: ['chat', 'stream', 'tools', 'reasoning-effort', 'json-mode'],
  },
  {
    name: 'deepseek',
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    adapterType: 'openai-compatible',
    env: 'DEEPSEEK_API_KEY',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    features: ['chat', 'stream', 'reasoning'],
  },
  {
    name: 'moonshot',
    displayName: 'Moonshot',
    baseUrl: 'https://api.moonshot.cn/v1',
    adapterType: 'openai-compatible',
    env: 'MOONSHOT_API_KEY',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k'],
  },
  {
    name: 'qwen',
    displayName: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    adapterType: 'openai-compatible',
    env: 'QWEN_API_KEY',
    models: ['qwen-plus', 'qwen-turbo'],
  },
  {
    name: 'zhipu',
    displayName: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    adapterType: 'openai-compatible',
    env: 'ZHIPU_API_KEY',
    models: ['glm-4-plus', 'glm-4-flash'],
  },
  {
    name: 'minimax',
    displayName: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    adapterType: 'openai-compatible',
    env: 'MINIMAX_API_KEY',
    models: ['abab6.5s-chat', 'abab6.5g-chat'],
  },
  {
    name: 'openrouter',
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    adapterType: 'openai-compatible',
    env: 'OPENROUTER_API_KEY',
    models: ['openai/gpt-4o-mini', 'anthropic/claude-3.5-sonnet'],
  },
  {
    name: 'together',
    displayName: 'Together AI',
    baseUrl: 'https://api.together.xyz/v1',
    adapterType: 'openai-compatible',
    env: 'TOGETHER_API_KEY',
    models: ['meta-llama/Llama-3.3-70B-Instruct-Turbo'],
  },
  {
    name: 'siliconflow',
    displayName: 'SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    adapterType: 'openai-compatible',
    env: 'SILICONFLOW_API_KEY',
    models: ['deepseek-ai/DeepSeek-V3', 'Qwen/Qwen2.5-72B-Instruct'],
  },
  {
    name: 'azure-openai',
    displayName: 'Azure OpenAI',
    baseUrl: '',
    adapterType: 'openai-compatible',
    env: 'AZURE_OPENAI_API_KEY',
    models: ['gpt-4o'],
  },
  {
    name: 'claude',
    displayName: 'Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    adapterType: 'anthropic',
    env: 'CLAUDE_API_KEY',
    models: ['claude-3-5-sonnet-latest'],
    features: ['chat', 'stream'],
  },
  {
    name: 'gemini',
    displayName: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    adapterType: 'gemini',
    env: 'GEMINI_API_KEY',
    models: ['gemini-2.5-flash'],
    features: ['chat', 'stream'],
  },
  {
    name: 'custom',
    displayName: '自定义 OpenAI-compatible',
    baseUrl: '',
    adapterType: 'openai-compatible',
    env: '',
    providerType: 'custom',
    models: ['custom-model'],
  },
];

async function main() {
  console.log('开始导入模型供应商种子数据...');

  for (const item of providers) {
    const provider = await prisma.modelProvider.upsert({
      where: { name: item.name },
      update: {
        displayName: item.displayName,
        baseUrl: item.baseUrl,
        adapterType: item.adapterType,
        providerType: item.providerType ?? 'system',
        systemBuiltIn: item.providerType !== 'custom',
        configSchema,
        enabled: true,
      },
      create: {
        name: item.name,
        displayName: item.displayName,
        baseUrl: item.baseUrl,
        adapterType: item.adapterType,
        providerType: item.providerType ?? 'system',
        systemBuiltIn: item.providerType !== 'custom',
        configSchema,
        enabled: true,
      },
    });

    const apiKey = item.env ? process.env[item.env] : undefined;
    if (apiKey) {
      await prisma.modelProviderCredential.upsert({
        where: { providerId_name: { providerId: provider.id, name: '默认凭据' } },
        update: {
          encryptedConfig: encryptConfig({ apiKey }),
          enabled: true,
          isDefault: true,
        },
        create: {
          providerId: provider.id,
          name: '默认凭据',
          encryptedConfig: encryptConfig({ apiKey }),
          enabled: true,
          isDefault: true,
        },
      });
    }

    for (const [index, modelName] of item.models.entries()) {
      await prisma.providerModel.upsert({
        where: {
          providerId_modelType_name: {
            providerId: provider.id,
            modelType: 'llm',
            name: modelName,
          },
        },
        update: {
          displayName: modelName,
          features: item.features ?? ['chat', 'stream'],
          isDefault: index === 0,
          enabled: true,
        },
        create: {
          providerId: provider.id,
          modelType: 'llm',
          name: modelName,
          displayName: modelName,
          features: item.features ?? ['chat', 'stream'],
          isDefault: index === 0,
          enabled: true,
        },
      });
    }
  }

  console.log(`已导入 ${providers.length} 个模型供应商`);
}

main()
  .catch((error) => {
    console.error('种子数据导入失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
