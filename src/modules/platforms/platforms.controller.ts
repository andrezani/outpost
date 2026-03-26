import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { SocialPlatform } from '@prisma/client';
import {
  getAllPlatformCapabilities,
  getPlatformCapabilities,
} from '../../common/platform-capabilities';

@ApiTags('Platforms')
@Controller('platforms')
export class PlatformsController {
  /**
   * GET /api/v1/platforms
   * List all available platforms + their capabilities.
   * Agents call this to discover what's available before posting.
   */
  @Get()
  @ApiOperation({
    summary: 'List all platform capabilities',
    description:
      'Returns capabilities for all 6 supported platforms: text limits, media types, and rate limit windows. ' +
      'Call this before composing content to know exactly what each platform supports.',
  })
  @ApiResponse({
    status: 200,
    description: 'All platform capabilities.',
    schema: {
      type: 'object',
      properties: {
        platforms: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              platform: { type: 'string', example: 'x' },
              maxTextLength: { type: 'number', example: 280 },
              supportsMedia: { type: 'boolean', example: true },
              supportsThreads: { type: 'boolean', example: true },
              rateLimitWindow: { type: 'string', example: '15m' },
            },
          },
        },
      },
    },
  })
  listPlatforms() {
    return { platforms: getAllPlatformCapabilities() };
  }

  /**
   * GET /api/v1/platforms/:platform/capabilities
   * Per-platform capability check.
   */
  @Get(':platform/capabilities')
  @ApiOperation({
    summary: 'Get platform capabilities',
    description: 'Returns detailed capabilities for a specific platform.',
  })
  @ApiParam({
    name: 'platform',
    description: 'Platform identifier',
    enum: ['x', 'instagram', 'reddit', 'linkedin', 'tiktok', 'bluesky', 'threads'],
    example: 'x',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform capability object.',
    schema: {
      type: 'object',
      properties: {
        platform: { type: 'string', example: 'x' },
        maxTextLength: { type: 'number', example: 280 },
        supportsMedia: { type: 'boolean', example: true },
        supportedMediaTypes: {
          type: 'array',
          items: { type: 'string' },
          example: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'],
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Unknown platform.' })
  getPlatformCapabilities(@Param('platform') platform: string) {
    // Validate platform enum
    const validPlatforms = Object.values(SocialPlatform) as string[];
    if (!validPlatforms.includes(platform)) {
      throw new NotFoundException(
        `Unknown platform: ${platform}. Valid platforms: ${validPlatforms.join(', ')}`,
      );
    }

    const caps = getPlatformCapabilities(platform as SocialPlatform);
    if (!caps) {
      throw new NotFoundException(`No capability data for platform: ${platform}`);
    }

    return caps;
  }
}
