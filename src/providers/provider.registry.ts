import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SocialPlatform } from '@prisma/client';
import { SocialProvider } from './social.provider';
import { XProvider } from './x.provider';
import { RedditProvider } from './reddit.provider';
import { InstagramProvider } from './instagram.provider';
import { LinkedInProvider } from './linkedin.provider';

/**
 * Central registry for all social platform providers.
 * Lazily instantiates providers using config credentials.
 *
 * To add a new platform: add credentials to config + register in getProvider().
 */
@Injectable()
export class ProviderRegistry {
  private readonly logger = new Logger(ProviderRegistry.name);
  private readonly cache = new Map<SocialPlatform, SocialProvider>();

  constructor(private readonly config: ConfigService) {}

  getProvider(platform: SocialPlatform): SocialProvider {
    if (this.cache.has(platform)) {
      return this.cache.get(platform)!;
    }

    const provider = this.createProvider(platform);
    this.cache.set(platform, provider);
    return provider;
  }

  private createProvider(platform: SocialPlatform): SocialProvider {
    switch (platform) {
      case SocialPlatform.x: {
        const clientId = this.config.getOrThrow<string>('X_CLIENT_ID');
        const clientSecret = this.config.getOrThrow<string>('X_CLIENT_SECRET');
        this.logger.log('Initialized X provider');
        return new XProvider(clientId, clientSecret);
      }

      case SocialPlatform.reddit: {
        const clientId = this.config.getOrThrow<string>('REDDIT_CLIENT_ID');
        const clientSecret = this.config.getOrThrow<string>('REDDIT_CLIENT_SECRET');
        this.logger.log('Initialized Reddit provider');
        return new RedditProvider(clientId, clientSecret);
      }

      case SocialPlatform.instagram: {
        const clientId = this.config.getOrThrow<string>('INSTAGRAM_CLIENT_ID');
        const clientSecret = this.config.getOrThrow<string>('INSTAGRAM_CLIENT_SECRET');
        this.logger.log('Initialized Instagram provider');
        return new InstagramProvider(clientId, clientSecret);
      }

      case SocialPlatform.linkedin: {
        const clientId = this.config.getOrThrow<string>('LINKEDIN_CLIENT_ID');
        const clientSecret = this.config.getOrThrow<string>('LINKEDIN_CLIENT_SECRET');
        this.logger.log('Initialized LinkedIn provider');
        return new LinkedInProvider(clientId, clientSecret);
      }

      default:
        throw new Error(`No provider implemented for platform: ${platform}`);
    }
  }

  /**
   * Check which platforms have credentials configured.
   * Useful for startup health checks.
   */
  getConfiguredPlatforms(): SocialPlatform[] {
    const platforms: SocialPlatform[] = [];

    if (
      this.config.get('X_CLIENT_ID') &&
      this.config.get('X_CLIENT_SECRET')
    ) {
      platforms.push(SocialPlatform.x);
    }

    if (
      this.config.get('REDDIT_CLIENT_ID') &&
      this.config.get('REDDIT_CLIENT_SECRET')
    ) {
      platforms.push(SocialPlatform.reddit);
    }

    if (
      this.config.get('INSTAGRAM_CLIENT_ID') &&
      this.config.get('INSTAGRAM_CLIENT_SECRET')
    ) {
      platforms.push(SocialPlatform.instagram);
    }

    if (
      this.config.get('LINKEDIN_CLIENT_ID') &&
      this.config.get('LINKEDIN_CLIENT_SECRET')
    ) {
      platforms.push(SocialPlatform.linkedin);
    }

    return platforms;
  }
}
