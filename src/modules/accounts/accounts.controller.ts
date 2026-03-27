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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { AccountsService } from './accounts.service';
import { StartOAuthDto, OAuthCallbackDto, ConnectBlueskyDto } from './accounts.dto';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';
import { SocialPlatform } from '@prisma/client';

@ApiTags('Accounts')
@ApiBearerAuth()
@ApiSecurity('X-API-Key')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly service: AccountsService) {}

  /**
   * GET /api/v1/accounts
   * List all connected social media accounts for this organization.
   */
  @Get()
  @ApiOperation({
    summary: 'List connected accounts',
    description: 'Returns all connected social media accounts for the authenticated organization.',
  })
  @ApiResponse({
    status: 200,
    description: 'Array of connected accounts.',
    schema: {
      type: 'object',
      properties: {
        accounts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', example: 'cld1234abcd' },
              platform: { type: 'string', example: 'x' },
              handle: { type: 'string', example: '@hibernyte' },
              displayName: { type: 'string', example: 'Hibernyte' },
              avatarUrl: { type: 'string', nullable: true },
              disabled: { type: 'boolean', example: false },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key.' })
  listAccounts(@Req() req: AuthenticatedRequest) {
    return this.service.listAccounts(req.organization.id);
  }

  /**
   * GET /api/v1/accounts/:id
   * Get a specific connected account.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get account by ID' })
  @ApiParam({ name: 'id', description: 'Integration ID', example: 'cld1234abcd' })
  @ApiResponse({ status: 200, description: 'Account object.' })
  @ApiResponse({ status: 404, description: 'Account not found.' })
  getAccount(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.getAccount(id, req.organization.id);
  }

  /**
   * DELETE /api/v1/accounts/:id
   * Disconnect / remove a connected account.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Disconnect account',
    description: 'Removes the connected social media account from this organization.',
  })
  @ApiParam({ name: 'id', description: 'Integration ID', example: 'cld1234abcd' })
  @ApiResponse({ status: 204, description: 'Account disconnected.' })
  @ApiResponse({ status: 404, description: 'Account not found.' })
  disconnectAccount(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.disconnectAccount(id, req.organization.id);
  }

  /**
   * GET /api/v1/accounts/:id/rate-limits
   * Get current rate limit status for an account.
   */
  @Get(':id/rate-limits')
  @ApiOperation({
    summary: 'Get rate limit status',
    description: 'Returns current platform rate limit status for a connected account.',
  })
  @ApiParam({ name: 'id', description: 'Integration ID', example: 'cld1234abcd' })
  @ApiResponse({
    status: 200,
    description: 'Rate limit status.',
    schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', example: 'x' },
        remaining: { type: 'number', example: 250 },
        resetAt: { type: 'string', format: 'date-time', nullable: true },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Account not found.' })
  getRateLimits(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.service.getRateLimits(id, req.organization.id);
  }

  /**
   * POST /api/v1/accounts/connect/bluesky
   * Connect a Bluesky account via app password (not OAuth).
   * Body: { handle: "user.bsky.social", appPassword: "xxxx-xxxx-xxxx-xxxx" }
   *
   * IMPORTANT: This must come BEFORE connect/:platform so NestJS matches the
   * static route first (not the dynamic :platform param).
   */
  @Post('connect/bluesky')
  @ApiOperation({
    summary: 'Connect Bluesky account',
    description:
      'Connect a Bluesky account using an app password (no OAuth flow needed).\n\n' +
      'Generate an app password at: https://bsky.app/settings/app-passwords',
  })
  @ApiBody({ type: ConnectBlueskyDto })
  @ApiResponse({ status: 201, description: 'Bluesky account connected.' })
  @ApiResponse({ status: 400, description: 'Invalid handle or app password.' })
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

  /**
   * POST /api/v1/accounts/connect/:platform
   * Start OAuth flow for a platform. Returns authUrl to redirect user to.
   * For Bluesky, use the dedicated /connect/bluesky endpoint instead.
   */
  @Post('connect/:platform')
  @ApiOperation({
    summary: 'Start OAuth flow',
    description:
      'Initiates OAuth 2.0 flow for the specified platform. ' +
      'Returns an `authUrl` to redirect the user to for authorization.\n\n' +
      'After the user approves, POST the `code` + `state` to `/connect/:platform/callback`.\n\n' +
      '**Note:** For Bluesky, use `POST /accounts/connect/bluesky` instead (app password auth).',
  })
  @ApiParam({
    name: 'platform',
    description: 'Platform to connect',
    enum: ['x', 'instagram', 'reddit', 'linkedin', 'threads'],
    example: 'x',
  })
  @ApiBody({ type: StartOAuthDto })
  @ApiResponse({
    status: 201,
    description: 'OAuth URL generated.',
    schema: {
      type: 'object',
      properties: {
        authUrl: { type: 'string', example: 'https://x.com/oauth/authorize?...' },
        state: { type: 'string', example: 'abc123' },
        instructions: { type: 'string', example: 'Redirect user to authUrl to authorize.' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid platform or redirect URI.' })
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
  @ApiOperation({
    summary: 'Handle OAuth callback',
    description:
      'Exchange the OAuth `code` + `state` returned from the platform redirect for an access token. ' +
      'On success, the account is connected and available for publishing.',
  })
  @ApiParam({
    name: 'platform',
    description: 'Platform being connected',
    enum: ['x', 'instagram', 'reddit', 'linkedin', 'threads'],
    example: 'x',
  })
  @ApiBody({ type: OAuthCallbackDto })
  @ApiResponse({ status: 201, description: 'Account connected successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid code, expired state, or CSRF mismatch.' })
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
}
