import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { json } from 'express';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');

  // Raw body is required for Stripe webhook signature verification.
  // We capture it on every request and attach it as req.rawBody so the
  // Stripe webhook controller can verify the signature.
  const app = await NestFactory.create(AppModule);

  // Standard JSON body parser for all routes
  app.use(json({ limit: '10mb' }));

  // Stripe webhook needs raw body for signature verification.
  // We capture it via a custom express middleware on just that path.
  app.use(
    '/webhooks/stripe',
    json({
      verify: (req: import('http').IncomingMessage & { rawBody?: Buffer }, _res, buf) => {
        (req as { rawBody?: Buffer }).rawBody = buf;
      },
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-API-Key', 'Authorization'],
  });

  // ─── Swagger / OpenAPI ──────────────────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Outpost API')
    .setDescription(
      'The social media API built for AI agents. ' +
        'One endpoint. Six platforms. Native MCP support.\n\n' +
        '**Authentication:** Pass your API key via `X-API-Key` header or `Authorization: Bearer` header.\n\n' +
        'Get your API key: `npm run seed:admin`',
    )
    .setVersion('1.0')
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'X-API-Key')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  // GET /api → Swagger UI playground
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  logger.log(`🚀 Outpost API running on http://localhost:${port}/api/v1`);
  logger.log(`📖 Swagger UI:           http://localhost:${port}/api`);
  logger.log(`📄 OpenAPI JSON:         http://localhost:${port}/api-json`);
}

bootstrap();
