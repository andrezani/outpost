import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { RedisService } from './redis.service';
import { RateLimitService } from './rate-limit.service';

@Global()
@Module({
  providers: [PrismaService, RedisService, RateLimitService],
  exports: [PrismaService, RedisService, RateLimitService],
})
export class CommonModule {}
