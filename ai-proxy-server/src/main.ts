import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const config = app.get(ConfigService);
  const corsOrigins = config.get<string[]>('cors.origins', []);
  if (process.env.NODE_ENV === 'production' && corsOrigins.includes('*')) {
    throw new Error('生产环境禁止在 CORS credentials=true 时使用 wildcard origin');
  }

  app.enableCors({
    origin: corsOrigins,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-User-Id',
      'X-File-Name',
      'X-Session-Id',
      'X-Request-Id',
      'Last-Event-ID',
    ],
    credentials: true,
  });

  const port = config.get<number>('port', 3001);
  await app.listen(port);
  console.log(`AI Proxy Server running on http://localhost:${port}`);
}

bootstrap();
