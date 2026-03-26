import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { RateLimitService } from './rate-limit.service';
import { EmailService } from './email.service';

@Global()
@Module({
  providers: [PrismaService, RedisService, RateLimitService, EmailService],
  exports: [PrismaService, RedisService, RateLimitService, EmailService],
})
export class CommonModule {}
