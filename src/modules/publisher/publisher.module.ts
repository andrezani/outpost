import { Module } from '@nestjs/common';
import { PublisherService } from './publisher.service';
import { SchedulerService } from './scheduler.service';
import { ProviderRegistry } from '../../providers/provider.registry';

@Module({
  providers: [ProviderRegistry, PublisherService, SchedulerService],
  exports: [PublisherService, ProviderRegistry],
})
export class PublisherModule {}
