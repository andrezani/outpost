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
import { AccountsService } from './accounts.service';
import { StartOAuthDto, OAuthCallbackDto, ConnectBlueskyDto } from './accounts.dto';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';
import { SocialPlatform } from '@prisma/client';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  /**
   * GET /api/v1/accounts
   * List all connected social media accounts for this organization.
   */
  @Get()
  listAccounts(@Req() req: AuthenticatedRequest) {
    return this.service.listAccounts(req.organization.id);
  }

  /**
   * GET /api/v1/accounts/:id
   * Get a specific connected account.
   */
  @Get(':id')
  getAccount(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.getAccount(id, req.organization.id);
  }

  /**
   * DELETE /api/v1/accounts/:id
   * Disconnect / remove a connected account.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  disconnectAccount(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.disconnectAccount(id, req.organization.id);
  }

  /**
   * GET /api/v1/accounts/:id/rate-limits
   * Get current rate limit status for an account.
   */
  @Get(':id/rate-limits')
  getRateLimits(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.getRateLimits(id, req.organization.id);
  }

  /**
   * POST /api/v1/accounts/connect/:platform
   * Start OAuth flow for a platform. Returns authUrl to redirect user to.
   * For Bluesky, use the dedicated /connect/bluesky endpoint instead.
   */
  @Post('connect/:platform')
  startOAuth(
    @Param('platform') platform: string,
    @Body() dto: StartOAuthDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.startOAuth(
      platform as SocialPlatform,
      req.organization.id,
      dto.redirectUri,
    );
  }

  /**
   * POST /api/v1/accounts/connect/:platform/callback
   * Handle OAuth callback. POST the code + state from the redirect here.
   */
  @Post('connect/:platform/callback')
  handleOAuthCallback(
    @Param('platform') platform: string,
    @Body() dto: OAuthCallbackDto,
    @Req() _req: AuthenticatedRequest,
  ) {
    return this.service.handleOAuthCallback(
      platform as SocialPlatform,
      dto.code,
      dto.state,
    );
  }

  /**
   * POST /api/v1/accounts/connect/bluesky
   * Connect a Bluesky account via app password (not OAuth).
   * Body: { handle: "user.bsky.social", appPassword: "xxxx-xxxx-xxxx-xxxx" }
   */
  @Post('connect/bluesky')
  connectBluesky(
    @Body() dto: ConnectBlueskyDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.connectBluesky(
      req.organization.id,
      dto.handle,
      dto.appPassword,
    );
  }
}
