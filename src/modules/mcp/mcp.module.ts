import { Module } from '@nestjs/common';
import { McpController } from './mcp.controller';
import { McpService } from './mcp.service';
import { AccountsModule } from '../accounts/accounts.module';
import { PublishModule } from '../publish/publish.module';
import { PostsModule } from '../posts/posts.module';

@Module({
  imports: [AccountsModule, PublishModule, PostsModule],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}
