import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ProviderRegistry } from '../../providers/provider.registry';
import {
  Post,
  PostIntegration,
  Integration,
  SocialPlatform,
  PostIntegrationStatus,
} from '@prisma/client';

type PostWithFullIntegrations = Post & {
  postIntegrations: (PostIntegration & {
    integration: Integration;
  })[];
};

export interface PublishSummary {
  postId: string;
  results: Array<{
    integrationId: string;
    platform: SocialPlatform;
    success: boolean;
    externalId?: string;
    url?: string;
    error?: string;
  }>;
}

/**
 * PublisherService: the core publishing engine.
 *
 * Responsibilities:
 * - Dispatch posts to social providers
 * - Handle token refresh on 401
 * - Update PostIntegration status (PUBLISHED / FAILED)
 * - Mark Post as PUBLISHED (all succeeded) or FAILED (all failed)
 */
@Injectable()
export class PublisherService {
  private readonly logger = new Logger(PublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
  ) {}

  /**
   * Publish a post to all its connected integrations.
   * Called by the scheduler when a post is due.
   */
  async publishPost(postId: string): Promise<PublishSummary> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: {
        postIntegrations: {
          include: { integration: true },
          where: { status: PostIntegrationStatus.PENDING },
        },
      },
    });

    if (!post) throw new Error(`Post ${postId} not found`);
    if (post.postIntegrations.length === 0) {
      this.logger.warn(`Post ${postId} has no pending integrations — skipping`);
      return { postId, results: [] };
    }

    const results: PublishSummary['results'] = [];

    for (const pi of (post as PostWithFullIntegrations).postIntegrations) {
      const result = await this.publishToIntegration(post, pi);
      results.push(result);
    }

    // Determine overall post status
    const allFailed = results.every((r) => !r.success);
    const anySucceeded = results.some((r) => r.success);

    if (anySucceeded && !allFailed) {
      await this.prisma.post.update({
        where: { id: postId },
        data: { status: 'PUBLISHED', publishedAt: new Date() },
      });
    } else if (allFailed) {
      await this.prisma.post.update({
        where: { id: postId },
        data: { status: 'FAILED' },
      });
    }
    // Partially succeeded = leave as SCHEDULED (retry pending ones later)

    this.logger.log(
      `Post ${postId}: ${results.filter((r) => r.success).length}/${results.length} platforms succeeded`,
    );

    return { postId, results };
  }

  private async publishToIntegration(
    post: Post,
    pi: PostIntegration & { integration: Integration },
  ): Promise<PublishSummary['results'][0]> {
    const { integration } = pi;
    const platform = integration.identifier;

    try {
      const provider = this.registry.getProvider(platform);

      // Try to publish; if token expired, refresh and retry once
      let token = integration.token;
      let publishResult;

      try {
        publishResult = await provider.publish(token, post.content);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // Heuristic: refresh on auth errors
        if (
          errMsg.includes('401') ||
          errMsg.includes('token') ||
          errMsg.includes('expired') ||
          errMsg.includes('unauthorized')
        ) {
          if (integration.refreshToken) {
            this.logger.log(
              `Refreshing expired token for integration ${integration.id} (${platform})`,
            );
            const refreshed = await provider.refreshToken(
              integration.refreshToken,
            );

            // Persist the new token
            await this.prisma.integration.update({
              where: { id: integration.id },
              data: {
                token: refreshed.token,
                ...(refreshed.refreshToken
                  ? { refreshToken: refreshed.refreshToken }
                  : {}),
              },
            });

            token = refreshed.token;
            publishResult = await provider.publish(token, post.content);
          } else {
            throw err; // No refresh token — rethrow
          }
        } else {
          throw err;
        }
      }

      // Mark PostIntegration as published
      await this.prisma.postIntegration.update({
        where: { id: pi.id },
        data: {
          status: PostIntegrationStatus.PUBLISHED,
          externalId: publishResult.externalId,
        },
      });

      this.logger.log(
        `✅ Published to ${platform}: ${publishResult.url ?? publishResult.externalId}`,
      );

      return {
        integrationId: integration.id,
        platform,
        success: true,
        externalId: publishResult.externalId,
        url: publishResult.url,
      };
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`❌ Failed to publish to ${platform}: ${errMsg}`);

      await this.prisma.postIntegration.update({
        where: { id: pi.id },
        data: {
          status: PostIntegrationStatus.FAILED,
          error: errMsg,
        },
      });

      return {
        integrationId: integration.id,
        platform,
        success: false,
        error: errMsg,
      };
    }
  }

  /**
   * Find all scheduled posts that are past their scheduledAt time.
   * Called by the cron scheduler.
   */
  async findAndPublishDuePosts(): Promise<PublishSummary[]> {
    const duePosts = await this.prisma.post.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledAt: { lte: new Date() },
      },
      select: { id: true },
    });

    if (duePosts.length === 0) return [];

    this.logger.log(`Found ${duePosts.length} due posts to publish`);

    const summaries: PublishSummary[] = [];
    for (const post of duePosts) {
      try {
        const summary = await this.publishPost(post.id);
        summaries.push(summary);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to publish post ${post.id}: ${errMsg}`);
      }
    }

    return summaries;
  }
}
