import { Logger } from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';
import {
  SocialProvider,
  PublishResult,
  ProviderProfile,
} from './social.provider';

/**
 * Threads Graph API error shape.
 */
interface ThreadsApiError {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

/**
 * Threads Profile response from /me endpoint.
 */
interface ThreadsProfileResponse {
  id: string;
  username?: string;
  name?: string;
  threads_profile_picture_url?: string;
}

/**
 * Threads Graph API provider.
 * Threads uses Meta's Graph API (same infrastructure as Instagram).
 *
 * Docs: https://developers.facebook.com/docs/threads
 *
 * Publish flow (container model — same as Instagram):
 *   1. POST /me/threads → create media container (returns container id)
 *   2. POST /me/threads_publish → publish the container (returns post id)
 *
 * For text-only posts: media_type=TEXT, text={content}
 * For image posts:     media_type=IMAGE, image_url={url}, text={caption}
 * For carousel posts:  create children containers, then a carousel container
 *
 * OAuth 2.0:
 *   - Same Facebook OAuth flow as Instagram but with threads_basic +
 *     threads_content_publish permissions
 *   - Access token from Facebook Login (short-lived → exchange for long-lived)
 *
 * Rate limits (as of 2024):
 *   - 500 API calls per 24h per user
 *   - 250 posts per 24h per user
 */
export class ThreadsProvider extends SocialProvider {
  readonly platform = SocialPlatform.threads;
  private readonly logger = new Logger(ThreadsProvider.name);

