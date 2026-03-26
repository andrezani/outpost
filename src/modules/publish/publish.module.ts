import { Module } from '@nestjs/common';
import { PublishController } from './publish.controller';
import { PublishService } from './publish.service';
import { CommonModule } from '../../common/common.module';
import { PublisherModule } from '../publisher/publisher.module';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [CommonModule, PublisherModule, WebhooksModule],
  controllers: [PublishController],
  providers: [PublishService],
  exports: [PublishService],
})
export class PublishModule {}
