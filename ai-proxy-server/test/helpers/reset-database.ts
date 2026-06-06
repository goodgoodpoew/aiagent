import { PrismaService } from '../../src/prisma/prisma.service';
import { assertTestEnv } from './assert-test-env';

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

export async function resetDatabase(prisma: PrismaService) {
  assertTestEnv();
  const quotedTables = TABLES.map((table) => `"${table}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`);
}
