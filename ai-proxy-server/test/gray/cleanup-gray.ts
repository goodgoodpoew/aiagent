import * as fs from 'fs/promises';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { assertGrayEnv } from './assert-gray-env';

const prisma = new PrismaClient();

const TABLES = [
  'message_files',
  'session_files',
  'files',
  'chat_requests',
  'messages',
  'sessions',
  'provider_models',
  'model_provider_credentials',
  'model_providers',
  'users',
];

async function main() {
  assertGrayEnv();
  const quotedTables = TABLES.map((table) => `"${table}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`);

  const uploadRoot = process.env.UPLOAD_ROOT;
  if (uploadRoot) {
    await fs.rm(path.resolve(process.cwd(), uploadRoot), { recursive: true, force: true });
  }

  console.log('灰度数据已清理');
}

main()
  .catch((error) => {
    console.error('灰度 cleanup 失败:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
