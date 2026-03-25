import {
  Injectable,
  Logger,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ProviderRegistry } from '../../providers/provider.registry';
import { SocialPlatform } from '@prisma/client';
import {
  buildAgentError,
  OutpostErrorCode,
} from '../../common/errors';
import { PublishRequestDto } from './publish.dto';
import { WebhooksService } from '../webhooks/webhooks.service';
import { WebhookEvent } from '@prisma/client';
import { RateLimitService } from '../../common/rate-limit.service';

export interface RateLimitInfo {
  remaining: number;
  resetAt: string;
  windowMinutes: number;
}

export interface PublishSuccessResponse {
  success: true;
  postId: string;
  platform: SocialPlatform;
  url?: string;
  publishedAt: string;
  rateLimit?: RateLimitInfo;
}

export interface PublishErrorResponse {
  success: false;
  error: {
    code: OutpostErrorCode;
    message: string;
    agentHint: string;
    retryAfter?: string;
    platformError?: string;
    maxLength?: number;
  };
}

export type PublishResponse = PublishSuccessResponse | PublishErrorResponse;

@Injectable()
export class PublishService {
  private readonly logger = new Logger(PublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    private readonly webhooks: WebhooksService,
    private readonly rateLimits: RateLimitService,
  ) {}

  async publish(
    organizationId: string,
    dto: PublishRequestDto,
  ): Promise<PublishResponse> {
    // 1. Validate org quota
    const org = await this.prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    // Reset quota if new month
    const now = new Date();
    const quotaReset = org.quotaResetAt;
    const isNewMonth =
      now.getMonth() !== quotaReset.getMonth() ||
      now.getFullYear() !== quotaReset.getFullYear();

    if (isNewMonth) {
      await this.prisma.organization.update({
        where: { id: organizationId },
        data: { postsUsed: 0, quotaResetAt: now },
      });
      org.postsUsed = 0;
    }

    if (org.postQuota !== null && org.postsUsed >= org.postQuota) {
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const errorPayload = buildAgentError(
        new Error('Monthly post quota exceeded'),
        dto.platform,
      );
      errorPayload.code = OutpostErrorCode.ORG_QUOTA_EXCEEDED;
      errorPayload.agentHint = `Monthly post quota of ${org.postQuota} exceeded. Quota resets on ${nextMonth.toISOString()}. Upgrade plan for higher limits.`;
      errorPayload.retryAfter = nextMonth.toISOString();

      throw new HttpException(
        { success: false, error: errorPayload },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 2. Find the integration (account)
    const integration = await this.prisma.integration.findFirst({
      where: {
        id: dto.accountId,
        organizationId,
        disabled: false,
      },
    });

    if (!integration) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: OutpostErrorCode.ACCOUNT_NOT_FOUND,
            message: `Account ${dto.accountId} not found or disabled`,
            agentHint: `Check GET /api/v1/accounts to list connected accounts for your organization.`,
          },
        },
        HttpStatus.NOT_FOUND,
      );
    }

    // 3. Validate platform matches
    if (integration.identifier !== dto.platform) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: OutpostErrorCode.VALIDATION_ERROR,
            message: `Account ${dto.accountId} is connected to ${integration.identifier}, not ${dto.platform}`,
            agentHint: `The accountId you provided is for ${integration.identifier}, not ${dto.platform}. Call GET /api/v1/accounts to find the correct accountId for ${dto.platform}.`,
          },
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 4. Reddit-specific validation
    if (dto.platform === SocialPlatform.reddit) {
      if (!dto.content.metadata?.subreddit) {
        throw new HttpException(
          {
            success: false,
            error: {
              code: OutpostErrorCode.SUBREDDIT_REQUIRED,
              message: 'Reddit posts require metadata.subreddit',
              agentHint: 'Include metadata.subreddit in the content object. Example: { "content": { "text": "...", "metadata": { "subreddit": "MachineLearning", "title": "..." } } }',
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
      if (!dto.content.metadata?.title) {
        throw new HttpException(
          {
            success: false,
            error: {
              code: OutpostErrorCode.VALIDATION_ERROR,
              message: 'Reddit posts require metadata.title',
              agentHint: 'Include metadata.title in the content object.',
            },
          },
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // 5. Publish via provider
    const provider = this.registry.getProvider(dto.platform);
    let token = integration.token;

    // Build provider options from content
    const options = this.buildProviderOptions(dto);

    let externalId: string;
    let postUrl: string | undefined;

    try {
      let result;
      try {
        result = await provider.publish(token, dto.content.text, options);
      } catch (firstErr) {
        const firstErrMsg =
          firstErr instanceof Error ? firstErr.message : String(firstErr);

        // Auto-refresh on auth errors
        if (
          (firstErrMsg.includes('401') ||
            firstErrMsg.includes('token') ||
            firstErrMsg.includes('expired') ||
            firstErrMsg.includes('unauthorized')) &&
          integration.refreshToken
        ) {
          this.logger.log(
            `Refreshing token for ${dto.platform} account ${dto.accountId}`,
          );
          const refreshed = await provider.refreshToken(integration.refreshToken);
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
          result = await provider.publish(token, dto.content.text, options);
        } else {
          throw firstErr;
        }
      }

      externalId = result.externalId;
      postUrl = result.url;

      // 6. Increment org quota usage + live rate limit counter (parallel)
      const [, rlStatus] = await Promise.all([
        this.prisma.organization.update({
          where: { id: organizationId },
          data: { postsUsed: { increment: 1 } },
        }),
        this.rateLimits.increment(integration.id, dto.platform),
      ]);

      const publishedAt = new Date().toISOString();

      this.logger.log(
        `✅ Published to ${dto.platform} for org ${organizationId}: ${postUrl ?? externalId} (rl: ${rlStatus.remaining}/${rlStatus.limit} remaining)`,
      );

      // Fire webhook (non-blocking — errors won't affect the response)
      void this.webhooks.deliver(organizationId, {
        event: WebhookEvent.post_published,
        postId: externalId,
        platform: dto.platform,
        url: postUrl,
        timestamp: publishedAt,
        error: null,
      });

      return {
        success: true,
        postId: externalId,
        platform: dto.platform,
        url: postUrl,
        publishedAt,
        rateLimit: {
          remaining: rlStatus.remaining,
          resetAt: rlStatus.resetAt,
          windowMinutes: rlStatus.windowMinutes,
        },
      };
    } catch (err) {
      const agentErr = buildAgentError(err, dto.platform);
      this.logger.error(
        `❌ Publish failed for ${dto.platform} (org ${organizationId}): ${agentErr.message}`,
      );

      // Fire failure webhook (non-blocking)
      void this.webhooks.deliver(organizationId, {
        event: WebhookEvent.post_failed,
        postId: dto.accountId, // best we have at this point
        platform: dto.platform,
        timestamp: new Date().toISOString(),
        error: {
          code: agentErr.code,
          message: agentErr.message,
          agentHint: agentErr.agentHint,
        },
      });

      throw new HttpException(
        { success: false, error: agentErr },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  private buildProviderOptions(dto: PublishRequestDto): Record<string, unknown> {
    const options: Record<string, unknown> = {};

    if (dto.content.metadata) {
      const { subreddit, title, replyTo } = dto.content.metadata;
      if (subreddit) options.subreddit = subreddit;
      if (title) options.title = title;
      if (replyTo) {
        // Platform-specific reply option names
        switch (dto.platform) {
          case SocialPlatform.x:
            options.replyToTweetId = replyTo;
            break;
          case SocialPlatform.bluesky:
            options.replyTo = replyTo;
            break;
          default:
            options.replyTo = replyTo;
        }
      }
    }

    if (dto.content.media && dto.content.media.length > 0) {
      const images = dto.content.media
        .filter((m) => m.type === 'image')
        .map((m) => m.url);

      if (images.length === 1) {
        options.imageUrl = images[0];
      } else if (images.length > 1) {
        options.carouselImageUrls = images;
      }
    }

    return options;
  }
}
