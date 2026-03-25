import { Logger } from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';
import {
  SocialProvider,
  PublishResult,
  ProviderProfile,
} from './social.provider';

/**
 * AT Protocol (Bluesky) session from createSession endpoint.
 * The "token" passed to publish() is a serialized JSON of this shape.
 */
interface BlueskySession {
  accessJwt: string;
  refreshJwt: string;
  handle: string;
  did: string;
}

interface BlueskyCreateSessionResponse {
  accessJwt: string;
  refreshJwt: string;
  handle: string;
  did: string;
}

interface BlueskyRefreshResponse {
  accessJwt: string;
  refreshJwt: string;
  handle: string;
  did: string;
}

interface BlueskyCreateRecordResponse {
  uri: string;
  cid: string;
}

interface BlueskyProfileResponse {
  did: string;
  handle: string;
  displayName?: string;
  avatar?: string;
}

/**
 * Bluesky (AT Protocol) provider.
 * Uses AT Protocol's com.atproto.* and app.bsky.* lexicons directly via HTTP.
 * No SDK required — pure fetch against https://bsky.social
 *
 * Auth model: Bluesky uses an identifier (handle) + app password for auth.
 * We issue sessions via `com.atproto.server.createSession` and persist
 * the accessJwt/refreshJwt as the "token" (serialized JSON).
 *
 * token format (JSON-serialized BlueskySession):
 *   { accessJwt, refreshJwt, handle, did }
 *
 * OAuth (AT Protocol): OAuth 2.0 with DPoP is available in newer atproto
 * but app passwords remain the primary simple auth. The buildAuthUrl/
 * exchangeCodeForToken methods below are stubs for future OAuth support.
 *
 * Docs: https://atproto.com/blog/create-post
 */
export class BlueskyProvider extends SocialProvider {
  readonly platform = SocialPlatform.bluesky;
  private readonly logger = new Logger(BlueskyProvider.name);

  private static readonly PDS_BASE = 'https://bsky.social';
  private static readonly LEXICON_FEED_POST = 'app.bsky.feed.post';

  // Bluesky posts are NOT OAuth-app based; clientId/Secret are unused
  // until AT Protocol OAuth 2.0 DPoP becomes standard.
  constructor(
    private readonly _clientId?: string,
    private readonly _clientSecret?: string,
  ) {
    super();
  }

