import { Controller, Post, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { PublishService } from './publish.service';
import { PublishRequestDto } from './publish.dto';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';

@ApiTags('Publish')
@ApiBearerAuth()
@ApiSecurity('X-API-Key')
@Controller('publish')
export class PublishController {
  constructor(private readonly service: PublishService) {}

  /**
   * POST /api/v1/publish
   *
   * The unified publish endpoint. Agents call this to post to any platform.
   * Always returns a structured, agent-parseable response.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Publish a post',
    description:
      'Unified publish endpoint — post to any supported platform with a single request.\n\n' +
      'Every response is structured for agent consumption: success or failure includes ' +
      '`code` + `agentHint` so your LLM knows exactly what to do next.\n\n' +
      '**Supported platforms:** x, instagram, reddit, linkedin, tiktok, bluesky, threads',
  })
  @ApiResponse({
    status: 200,
    description: 'Post published successfully.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        postId: { type: 'string', example: '1234567890' },
        platform: { type: 'string', example: 'x' },
        url: { type: 'string', example: 'https://x.com/user/status/1234567890' },
        publishedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Publish failed (agent-parseable error). HTTP 200 with success:false.',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: false },
        error: {
          type: 'object',
          properties: {
            code: {
              type: 'string',
              example: 'RATE_LIMITED',
              description:
                'One of: AUTH_EXPIRED, AUTH_INVALID, RATE_LIMITED, ORG_QUOTA_EXCEEDED, ' +
                'CONTENT_TOO_LONG, CONTENT_POLICY, MEDIA_TOO_LARGE, MEDIA_TYPE_UNSUPPORTED, ' +
                'ACCOUNT_NOT_FOUND, PLATFORM_ERROR, PLATFORM_DOWN, SUBREDDIT_REQUIRED, SUBREDDIT_NOT_FOUND',
            },
            message: { type: 'string', example: 'X rate limit exceeded' },
            agentHint: {
              type: 'string',
              example: 'Retry after 2026-03-25T03:45:00Z. Rate limit resets every 15 minutes.',
            },
            retryAfter: { type: 'string', format: 'date-time', nullable: true },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key.' })
  @ApiResponse({ status: 400, description: 'Validation error — check request body.' })
  publish(
    @Body() dto: PublishRequestDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.publish(req.organization.id, dto);
  }
}
