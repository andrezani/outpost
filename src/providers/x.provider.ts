import { Logger } from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';
import {
  SocialProvider,
  PublishResult,
  ProviderProfile,
} from './social.provider';

interface XApiError {
  errors?: Array<{ message: string; code: number }>;
  detail?: string;
  title?: string;
}

/**
 * X (Twitter) API v2 provider.
 * Uses OAuth 2.0 PKCE + refresh token flow.
 * Docs: https://developer.x.com/en/docs/x-api
 */
export class XProvider extends SocialProvider {
  readonly platform = SocialPlatform.x;
  private readonly logger = new Logger(XProvider.name);

  private static readonly API_BASE = 'https://api.twitter.com/2';
  private static readonly AUTH_BASE = 'https://api.twitter.com/oauth2';

  private readonly clientId: string;
  private readonly clientSecret: string;

  constructor(clientId: string, clientSecret: string) {
    super();
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  async publish(
    token: string,
    content: string,
    options?: Record<string, unknown>,
  ): Promise<PublishResult> {
    const body: Record<string, unknown> = { text: content };

    // Support reply_to for threads
    if (options?.replyToTweetId && typeof options.replyToTweetId === 'string') {
      body.reply = { in_reply_to_tweet_id: options.replyToTweetId };
    }

    const res = await fetch(`${XProvider.API_BASE}/tweets`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as XApiError;
      const msg =
        err.detail ??
        err.errors?.[0]?.message ??
        err.title ??
        `HTTP ${res.status}`;
      this.logger.error(`X publish failed: ${msg}`);
      throw new Error(`X API error: ${msg}`);
    }

    const data = (await res.json()) as {
      data: { id: string; text: string };
    };
    const tweetId = data.data.id;

    return {
      externalId: tweetId,
      url: `https://x.com/i/web/status/${tweetId}`,
    };
  }

  async refreshToken(
    refreshToken: string,
  ): Promise<{ token: string; refreshToken?: string }> {
    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString('base64');

    const res = await fetch(`${XProvider.AUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.clientId,
      }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as XApiError;
      throw new Error(`X token refresh failed: ${err.detail ?? `HTTP ${res.status}`}`);
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
      `${XProvider.API_BASE}/users/me?user.fields=profile_image_url,name,username`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as XApiError;
      throw new Error(
        `X getProfile failed: ${err.detail ?? `HTTP ${res.status}`}`,
      );
    }

    const data = (await res.json()) as {
      data: {
        id: string;
        username: string;
        name: string;
        profile_image_url?: string;
      };
    };

    return {
      id: data.data.id,
      username: data.data.username,
      displayName: data.data.name,
      avatarUrl: data.data.profile_image_url,
    };
  }

  async deletePost(token: string, externalId: string): Promise<void> {
    const res = await fetch(`${XProvider.API_BASE}/tweets/${externalId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as XApiError;
      throw new Error(
        `X deletePost failed: ${err.detail ?? `HTTP ${res.status}`}`,
      );
    }
  }
}
