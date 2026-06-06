import { INestApplication, Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';

export async function createTestApp(params: {
  imports?: Array<Type<unknown>>;
  providers?: unknown[];
  controllers?: Type<unknown>[];
  overrides?: Array<{ provide: unknown; useValue: unknown }>;
}): Promise<INestApplication> {
  const moduleBuilder = Test.createTestingModule({
    imports: params.imports ?? [],
    providers: params.providers ?? [],
    controllers: params.controllers ?? [],
  });

  for (const override of params.overrides ?? []) {
    moduleBuilder.overrideProvider(override.provide).useValue(override.useValue);
  }

  const moduleRef = await moduleBuilder.compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  return app;
}
