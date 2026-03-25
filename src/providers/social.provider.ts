import { SocialPlatform } from '@prisma/client';

export interface PublishResult {
  externalId: string;
  url?: string;
}

export interface ProviderProfile {
  id: string;
  username: string;
  displayName?: string;
  avatarUrl?: string;
}

/**
 * Abstract base class for all social media providers.
 * Each platform (X, Instagram, Reddit, LinkedIn, TikTok) must implement this.
 */
export abstract class SocialProvider {
  abstract readonly platform: SocialPlatform;

  /**
   * Publish a post to the platform.
   * @param token - The OAuth access token
   * @param content - The post content (text, media URLs, etc.)
   * @returns PublishResult with externalId (platform post ID) and optional URL
   */
  abstract publish(
    token: string,
    content: string,
    options?: Record<string, unknown>,
  ): Promise<PublishResult>;

  /**
   * Refresh an expired OAuth token.
   * @param refreshToken - The OAuth refresh token
   * @returns New access token (and optionally a new refresh token)
   */
  abstract refreshToken(
    refreshToken: string,
  ): Promise<{ token: string; refreshToken?: string }>;

  /**
   * Fetch the authenticated user's profile from the platform.
   * @param token - The OAuth access token
   */
  abstract getProfile(token: string): Promise<ProviderProfile>;

  /**
   * Delete a post from the platform.
   * @param token - The OAuth access token
   * @param externalId - The platform's post ID
   */
  abstract deletePost(token: string, externalId: string): Promise<void>;

  /**
   * Validate that a token is still valid (not expired/revoked).
   * @param token - The OAuth access token
   */
  async validateToken(token: string): Promise<boolean> {
    try {
      await this.getProfile(token);
      return true;
    } catch {
      return false;
    }
  }
}
