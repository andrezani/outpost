import {
  Module,
  NestModule,
  MiddlewareConsumer,
  RequestMethod,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CommonModule } from './common/common.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { PostsModule } from './modules/posts/posts.module';
import { AuthModule } from './modules/auth/auth.module';
import { PublisherModule } from './modules/publisher/publisher.module';
import { PublishModule } from './modules/publish/publish.module';
import { AccountsModule } from './modules/accounts/accounts.module';
import { PlatformsModule } from './modules/platforms/platforms.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { ApiKeyMiddleware } from './middleware/api-key.middleware';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CommonModule,
    OrganizationsModule,
    IntegrationsModule,
    PostsModule,
    AuthModule,
    PublisherModule,
    // Phase 1: Unified publish + accounts + platforms + webhooks
    PublishModule,
    AccountsModule,
    PlatformsModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // Apply API key auth to all routes except organization creation, health
    consumer
      .apply(ApiKeyMiddleware)
      .exclude(
        { path: 'organizations', method: RequestMethod.POST },
        { path: 'auth/users', method: RequestMethod.POST },
        { path: 'health', method: RequestMethod.GET },
      )
      .forRoutes('*');
  }
}
