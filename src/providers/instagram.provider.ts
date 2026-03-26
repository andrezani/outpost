import { Logger } from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';
import {
  SocialProvider,
  PublishResult,
  ProviderProfile,
} from './social.provider';

interface InstagramApiError {
  error?: {
    message?: string;
    type?: string;
    code?: number;
  };
}

interface InstagramPublishOptions {
  /**
   * Public image URL to attach to the post.
   * If omitted, a text-only (caption-only) post is created using the content container flow.
   */
  imageUrl?: string;
  /**
   * For carousel posts: array of public media URLs.
   */
  carouselImageUrls?: string[];
}

/**
 * Instagram Graph API provider.
 * Uses Facebook OAuth 2.0 (long-lived page/user tokens).
 * Docs: https://developers.facebook.com/docs/instagram-api
 *
 * Flow: create media container → publish container.
 * Requires the instagram_basic + instagram_content_publish permissions.
 *
 * NOTE: Instagram requires a public image URL for photo posts.
 * Pass via options: { imageUrl: 'https://...' }
 *
 * OAuth stub: real OAuth flow via Facebook Login — exchange code for
 * short-lived token → getLongLivedToken → getInstagramAccountId.
 */
export class InstagramProvider extends SocialProvider {
  readonly platform = SocialPlatform.instagram;
  private readonly logger = new Logger(InstagramProvider.name);

