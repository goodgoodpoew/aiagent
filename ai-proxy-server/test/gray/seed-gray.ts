import { PrismaClient } from '@prisma/client';
import { assertGrayEnv } from './assert-gray-env';
import { encryptGrayCredential } from './gray-crypto';

const prisma = new PrismaClient();
const GRAY_USER_ID = process.env.GRAY_USER_ID || '9a74c501-9d60-441b-b1ba-7b3eb469dce0';
const GRAY_PROVIDER_NAME = 'gray-mock-provider';
const GRAY_MODEL_NAME = 'gray-mock-model';
const GRAY_ALT_MODEL_NAME = 'gray-alt-model';

async function main() {
  assertGrayEnv();

  await prisma.user.upsert({
    where: { id: GRAY_USER_ID },
    update: {
      username: 'gray-user',
      email: 'gray-user@example.test',
      passwordHash: 'unusable',
    },
    create: {
      id: GRAY_USER_ID,
      username: 'gray-user',
      email: 'gray-user@example.test',
      passwordHash: 'unusable',
    },
  });

  const provider = await prisma.modelProvider.upsert({
    where: { name: GRAY_PROVIDER_NAME },
    update: {
      displayName: '灰度 Mock Provider',
      providerType: 'custom',
      baseUrl: process.env.GRAY_AI_BASE_URL || 'http://127.0.0.1:3101/v1',
      adapterType: 'openai-compatible',
      enabled: true,
      systemBuiltIn: false,
      configSchema: {
        fields: [{ name: 'apiKey', label: 'API Key', type: 'password', required: true }],
      },
    },
    create: {
      name: GRAY_PROVIDER_NAME,
      displayName: '灰度 Mock Provider',
      providerType: 'custom',
      baseUrl: process.env.GRAY_AI_BASE_URL || 'http://127.0.0.1:3101/v1',
      adapterType: 'openai-compatible',
      enabled: true,
      systemBuiltIn: false,
      configSchema: {
        fields: [{ name: 'apiKey', label: 'API Key', type: 'password', required: true }],
      },
    },
  });

  await prisma.modelProviderCredential.upsert({
    where: { providerId_name: { providerId: provider.id, name: 'gray-mock-key' } },
    update: {
      encryptedConfig: encryptGrayCredential({
        apiKey: process.env.GRAY_AI_API_KEY || 'test-only',
      }),
      enabled: true,
      isDefault: true,
    },
    create: {
      providerId: provider.id,
      name: 'gray-mock-key',
      encryptedConfig: encryptGrayCredential({
        apiKey: process.env.GRAY_AI_API_KEY || 'test-only',
      }),
      enabled: true,
      isDefault: true,
    },
  });

  await prisma.providerModel.upsert({
    where: {
      providerId_modelType_name: {
        providerId: provider.id,
        modelType: 'llm',
        name: GRAY_MODEL_NAME,
      },
    },
    update: {
      displayName: 'Gray Mock Model',
      features: ['chat', 'stream'],
      enabled: true,
      deprecated: false,
      isDefault: true,
    },
    create: {
      providerId: provider.id,
      modelType: 'llm',
      name: GRAY_MODEL_NAME,
      displayName: 'Gray Mock Model',
      features: ['chat', 'stream'],
      enabled: true,
      deprecated: false,
      isDefault: true,
    },
  });

  await prisma.providerModel.upsert({
    where: {
      providerId_modelType_name: {
        providerId: provider.id,
        modelType: 'llm',
        name: GRAY_ALT_MODEL_NAME,
      },
    },
    update: {
      displayName: 'Gray Alt Model',
      features: ['chat', 'stream'],
      enabled: true,
      deprecated: false,
      isDefault: false,
    },
    create: {
      providerId: provider.id,
      modelType: 'llm',
      name: GRAY_ALT_MODEL_NAME,
      displayName: 'Gray Alt Model',
      features: ['chat', 'stream'],
      enabled: true,
      deprecated: false,
      isDefault: false,
    },
  });

  console.log(
    `灰度 seed 完成: user=${GRAY_USER_ID}, provider=${GRAY_PROVIDER_NAME}, models=${GRAY_MODEL_NAME},${GRAY_ALT_MODEL_NAME}`,
  );
}

main()
  .catch((error) => {
    console.error('灰度 seed 失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