  private static readonly GRAPH_BASE = 'https://graph.threads.net/v1.0';
  private static readonly AUTH_BASE = 'https://threads.net';

  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    super();
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * Publish a post to Threads.
   *
   * options:
   *   imageUrl?: string       — public image URL (triggers IMAGE post type)
   *   carouselImageUrls?: string[]  — for carousel posts (CAROUSEL type)
   *
   * Text-only if no imageUrl / carouselImageUrls provided.
   */
  async publish(
    token: string,
    content: string,
    options?: Record<string, unknown>,
  ): Promise<PublishResult> {
    const imageUrl =
      typeof options?.imageUrl === 'string' ? options.imageUrl : undefined;
    const carouselImageUrls = Array.isArray(options?.carouselImageUrls)
      ? (options.carouselImageUrls as string[])
      : undefined;

    let containerId: string;

    if (carouselImageUrls && carouselImageUrls.length > 0) {
      containerId = await this.createCarouselContainer(
        token,
        content,
        carouselImageUrls,
      );
    } else if (imageUrl) {
      containerId = await this.createImageContainer(token, content, imageUrl);
    } else {
      containerId = await this.createTextContainer(token, content);
    }

    // Publish the container
    const publishRes = await fetch(
      `${ThreadsProvider.GRAPH_BASE}/me/threads_publish`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ creation_id: containerId }),
      },
    );

    if (!publishRes.ok) {
      const err = (await publishRes.json().catch(() => ({}))) as ThreadsApiError;
      const msg =
        err.error?.message ?? `HTTP ${publishRes.status}`;
      this.logger.error(`Threads publish failed: ${msg}`);
      throw new Error(`Threads API error: ${msg}`);
    }

    const publishData = (await publishRes.json()) as { id: string };
    const postId = publishData.id;

    // Fetch post permalink for URL
    let postUrl: string | undefined;
    try {
      const permalinkRes = await fetch(
        `${ThreadsProvider.GRAPH_BASE}/${postId}?fields=permalink&access_token=${token}`,
      );
      if (permalinkRes.ok) {
        const permalinkData = (await permalinkRes.json()) as {
          permalink?: string;
        };
        postUrl = permalinkData.permalink;
      }
    } catch {
      // Non-critical: URL resolution failed, still return the post id
      this.logger.warn(`Could not resolve Threads post URL for ${postId}`);
    }

    return {
      externalId: postId,
      url: postUrl,
    };
  }

  /**
   * Refresh a Threads long-lived access token.
   * Long-lived tokens (60 days) can be refreshed before expiry.
   * Docs: https://developers.facebook.com/docs/threads/get-started/long-lived-tokens
   */
  async refreshToken(
    refreshToken: string,
  ): Promise<{ token: string; refreshToken?: string }> {
    const url = new URL(`${ThreadsProvider.GRAPH_BASE}/refresh_access_token`);
    url.searchParams.set('grant_type', 'th_refresh_token');
    url.searchParams.set('access_token', refreshToken);

    const res = await fetch(url.toString());

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as ThreadsApiError;
      const msg = err.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`Threads token refresh failed: ${msg}`);
    }

    const data = (await res.json()) as { access_token: string };
    return { token: data.access_token };
  }

  /**
   * Get authenticated user profile from Threads.
   * Docs: https://developers.facebook.com/docs/threads/reference/threads-user
   */
  async getProfile(token: string): Promise<ProviderProfile> {
    const res = await fetch(
      `${ThreadsProvider.GRAPH_BASE}/me?fields=id,username,name,threads_profile_picture_url&access_token=${token}`,
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as ThreadsApiError;
      const msg = err.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`Threads getProfile failed: ${msg}`);
    }

    const data = (await res.json()) as ThreadsProfileResponse;
    return {
      id: data.id,
      username: data.username ?? data.id,
      displayName: data.name,
      avatarUrl: data.threads_profile_picture_url,
    };
  }

  /**
   * Delete a Threads post by its post ID.
   * Note: Threads API (2024) supports post deletion.
   */
  async deletePost(token: string, externalId: string): Promise<void> {
    const res = await fetch(
      `${ThreadsProvider.GRAPH_BASE}/${externalId}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as ThreadsApiError;
      const msg = err.error?.message ?? `HTTP ${res.status}`;
      throw new Error(`Threads deletePost failed: ${msg}`);
    }
  }

  /**
   * Build OAuth 2.0 authorization URL for Threads.
   * Scopes needed: threads_basic, threads_content_publish
   *
   * @param redirectUri - Must match one registered in the Meta App Dashboard
   * @param state - CSRF token
   */
  buildAuthUrl(redirectUri: string, state: string): string {
    const url = new URL(`${ThreadsProvider.AUTH_BASE}/oauth/authorize`);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'threads_basic,threads_content_publish');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    return url.toString();
  }

  /**
   * Exchange an authorization code for a short-lived access token,
   * then extend it to a long-lived token (60 days).
   *
   * @param code - Code from OAuth callback
   * @param redirectUri - Must match the one used in buildAuthUrl
   */
  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
  ): Promise<string> {
    // Step 1: Short-lived token
    const shortLivedRes = await fetch(
      `${ThreadsProvider.GRAPH_BASE}/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }).toString(),
      },
    );

    if (!shortLivedRes.ok) {
      const err = (await shortLivedRes.json().catch(() => ({}))) as ThreadsApiError;
      throw new Error(
        `Threads token exchange failed: ${err.error?.message ?? shortLivedRes.status}`,
      );
    }

    const shortLivedData = (await shortLivedRes.json()) as {
      access_token: string;
      user_id: string;
    };

    // Step 2: Extend to long-lived token (60 days)
    const longLivedUrl = new URL(`${ThreadsProvider.GRAPH_BASE}/access_token`);
    longLivedUrl.searchParams.set('grant_type', 'th_exchange_token');
    longLivedUrl.searchParams.set('client_secret', this.clientSecret);
    longLivedUrl.searchParams.set(
      'access_token',
      shortLivedData.access_token,
    );

    const longLivedRes = await fetch(longLivedUrl.toString());

    if (!longLivedRes.ok) {
      // Fall back to short-lived token — better than failing entirely
      this.logger.warn(
        'Threads: could not exchange for long-lived token, using short-lived',
      );
      return shortLivedData.access_token;
    }

    const longLivedData = (await longLivedRes.json()) as {
      access_token: string;
    };
    return longLivedData.access_token;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private async createTextContainer(
    token: string,
    text: string,
  ): Promise<string> {
    const res = await fetch(`${ThreadsProvider.GRAPH_BASE}/me/threads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ media_type: 'TEXT', text }),
    });

    return this.extractContainerId(res, 'createTextContainer');
  }

  private async createImageContainer(
    token: string,
    caption: string,
    imageUrl: string,
  ): Promise<string> {
    const res = await fetch(`${ThreadsProvider.GRAPH_BASE}/me/threads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        media_type: 'IMAGE',
        image_url: imageUrl,
        text: caption,
      }),
    });

    return this.extractContainerId(res, 'createImageContainer');
  }

  private async createCarouselContainer(
    token: string,
    caption: string,
    imageUrls: string[],
  ): Promise<string> {
    // Create individual item containers
    const childIds: string[] = [];

    for (const imageUrl of imageUrls) {
      const res = await fetch(`${ThreadsProvider.GRAPH_BASE}/me/threads`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          media_type: 'IMAGE',
          image_url: imageUrl,
          is_carousel_item: true,
        }),
      });
      const childId = await this.extractContainerId(
        res,
        'createCarouselItem',
      );
      childIds.push(childId);
    }

    // Create carousel parent container
    const res = await fetch(`${ThreadsProvider.GRAPH_BASE}/me/threads`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        media_type: 'CAROUSEL',
        children: childIds.join(','),
        text: caption,
      }),
    });

    return this.extractContainerId(res, 'createCarouselContainer');
  }

  private async extractContainerId(
    res: Response,
    context: string,
  ): Promise<string> {
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as ThreadsApiError;
      const msg = err.error?.message ?? `HTTP ${res.status}`;
      this.logger.error(`Threads ${context} failed: ${msg}`);
      throw new Error(`Threads API error (${context}): ${msg}`);
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  }
}
