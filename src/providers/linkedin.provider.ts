import { Logger } from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';
import {
  SocialProvider,
  PublishResult,
  ProviderProfile,
} from './social.provider';

interface LinkedInApiError {
  message?: string;
  serviceErrorCode?: number;
  status?: number;
}

interface LinkedInPostOptions {
  /**
   * Post type. Defaults to 'text'.
   * - 'text': plain text post
   * - 'article': share a URL as an article
   * - 'image': share an image (requires imageUrl)
   */
  postType?: 'text' | 'article' | 'image';
  /**
   * For article/image posts: the URL to share.
   */
  url?: string;
  /**
   * For article posts: the article title.
   */
  title?: string;
  /**
   * For image posts: a publicly accessible image URL.
   * LinkedIn requires uploading the image first via Assets API.
   */
  imageUrl?: string;
  /**
   * Visibility: 'PUBLIC' (default) or 'CONNECTIONS'.
   */
  visibility?: 'PUBLIC' | 'CONNECTIONS';
}

/**
 * LinkedIn API v2 provider.
 * Uses OAuth 2.0 with 3-legged auth flow.
 * Docs: https://learn.microsoft.com/en-us/linkedin/shared/api-guide
 *
 * Scopes required: w_member_social, r_basicprofile, r_liteprofile, r_emailaddress
 *
 * Posts use the User Generated Content (UGC) API.
 * Docs: https://learn.microsoft.com/en-us/linkedin/marketing/integrations/community-management/shares/ugc-post-api
 *
 * OAuth stub: real flow requires redirect URI + 3-legged OAuth dance.
 */
export class LinkedInProvider extends SocialProvider {
  readonly platform = SocialPlatform.linkedin;
  private readonly logger = new Logger(LinkedInProvider.name);

