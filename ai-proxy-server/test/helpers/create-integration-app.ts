import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { RedisService } from '../../src/redis/redis.service';
import { assertTestEnv } from './assert-test-env';
import { resetDatabase } from './reset-database';
import { resetRedis } from './reset-redis';

export interface IntegrationAppContext {
  app: INestApplication;
  prisma: PrismaService;
  redis: RedisService;
}

export interface IntegrationAppOverride {
  provide: unknown;
  useValue: unknown;
}

export async function createIntegrationApp(
  options: { overrides?: IntegrationAppOverride[] } = {},
): Promise<IntegrationAppContext> {
  assertTestEnv();

  const moduleBuilder = Test.createTestingModule({
    imports: [AppModule],
  });

  for (const override of options.overrides ?? []) {
    moduleBuilder.overrideProvider(override.provide).useValue(override.useValue);
  }

  const moduleRef = await moduleBuilder.compile();

  const app = moduleRef.createNestApplication();
  await app.init();

  return {
    app,
    prisma: app.get(PrismaService),
    redis: app.get(RedisService),
  };
}

export async function resetIntegrationState(context: IntegrationAppContext) {
  await resetDatabase(context.prisma);
  await resetRedis(context.redis.client);
}

export async function closeIntegrationApp(context: IntegrationAppContext) {
  if (!context) return;
  await context.redis?.client.quit();
  await context.app?.close();
}
