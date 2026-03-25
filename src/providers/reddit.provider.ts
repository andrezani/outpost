import { Logger } from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';
import {
  SocialProvider,
  PublishResult,
  ProviderProfile,
} from './social.provider';

interface RedditApiError {
  message?: string;
  error?: string;
  error_description?: string;
}

interface RedditSubmitOptions {
  subreddit: string; // required: where to post
  title: string; // required: post title
  kind?: 'self' | 'link'; // default: 'self' (text post)
  url?: string; // required if kind='link'
  flair_id?: string;
  nsfw?: boolean;
  spoiler?: boolean;
}

/**
 * Reddit API v1 provider.
 * Uses OAuth 2.0 with refresh tokens.
 * Docs: https://www.reddit.com/dev/api
 *
 * NOTE: Reddit posts require a subreddit + title.
 * Pass these via options: { subreddit: 'r/...', title: '...' }
 */
export class RedditProvider extends SocialProvider {
  readonly platform = SocialPlatform.reddit;
  private readonly logger = new Logger(RedditProvider.name);

  private static readonly API_BASE = 'https://oauth.reddit.com';
  private static readonly AUTH_BASE = 'https://www.reddit.com';
  private static readonly USER_AGENT = 'Outpost/1.0 (by u/outpost_app)';

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
    const opts = options as RedditSubmitOptions | undefined;

    if (!opts?.subreddit) {
      throw new Error('Reddit publish requires options.subreddit');
    }
    if (!opts?.title) {
      throw new Error('Reddit publish requires options.title');
    }

    const subreddit = opts.subreddit.replace(/^r\//, '');
    const kind = opts.kind ?? 'self';

    const body = new URLSearchParams({
      sr: subreddit,
      title: opts.title,
      kind,
      text: kind === 'self' ? content : '',
      url: kind === 'link' ? (opts.url ?? content) : '',
      nsfw: String(opts.nsfw ?? false),
      spoiler: String(opts.spoiler ?? false),
      resubmit: 'true',
    });

    if (opts.flair_id) body.append('flair_id', opts.flair_id);

    const res = await fetch(`${RedditProvider.API_BASE}/api/submit`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': RedditProvider.USER_AGENT,
      },
      body,
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as RedditApiError;
      const msg = err.message ?? err.error ?? `HTTP ${res.status}`;
      this.logger.error(`Reddit publish failed: ${msg}`);
      throw new Error(`Reddit API error: ${msg}`);
    }

    const data = (await res.json()) as {
      json: {
        errors: Array<[string, string, string]>;
        data?: { id: string; name: string; url: string };
      };
    };

    if (data.json.errors?.length > 0) {
      const errMsg = data.json.errors.map((e) => e[1]).join(', ');
      throw new Error(`Reddit submit error: ${errMsg}`);
    }

    const postData = data.json.data;
    if (!postData) throw new Error('Reddit: no post data in response');

    return {
      externalId: postData.name, // e.g. t3_abc123
      url: postData.url,
    };
  }

  async refreshToken(
    refreshToken: string,
  ): Promise<{ token: string; refreshToken?: string }> {
    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString('base64');

    const res = await fetch(`${RedditProvider.AUTH_BASE}/api/v1/access_token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': RedditProvider.USER_AGENT,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as RedditApiError;
      throw new Error(
        `Reddit token refresh failed: ${err.error_description ?? err.error ?? `HTTP ${res.status}`}`,
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
    const res = await fetch(`${RedditProvider.API_BASE}/api/v1/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        'User-Agent': RedditProvider.USER_AGENT,
      },
    });

    if (!res.ok) {
      throw new Error(`Reddit getProfile failed: HTTP ${res.status}`);
    }

    const data = (await res.json()) as {
      id: string;
      name: string;
      icon_img?: string;
    };

    return {
      id: data.id,
      username: data.name,
      displayName: data.name,
      avatarUrl: data.icon_img,
    };
  }

  async deletePost(token: string, externalId: string): Promise<void> {
    const res = await fetch(`${RedditProvider.API_BASE}/api/del`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': RedditProvider.USER_AGENT,
      },
      body: new URLSearchParams({ id: externalId }),
    });

    if (!res.ok) {
      throw new Error(`Reddit deletePost failed: HTTP ${res.status}`);
    }
  }
}