  /**
   * Publish a text post (skeet) to Bluesky.
   *
   * token must be a JSON-serialized BlueskySession { accessJwt, did, handle, refreshJwt }
   *
   * options:
   *   langs?: string[]  — BCP-47 language tags (e.g. ['en'])
   *   replyTo?: { uri: string; cid: string }  — parent post for replies
   */
  async publish(
    token: string,
    content: string,
    options?: Record<string, unknown>,
  ): Promise<PublishResult> {
    const session = this.parseSession(token);

    const record: Record<string, unknown> = {
      $type: BlueskyProvider.LEXICON_FEED_POST,
      text: content,
      createdAt: new Date().toISOString(),
    };

    // BCP-47 language tags — improves discoverability on Bluesky
    const langs = options?.langs;
    if (Array.isArray(langs) && langs.length > 0) {
      record.langs = langs;
    }

    // Reply threading
    const replyTo = options?.replyTo as
      | { uri: string; cid: string }
      | undefined;
    if (replyTo?.uri && replyTo?.cid) {
      record.reply = {
        root: { uri: replyTo.uri, cid: replyTo.cid },
        parent: { uri: replyTo.uri, cid: replyTo.cid },
      };
    }

    const res = await fetch(
      `${BlueskyProvider.PDS_BASE}/xrpc/com.atproto.repo.createRecord`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repo: session.did,
          collection: BlueskyProvider.LEXICON_FEED_POST,
          record,
        }),
      },
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      const msg = err.message ?? err.error ?? `HTTP ${res.status}`;
      this.logger.error(`Bluesky publish failed: ${msg}`);
      throw new Error(`Bluesky error: ${msg}`);
    }

    const data = (await res.json()) as BlueskyCreateRecordResponse;
    // AT-URI format: at://did:plc:.../app.bsky.feed.post/rkey
    // Web URL: https://bsky.app/profile/{handle}/post/{rkey}
    const rkey = data.uri.split('/').pop() ?? data.uri;

    return {
      externalId: data.uri,
      url: `https://bsky.app/profile/${session.handle}/post/${rkey}`,
    };
  }

  /**
   * Refresh a Bluesky session using the refreshJwt.
   * Returns new tokens serialized as JSON (same BlueskySession shape).
   */
  async refreshToken(
    refreshToken: string,
  ): Promise<{ token: string; refreshToken?: string }> {
    // refreshToken here is the serialized BlueskySession (full JSON)
    const session = this.parseSession(refreshToken);

    const res = await fetch(
      `${BlueskyProvider.PDS_BASE}/xrpc/com.atproto.server.refreshSession`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.refreshJwt}`,
        },
      },
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      const msg = err.message ?? err.error ?? `HTTP ${res.status}`;
      throw new Error(`Bluesky token refresh failed: ${msg}`);
    }

    const data = (await res.json()) as BlueskyRefreshResponse;
    const newSession: BlueskySession = {
      accessJwt: data.accessJwt,
      refreshJwt: data.refreshJwt,
      handle: data.handle ?? session.handle,
      did: data.did ?? session.did,
    };

    const serialized = JSON.stringify(newSession);
    return { token: serialized, refreshToken: serialized };
  }

  /**
   * Get authenticated user profile from Bluesky.
   * token must be JSON-serialized BlueskySession.
   */
  async getProfile(token: string): Promise<ProviderProfile> {
    const session = this.parseSession(token);

    const res = await fetch(
      `${BlueskyProvider.PDS_BASE}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(session.handle)}`,
      {
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
        },
      },
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      throw new Error(
        `Bluesky getProfile failed: ${err.message ?? err.error ?? res.status}`,
      );
    }

    const data = (await res.json()) as BlueskyProfileResponse;
    return {
      id: data.did,
      username: data.handle,
      displayName: data.displayName,
      avatarUrl: data.avatar,
    };
  }

  /**
   * Delete a Bluesky post by its AT-URI (externalId).
   * AT-URI format: at://did:plc:.../app.bsky.feed.post/rkey
   */
  async deletePost(token: string, externalId: string): Promise<void> {
    const session = this.parseSession(token);
    // Parse rkey from AT-URI
    const parts = externalId.split('/');
    const rkey = parts[parts.length - 1];

    const res = await fetch(
      `${BlueskyProvider.PDS_BASE}/xrpc/com.atproto.repo.deleteRecord`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessJwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          repo: session.did,
          collection: BlueskyProvider.LEXICON_FEED_POST,
          rkey,
        }),
      },
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      throw new Error(
        `Bluesky deletePost failed: ${err.message ?? err.error ?? res.status}`,
      );
    }
  }

  /**
   * Authenticate with Bluesky using handle + app password.
   * Call this on first connection; persist the returned session JSON as the token.
   *
   * @param identifier - Bluesky handle (e.g. user.bsky.social) or email
   * @param password - App password (NOT account password) from Settings > App Passwords
   */
  async createSession(
    identifier: string,
    password: string,
  ): Promise<BlueskySession> {
    const res = await fetch(
      `${BlueskyProvider.PDS_BASE}/xrpc/com.atproto.server.createSession`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      },
    );

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      throw new Error(
        `Bluesky createSession failed: ${err.message ?? err.error ?? res.status}`,
      );
    }

    return (await res.json()) as BlueskyCreateSessionResponse;
  }

  /**
   * Build OAuth 2.0 auth URL.
   * Stub — AT Protocol OAuth 2.0 with DPoP is in draft;
   * using app passwords via createSession() for now.
   */
  buildAuthUrl(_redirectUri: string, _state: string): string {
    throw new Error(
      'Bluesky OAuth 2.0 DPoP not yet implemented. Use createSession() with an app password.',
    );
  }

  /**
   * Exchange OAuth code for token. Stub — see buildAuthUrl.
   */
  async exchangeCodeForToken(
    _code: string,
    _redirectUri: string,
  ): Promise<BlueskySession> {
    throw new Error(
      'Bluesky OAuth 2.0 DPoP not yet implemented. Use createSession() with an app password.',
    );
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  private parseSession(token: string): BlueskySession {
    try {
      return JSON.parse(token) as BlueskySession;
    } catch {
      throw new Error(
        'Bluesky token must be a JSON-serialized BlueskySession { accessJwt, refreshJwt, handle, did }',
      );
    }
  }
}
