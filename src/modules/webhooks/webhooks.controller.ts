import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Req,
  HttpCode,
  HttpStatus,
  HttpException,
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import type { CreateWebhookDto } from './webhooks.service';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';
import { webhooksEnabled } from '../../common/tier-limits';
import type { OrgTier as TierKey } from '../../common/tier-limits';
import { SocialAgentErrorCode } from '../../common/errors';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  /**
   * POST /api/v1/webhooks
   * Register a new webhook endpoint to receive post events.
   *
   * Requires: Team tier or above.
   * Body: { url: "https://...", events?: ["post_published", "post_failed"] }
   * Returns: webhook object including the signing secret (store it!).
   * Events defaults to all if omitted.
   */
  @Post()
  createWebhook(
    @Body() dto: CreateWebhookDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const tier = req.organization.tier as TierKey;
    if (!webhooksEnabled(tier)) {
      throw new HttpException(
        {
          success: false,
          error: {
            code: SocialAgentErrorCode.TIER_INSUFFICIENT,
            message: 'Webhooks require Team tier or above.',
            agentHint:
              'Upgrade to the Team plan ($99/mo) to enable webhook delivery. ' +
              'See GET /api/v1/platforms for a full tier comparison.',
          },
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
    return this.service.createWebhook(req.organization.id, dto);
  }

  /**
   * GET /api/v1/webhooks
   * List all registered webhook endpoints for this organization.
   */
  @Get()
  listWebhooks(@Req() req: AuthenticatedRequest) {
    return this.service.listWebhooks(req.organization.id);
  }

  /**
   * GET /api/v1/webhooks/:id
   * Get a specific webhook by ID.
   */
  @Get(':id')
  getWebhook(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.getWebhook(id, req.organization.id);
  }

  /**
   * DELETE /api/v1/webhooks/:id
   * Remove a webhook endpoint.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteWebhook(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.deleteWebhook(id, req.organization.id);
  }
}
