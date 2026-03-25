import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';
import {
  getAllPlatformCapabilities,
  getPlatformCapabilities,
} from '../../common/platform-capabilities';

@Controller('platforms')
export class PlatformsController {
  /**
   * GET /api/v1/platforms
   * List all available platforms + their capabilities.
   * Agents call this to discover what's available before posting.
   */
  @Get()
  listPlatforms() {
    return { platforms: getAllPlatformCapabilities() };
  }

  /**
   * GET /api/v1/platforms/:platform/capabilities
   * Per-platform capability check.
   */
  @Get(':platform/capabilities')
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
