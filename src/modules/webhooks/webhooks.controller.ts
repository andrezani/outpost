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
} from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import type { CreateWebhookDto } from './webhooks.service';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly service: WebhooksService) {}

  /**
   * POST /api/v1/webhooks
   * Register a new webhook endpoint to receive post events.
   *
   * Body: { url: "https://...", events?: ["post_published", "post_failed"] }
   * Returns: webhook object including the signing secret (store it!).
   * Events defaults to all if omitted.
   */
  @Post()
  createWebhook(
    @Body() dto: CreateWebhookDto,
    @Req() req: AuthenticatedRequest,
  ) {
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