  private static readonly API_BASE = 'https://api.linkedin.com/v2';
  private static readonly AUTH_BASE = 'https://www.linkedin.com/oauth/v2';

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
   * Build the LinkedIn OAuth authorization URL.
   * Redirect the user to this URL to start the auth flow.
   */
  buildAuthUrl(redirectUri: string, state: string): string {
    const scope = [
      'w_member_social',
      'r_liteprofile',
      'r_emailaddress',
    ].join(' ');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: redirectUri,
      state,
      scope,
    });

    return `${LinkedInProvider.AUTH_BASE}/authorization?${params.toString()}`;
  }

  /**
   * Exchange authorization code for an access token.
   * @param code - code from the OAuth callback
   * @param redirectUri - must match the one used in buildAuthUrl
   */
  async exchangeCodeForToken(
    code: string,
    redirectUri: string,
  ): Promise<{ token: string; refreshToken?: string; expiresIn: number }> {
    const res = await fetch(`${LinkedInProvider.AUTH_BASE}/accessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as LinkedInApiError;
      throw new Error(
        `LinkedIn OAuth exchange failed: ${err.message ?? `HTTP ${res.status}`}`,
      );
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    return {
      token: data.access_token,
      refreshToken: data.refresh_token,
      expiresIn: data.expires_in,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SocialProvider interface
  // ─────────────────────────────────────────────────────────────────────────

  async publish(
    token: string,
    content: string,
    options?: Record<string, unknown>,
  ): Promise<PublishResult> {
    const opts = options as LinkedInPostOptions | undefined;
    const postType = opts?.postType ?? 'text';
    const visibility = opts?.visibility ?? 'PUBLIC';

    // Get the member URN (required for author field)
    const profile = await this.getProfile(token);
    const authorUrn = `urn:li:person:${profile.id}`;

    switch (postType) {
      case 'article':
        return this.publishArticle(token, authorUrn, content, opts, visibility);
      case 'image':
        return this.publishImagePost(token, authorUrn, content, opts, visibility);
      case 'text':
      default:
        return this.publishTextPost(token, authorUrn, content, visibility);
    }
  }

  private async publishTextPost(
    token: string,
    authorUrn: string,
    text: string,
    visibility: 'PUBLIC' | 'CONNECTIONS',
  ): Promise<PublishResult> {
    const body = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': visibility,
      },
    };

    return this.submitUgcPost(token, body);
  }

  private async publishArticle(
    token: string,
    authorUrn: string,
    text: string,
    opts: LinkedInPostOptions | undefined,
    visibility: 'PUBLIC' | 'CONNECTIONS',
  ): Promise<PublishResult> {
    if (!opts?.url) {
      throw new Error('LinkedIn article post requires options.url');
    }

    const media: Record<string, unknown> = {
      status: 'READY',
      originalUrl: opts.url,
    };

    if (opts.title) {
      media.title = { text: opts.title };
    }

    if (opts.imageUrl) {
      media.description = { text: text };
    }

    const body = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text },
          shareMediaCategory: 'ARTICLE',
          media: [media],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': visibility,
      },
    };

    return this.submitUgcPost(token, body);
  }

  private async publishImagePost(
    token: string,
    authorUrn: string,
    caption: string,
    opts: LinkedInPostOptions | undefined,
    visibility: 'PUBLIC' | 'CONNECTIONS',
  ): Promise<PublishResult> {
    if (!opts?.imageUrl) {
      throw new Error('LinkedIn image post requires options.imageUrl');
    }

    // LinkedIn requires uploading the image via Assets API before posting.
    // Step 1: Register upload
    const assetId = await this.registerImageUpload(token, authorUrn);
    // Step 2: Upload the image bytes (stub — in production, fetch imageUrl and PUT to uploadUrl)
    this.logger.log(
      `LinkedIn image upload registered (assetId: ${assetId}). ` +
        `In production: PUT image bytes to the upload URL from Assets API.`,
    );

    const body = {
      author: authorUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: caption },
          shareMediaCategory: 'IMAGE',
          media: [
            {
              status: 'READY',
              description: { text: caption },
              media: assetId,
            },
          ],
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': visibility,
      },
    };

    return this.submitUgcPost(token, body);
  }

  private async registerImageUpload(
    token: string,
    authorUrn: string,
  ): Promise<string> {
    const body = {
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: authorUrn,
        serviceRelationships: [
          {
            relationshipType: 'OWNER',
            identifier: 'urn:li:userGeneratedContent',
          },
        ],
      },
    };

    const res = await fetch(
      `${LinkedInProvider.API_BASE}/assets?action=registerUpload`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as LinkedInApiError;
      throw new Error(
        `LinkedIn image upload registration failed: ${err.message ?? `HTTP ${res.status}`}`,
      );
    }

    const data = (await res.json()) as {
      value: {
        asset: string;
        uploadMechanism: {
          'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
            uploadUrl: string;
          };
        };
      };
    };

    return data.value.asset;
  }

  private async submitUgcPost(
    token: string,
    body: Record<string, unknown>,
  ): Promise<PublishResult> {
    const res = await fetch(`${LinkedInProvider.API_BASE}/ugcPosts`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as LinkedInApiError;
      const msg = err.message ?? `HTTP ${res.status}`;
      this.logger.error(`LinkedIn UGC post failed: ${msg}`);
      throw new Error(`LinkedIn API error: ${msg}`);
    }

    // LinkedIn returns the post URN in the X-RestLi-Id header
    const postUrn = res.headers.get('x-restli-id') ?? res.headers.get('X-RestLi-Id');
    if (!postUrn) {
      throw new Error('LinkedIn: missing post URN in response headers');
    }

    // Extract the post ID from URN (e.g. urn:li:ugcPost:12345 → 12345)
    const postId = postUrn.split(':').pop() ?? postUrn;
    this.logger.log(`LinkedIn post published: ${postUrn}`);

    return {
      externalId: postUrn,
      url: `https://www.linkedin.com/feed/update/${postUrn}/`,
    };
  }

  async refreshToken(
    refreshToken: string,
  ): Promise<{ token: string; refreshToken?: string }> {
    const res = await fetch(`${LinkedInProvider.AUTH_BASE}/accessToken`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as LinkedInApiError;
      throw new Error(
        `LinkedIn token refresh failed: ${err.message ?? `HTTP ${res.status}`}`,
      );
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    return {
      token: data.access_token,
      refreshToken: data.refresh_token,
    };
  }

  async getProfile(token: string): Promise<ProviderProfile> {
    const res = await fetch(
      `${LinkedInProvider.API_BASE}/me?projection=(id,firstName,lastName,profilePicture(displayImage~:playableStreams))`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      },
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as LinkedInApiError;
      throw new Error(
        `LinkedIn getProfile failed: ${err.message ?? `HTTP ${res.status}`}`,
      );
    }

    const data = (await res.json()) as {
      id: string;
      firstName?: { localized?: Record<string, string> };
      lastName?: { localized?: Record<string, string> };
      profilePicture?: {
        'displayImage~'?: {
          elements?: Array<{
            identifiers?: Array<{ identifier: string }>;
          }>;
        };
      };
    };

    const firstName = data.firstName?.localized
      ? Object.values(data.firstName.localized)[0] ?? ''
      : '';
    const lastName = data.lastName?.localized
      ? Object.values(data.lastName.localized)[0] ?? ''
      : '';

    const avatarUrl =
      data.profilePicture?.['displayImage~']?.elements?.[0]?.identifiers?.[0]
        ?.identifier;

    return {
      id: data.id,
      username: data.id, // LinkedIn doesn't have a public username field in v2
      displayName: `${firstName} ${lastName}`.trim() || data.id,
      avatarUrl,
    };
  }

  async deletePost(token: string, externalId: string): Promise<void> {
    // externalId is the full URN e.g. urn:li:ugcPost:12345
    // URL-encode the URN for the REST endpoint
    const encodedUrn = encodeURIComponent(externalId);
    const res = await fetch(`${LinkedInProvider.API_BASE}/ugcPosts/${encodedUrn}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as LinkedInApiError;
      throw new Error(
        `LinkedIn deletePost failed: ${err.message ?? `HTTP ${res.status}`}`,
      );
    }
  }
}
