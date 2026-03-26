import { Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { CommonModule } from '../../common/common.module';
import { PublisherModule } from '../publisher/publisher.module';

@Module({
  imports: [CommonModule, PublisherModule],
  controllers: [AccountsController],
  providers: [AccountsService],
  exports: [AccountsService],
})
export class AccountsModule {}
