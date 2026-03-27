import { Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { BillingModule } from '../billing/billing.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [CommonModule, BillingModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
