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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { WebhooksService } from './webhooks.service';
import type { CreateWebhookDto } from './webhooks.service';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';
import { webhooksEnabled } from '../../common/tier-limits';
import type { OrgTier as TierKey } from '../../common/tier-limits';
import { OutpostErrorCode } from '../../common/errors';

@ApiTags('Webhooks')
@ApiBearerAuth()
@ApiSecurity('X-API-Key')
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
  @ApiOperation({
    summary: 'Register webhook',
    description:
      'Register an HTTPS endpoint to receive post events.\n\n' +
      '**Requires Team tier or above.**\n\n' +
      'Payloads are signed with HMAC-SHA256 (header: `X-Outpost-Signature`). ' +
      'Delivery is retried 3 times with exponential backoff (1s → 5s → 30s).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', format: 'uri', example: 'https://your-agent.com/webhooks/social' },
        events: {
          type: 'array',
          items: { type: 'string', enum: ['post_published', 'post_failed'] },
          description: 'Events to subscribe to. Omit for all events.',
          example: ['post_published', 'post_failed'],
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Webhook registered. Store the `secret` — it cannot be retrieved again.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'cld1234abcd' },
        url: { type: 'string', example: 'https://your-agent.com/webhooks/social' },
        events: { type: 'array', items: { type: 'string' } },
        secret: { type: 'string', example: 'whsec_abc123...' },
        enabled: { type: 'boolean', example: true },
      },
    },
  })
  @ApiResponse({ status: 402, description: 'Team tier required for webhooks.' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key.' })
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
            code: OutpostErrorCode.TIER_INSUFFICIENT,
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
  @ApiOperation({
    summary: 'List webhooks',
    description: 'Returns all registered webhook endpoints for the authenticated organization.',
  })
  @ApiResponse({
    status: 200,
    description: 'Array of webhook objects.',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          url: { type: 'string' },
          events: { type: 'array', items: { type: 'string' } },
          enabled: { type: 'boolean' },
        },
      },
    },
  })
  listWebhooks(@Req() req: AuthenticatedRequest) {
    return this.service.listWebhooks(req.organization.id);
  }

  /**
   * GET /api/v1/webhooks/:id
   * Get a specific webhook by ID.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get webhook by ID' })
  @ApiParam({ name: 'id', description: 'Webhook ID', example: 'cld1234abcd' })
  @ApiResponse({ status: 200, description: 'Webhook object.' })
  @ApiResponse({ status: 404, description: 'Webhook not found.' })
  getWebhook(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.getWebhook(id, req.organization.id);
  }

  /**
   * DELETE /api/v1/webhooks/:id
   * Remove a webhook endpoint.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete webhook' })
  @ApiParam({ name: 'id', description: 'Webhook ID', example: 'cld1234abcd' })
  @ApiResponse({ status: 204, description: 'Webhook deleted.' })
  @ApiResponse({ status: 404, description: 'Webhook not found.' })
  deleteWebhook(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.deleteWebhook(id, req.organization.id);
  }
}