  private static readonly GRAPH_BASE = 'https://graph.facebook.com/v19.0';

  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    super();
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // OAuth helpers (stubs — wire to real redirect URI in auth module)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Build the Facebook Login OAuth URL.
   * Redirect to this URL to start the auth flow.
   */
  buildAuthUrl(redirectUri: string, state: string): string {
    const scope = [
      'instagram_basic',
      'instagram_content_publish',
      'pages_show_list',
      'pages_read_engagement',
    ].join(',');

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      scope,
      response_type: 'code',
      state,
    });

    return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for a short-lived token, then extend it.
   * @param code - code from OAuth callback
   * @param redirectUri - must match the one used in buildAuthUrl
   */
  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
  ): Promise<{ token: string; expiresIn: number }> {
    // Step 1: short-lived token
    const shortRes = await fetch(
      `${InstagramProvider.GRAPH_BASE}/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code,
        }),
      },
    );

    if (!shortRes.ok) {
      const err = (await shortRes.json().catch(() => ({}))) as InstagramApiError;
      throw new Error(
        `Instagram OAuth exchange failed: ${err.error?.message ?? `HTTP ${shortRes.status}`}`,
      );
    }

    const { access_token: shortToken } = (await shortRes.json()) as {
      access_token: string;
    };

    // Step 2: extend to long-lived token (~60 days)
    return this.extendToken(shortToken);
  }

  /**
   * Extend a short-lived token to a long-lived one (~60 days).
   */
  async extendToken(
    shortToken: string,
  ): Promise<{ token: string; expiresIn: number }> {
    const params = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      fb_exchange_token: shortToken,
    });

    const res = await fetch(
      `${InstagramProvider.GRAPH_BASE}/oauth/access_token?${params.toString()}`,
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as InstagramApiError;
      throw new Error(
        `Instagram token extension failed: ${err.error?.message ?? `HTTP ${res.status}`}`,
      );
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };

    return { token: data.access_token, expiresIn: data.expires_in };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SocialProvider interface
  // ─────────────────────────────────────────────────────────────────────────

  async publish(
    token: string,
    content: string,
    options?: Record<string, unknown>,
  ): Promise<PublishResult> {
    const opts = options as InstagramPublishOptions | undefined;

    // Get the Instagram Business Account ID from the token
    const igAccountId = await this.getInstagramAccountId(token);

    if (opts?.carouselImageUrls && opts.carouselImageUrls.length > 0) {
      return this.publishCarousel(token, igAccountId, content, opts.carouselImageUrls);
    }

    if (opts?.imageUrl) {
      return this.publishPhoto(token, igAccountId, content, opts.imageUrl);
    }

    // Text-only not directly supported by IG Graph API; use image with transparent 1x1 px
    // or throw a helpful error
    throw new Error(
      'Instagram publish requires options.imageUrl (or carouselImageUrls). ' +
        'Instagram does not support text-only posts via the Graph API.',
    );
  }

  private async publishPhoto(
    token: string,
    igAccountId: string,
    caption: string,
    imageUrl: string,
  ): Promise<PublishResult> {
    // Step 1: Create media container
    const containerRes = await fetch(
      `${InstagramProvider.GRAPH_BASE}/${igAccountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          image_url: imageUrl,
          caption,
          access_token: token,
        }),
      },
    );

    if (!containerRes.ok) {
      const err = (await containerRes.json().catch(() => ({}))) as InstagramApiError;
      throw new Error(
        `Instagram create container failed: ${err.error?.message ?? `HTTP ${containerRes.status}`}`,
      );
    }

    const { id: containerId } = (await containerRes.json()) as { id: string };
    this.logger.log(`Instagram container created: ${containerId}`);

    // Step 2: Publish the container
    return this.publishContainer(token, igAccountId, containerId);
  }

  private async publishCarousel(
    token: string,
    igAccountId: string,
    caption: string,
    imageUrls: string[],
  ): Promise<PublishResult> {
    // Step 1: Create individual item containers
    const itemIds: string[] = [];
    for (const imageUrl of imageUrls) {
      const itemRes = await fetch(
        `${InstagramProvider.GRAPH_BASE}/${igAccountId}/media`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            image_url: imageUrl,
            is_carousel_item: 'true',
            access_token: token,
          }),
        },
      );

      if (!itemRes.ok) {
        const err = (await itemRes.json().catch(() => ({}))) as InstagramApiError;
        throw new Error(
          `Instagram carousel item failed: ${err.error?.message ?? `HTTP ${itemRes.status}`}`,
        );
      }

      const { id } = (await itemRes.json()) as { id: string };
      itemIds.push(id);
    }

    // Step 2: Create carousel container
    const carouselRes = await fetch(
      `${InstagramProvider.GRAPH_BASE}/${igAccountId}/media`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          media_type: 'CAROUSEL',
          children: itemIds.join(','),
          caption,
          access_token: token,
        }),
      },
    );

    if (!carouselRes.ok) {
      const err = (await carouselRes.json().catch(() => ({}))) as InstagramApiError;
      throw new Error(
        `Instagram carousel container failed: ${err.error?.message ?? `HTTP ${carouselRes.status}`}`,
      );
    }

    const { id: containerId } = (await carouselRes.json()) as { id: string };

    // Step 3: Publish
    return this.publishContainer(token, igAccountId, containerId);
  }

  private async publishContainer(
    token: string,
    igAccountId: string,
    containerId: string,
  ): Promise<PublishResult> {
    const publishRes = await fetch(
      `${InstagramProvider.GRAPH_BASE}/${igAccountId}/media_publish`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          creation_id: containerId,
          access_token: token,
        }),
      },
    );

    if (!publishRes.ok) {
      const err = (await publishRes.json().catch(() => ({}))) as InstagramApiError;
      throw new Error(
        `Instagram publish container failed: ${err.error?.message ?? `HTTP ${publishRes.status}`}`,
      );
    }

    const { id: mediaId } = (await publishRes.json()) as { id: string };
    this.logger.log(`Instagram post published: ${mediaId}`);

    return {
      externalId: mediaId,
      url: `https://www.instagram.com/p/${mediaId}/`,
    };
  }

  /**
   * Instagram doesn't have a native refresh flow for long-lived tokens.
   * Call this before expiry (tokens last ~60 days).
   */
  async refreshToken(
    refreshToken: string,
  ): Promise<{ token: string; refreshToken?: string }> {
    // Instagram long-lived tokens are refreshed by calling the same endpoint
    // with the current long-lived token (not a separate refresh_token)
    const params = new URLSearchParams({
      grant_type: 'ig_refresh_token',
      access_token: refreshToken,
    });

    const res = await fetch(
      `${InstagramProvider.GRAPH_BASE}/refresh_access_token?${params.toString()}`,
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as InstagramApiError;
      throw new Error(
        `Instagram token refresh failed: ${err.error?.message ?? `HTTP ${res.status}`}`,
      );
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };

    return {
      token: data.access_token,
      // Instagram uses the token itself as the refresh mechanism
      refreshToken: data.access_token,
    };
  }

  async getProfile(token: string): Promise<ProviderProfile> {
    const igAccountId = await this.getInstagramAccountId(token);

    const res = await fetch(
      `${InstagramProvider.GRAPH_BASE}/${igAccountId}?fields=id,username,name,profile_picture_url&access_token=${token}`,
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as InstagramApiError;
      throw new Error(
        `Instagram getProfile failed: ${err.error?.message ?? `HTTP ${res.status}`}`,
      );
    }

    const data = (await res.json()) as {
      id: string;
      username: string;
      name?: string;
      profile_picture_url?: string;
    };

    return {
      id: data.id,
      username: data.username,
      displayName: data.name ?? data.username,
      avatarUrl: data.profile_picture_url,
    };
  }

  async deletePost(token: string, externalId: string): Promise<void> {
    const res = await fetch(
      `${InstagramProvider.GRAPH_BASE}/${externalId}?access_token=${token}`,
      { method: 'DELETE' },
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as InstagramApiError;
      throw new Error(
        `Instagram deletePost failed: ${err.error?.message ?? `HTTP ${res.status}`}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the Instagram Business/Creator Account ID linked to the token's FB user/page.
   * The token should be a Page access token from a Page linked to an Instagram account.
   */
  private async getInstagramAccountId(token: string): Promise<string> {
    // Get pages the user manages
    const pagesRes = await fetch(
      `${InstagramProvider.GRAPH_BASE}/me/accounts?access_token=${token}`,
    );

    if (!pagesRes.ok) {
      throw new Error(
        `Instagram: failed to fetch FB pages (HTTP ${pagesRes.status})`,
      );
    }

    const pages = (await pagesRes.json()) as {
      data: Array<{ id: string; access_token: string }>;
    };

    if (!pages.data?.length) {
      throw new Error('Instagram: no Facebook Pages found for this token. ' +
        'Ensure the token has pages_show_list permission and a Page is linked to an Instagram account.');
    }

    // Try each page to find the one with a linked Instagram account
    for (const page of pages.data) {
      const igRes = await fetch(
        `${InstagramProvider.GRAPH_BASE}/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`,
      );

      if (!igRes.ok) continue;

      const igData = (await igRes.json()) as {
        instagram_business_account?: { id: string };
      };

      if (igData.instagram_business_account?.id) {
        return igData.instagram_business_account.id;
      }
    }

    throw new Error(
      'Instagram: no Instagram Business Account found linked to any Facebook Page. ' +
        'Ensure the IG account is a Business or Creator account connected to a FB Page.',
    );
  }
}
