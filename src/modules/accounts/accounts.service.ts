import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { ProviderRegistry } from '../../providers/provider.registry';
import { ConfigService } from '@nestjs/config';
import { SocialPlatform, Integration } from '@prisma/client';
import { InstagramProvider } from '../../providers/instagram.provider';
import { LinkedInProvider } from '../../providers/linkedin.provider';
import { XProvider } from '../../providers/x.provider';
import { BlueskyProvider } from '../../providers/bluesky.provider';
import { ThreadsProvider } from '../../providers/threads.provider';
import { randomBytes, createHash } from 'crypto';

export interface ConnectedAccount {
  id: string;
  platform: SocialPlatform;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: 'active' | 'disabled';
  createdAt: Date;
}

export interface StartOAuthResult {
  authUrl: string;
  /** State token — embed in your UI redirect. We handle CSRF internally. */
  state: string;
  /** Platform-specific instructions for the agent */
  instructions: string;
}

@Injectable()
export class AccountsService {
  private readonly logger = new Logger(AccountsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ProviderRegistry,
    private readonly config: ConfigService,
  ) {}

  // ─── List connected accounts ──────────────────────────────────────────────

  async listAccounts(organizationId: string): Promise<ConnectedAccount[]> {
    const integrations = await this.prisma.integration.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    return integrations.map((i) => this.toConnectedAccount(i));
  }

  async getAccount(id: string, organizationId: string): Promise<ConnectedAccount> {
    const integration = await this.prisma.integration.findFirst({
      where: { id, organizationId },
    });
    if (!integration) {
      throw new NotFoundException(`Account ${id} not found`);
    }
    return this.toConnectedAccount(integration);
  }

  async disconnectAccount(id: string, organizationId: string): Promise<void> {
    const integration = await this.prisma.integration.findFirst({
      where: { id, organizationId },
    });
    if (!integration) {
      throw new NotFoundException(`Account ${id} not found`);
    }
    await this.prisma.integration.delete({ where: { id } });
    this.logger.log(`Disconnected account ${id} (${integration.identifier}) from org ${organizationId}`);
  }

  // ─── OAuth: Start flow ────────────────────────────────────────────────────

  async startOAuth(
    platform: SocialPlatform,
    organizationId: string,
    redirectUri: string,
  ): Promise<StartOAuthResult> {
    if (platform === SocialPlatform.bluesky) {
      throw new BadRequestException(
        'Bluesky uses app passwords, not OAuth. Use POST /api/v1/accounts/connect/bluesky instead.',
      );
    }

    if (platform === SocialPlatform.tiktok) {
      throw new BadRequestException('TikTok is not supported in Phase 1.');
    }

    // Generate state + optional PKCE code verifier
    const state = randomBytes(32).toString('hex');
    const codeVerifier = this.platformUsesPKCE(platform)
      ? randomBytes(43).toString('base64url')
      : undefined;

    // Store state in DB (expires in 15 min)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await this.prisma.oAuthState.create({
      data: {
        organizationId,
        platform,
        state,
        codeVerifier,
        redirectUri,
        expiresAt,
      },
    });

    // Get provider and build auth URL
    const provider = this.registry.getProvider(platform);
    let authUrl: string;

    switch (platform) {
      case SocialPlatform.x: {
        const xProvider = provider as XProvider;
        authUrl = xProvider.buildAuthUrl(redirectUri, state, codeVerifier);
        break;
      }
      case SocialPlatform.instagram: {
        const igProvider = provider as InstagramProvider;
        authUrl = igProvider.buildAuthUrl(redirectUri, state);
        break;
      }
      case SocialPlatform.linkedin: {
        const liProvider = provider as LinkedInProvider;
        authUrl = liProvider.buildAuthUrl(redirectUri, state);
        break;
      }
      case SocialPlatform.threads: {
        const threadsProvider = provider as ThreadsProvider;
        authUrl = threadsProvider.buildAuthUrl(redirectUri, state);
        break;
      }
      case SocialPlatform.reddit: {
        // Reddit OAuth 2.0 — build URL manually (no PKCE but uses state)
        authUrl = this.buildRedditAuthUrl(redirectUri, state);
        break;
      }
      default:
        throw new BadRequestException(`OAuth not supported for platform: ${platform}`);
    }

    return {
      authUrl,
      state,
      instructions: this.getOAuthInstructions(platform),
    };
  }

  // ─── OAuth: Callback handler ──────────────────────────────────────────────

  async handleOAuthCallback(
    platform: SocialPlatform,
    code: string,
    state: string,
  ): Promise<ConnectedAccount> {
    // Validate state + get organization
    const oauthState = await this.prisma.oAuthState.findUnique({
      where: { state },
    });

    if (!oauthState) {
      throw new UnprocessableEntityException('Invalid or expired OAuth state. Restart the flow.');
    }

    if (oauthState.expiresAt < new Date()) {
      await this.prisma.oAuthState.delete({ where: { state } });
      throw new UnprocessableEntityException('OAuth state expired. Restart the flow.');
    }

    if (oauthState.platform !== platform) {
      throw new UnprocessableEntityException(`OAuth state platform mismatch: expected ${oauthState.platform}, got ${platform}`);
    }

    const organizationId = oauthState.organizationId;
    const redirectUri = oauthState.redirectUri;

    // Clean up state immediately (prevent replay)
    await this.prisma.oAuthState.delete({ where: { state } });

    // Exchange code for tokens
    const provider = this.registry.getProvider(platform);
    let token: string;
    let refreshToken: string | undefined;

    switch (platform) {
      case SocialPlatform.x: {
        const xProvider = provider as XProvider;
        const result = await xProvider.exchangeCodeForToken(
          code,
          redirectUri,
          oauthState.codeVerifier ?? '',
        );
        token = result.token;
        refreshToken = result.refreshToken;
        break;
      }
      case SocialPlatform.instagram: {
        const igProvider = provider as InstagramProvider;
        const result = await igProvider.exchangeCodeForToken(code, redirectUri);
        token = result.token;
        break;
      }
      case SocialPlatform.linkedin: {
        const liProvider = provider as LinkedInProvider;
        const result = await liProvider.exchangeCodeForToken(code, redirectUri);
        token = result.token;
        refreshToken = result.refreshToken;
        break;
      }
      case SocialPlatform.threads: {
        const threadsProvider = provider as ThreadsProvider;
        token = await threadsProvider.exchangeCodeForToken(code, redirectUri);
        break;
      }
      case SocialPlatform.reddit: {
        const result = await this.exchangeRedditCode(code, redirectUri);
        token = result.token;
        refreshToken = result.refreshToken;
        break;
      }
      default:
        throw new BadRequestException(`OAuth callback not supported for: ${platform}`);
    }

    // Fetch profile to get internalId + handle
    const profile = await provider.getProfile(token);

    // Upsert integration (handle reconnects)
    const integration = await this.prisma.integration.upsert({
      where: {
        organizationId_identifier_internalId: {
          organizationId,
          identifier: platform,
          internalId: profile.id,
        },
      },
      create: {
        organizationId,
        token,
        refreshToken,
        internalId: profile.id,
        identifier: platform,
        handle: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        disabled: false,
      },
      update: {
        token,
        refreshToken,
        handle: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        disabled: false,
      },
    });

    this.logger.log(
      `✅ OAuth connected: ${platform} @${profile.username} for org ${organizationId}`,
    );

    return this.toConnectedAccount(integration);
  }

  // ─── Bluesky: App password connect ───────────────────────────────────────

  async connectBluesky(
    organizationId: string,
    handle: string,
    appPassword: string,
  ): Promise<ConnectedAccount> {
    const provider = this.registry.getProvider(SocialPlatform.bluesky) as BlueskyProvider;

    // Create session — this validates credentials
    const session = await provider.createSession(handle, appPassword);
    const token = JSON.stringify(session);

    // Fetch profile
    const profile = await provider.getProfile(token);

    // Upsert integration
    const integration = await this.prisma.integration.upsert({
      where: {
        organizationId_identifier_internalId: {
          organizationId,
          identifier: SocialPlatform.bluesky,
          internalId: session.did,
        },
      },
      create: {
        organizationId,
        token,
        refreshToken: token, // Bluesky: full session JSON used for both
        internalId: session.did,
        identifier: SocialPlatform.bluesky,
        handle: session.handle,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        disabled: false,
      },
      update: {
        token,
        refreshToken: token,
        handle: session.handle,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        disabled: false,
      },
    });

    this.logger.log(
      `✅ Bluesky connected: @${session.handle} (${session.did}) for org ${organizationId}`,
    );

    return this.toConnectedAccount(integration);
  }

  // ─── Rate limits ──────────────────────────────────────────────────────────

  async getRateLimits(accountId: string, organizationId: string) {
    const integration = await this.prisma.integration.findFirst({
      where: { id: accountId, organizationId },
    });

    if (!integration) {
      throw new NotFoundException(`Account ${accountId} not found`);
    }

    // Return static rate limit info from platform capabilities
    // In v2 we'd track actual API call counts in Redis
    const { getPlatformCapabilities } = await import('../../common/platform-capabilities.js');
    const caps = getPlatformCapabilities(integration.identifier);

    return {
      accountId,
      platform: integration.identifier,
      handle: integration.handle,
      rateLimit: caps.rateLimit,
      note: 'Live rate limit tracking available in v2 (requires Redis counters)',
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private toConnectedAccount(integration: Integration): ConnectedAccount {
    return {
      id: integration.id,
      platform: integration.identifier,
      handle: integration.handle,
      displayName: integration.displayName,
      avatarUrl: integration.avatarUrl,
      status: integration.disabled ? 'disabled' : 'active',
      createdAt: integration.createdAt,
    };
  }

  private platformUsesPKCE(platform: SocialPlatform): boolean {
    return platform === SocialPlatform.x;
  }

  private buildRedditAuthUrl(redirectUri: string, state: string): string {
    const clientId = this.config.getOrThrow<string>('REDDIT_CLIENT_ID');
    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      state,
      redirect_uri: redirectUri,
      duration: 'permanent',
      scope: 'submit identity read',
    });
    return `https://www.reddit.com/api/v1/authorize?${params.toString()}`;
  }

  private async exchangeRedditCode(
    code: string,
    redirectUri: string,
  ): Promise<{ token: string; refreshToken?: string }> {
    const clientId = this.config.getOrThrow<string>('REDDIT_CLIENT_ID');
    const clientSecret = this.config.getOrThrow<string>('REDDIT_CLIENT_SECRET');
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Outpost/1.0',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      throw new BadRequestException(
        `Reddit OAuth exchange failed: ${err.error ?? `HTTP ${res.status}`}`,
      );
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    return { token: data.access_token, refreshToken: data.refresh_token };
  }

  private getOAuthInstructions(platform: SocialPlatform): string {
    const instructions: Partial<Record<SocialPlatform, string>> = {
      [SocialPlatform.x]: 'Redirect the user to authUrl. They will authorize on X.com and be redirected back with ?code=&state= params. POST those to /api/v1/accounts/connect/x/callback.',
      [SocialPlatform.reddit]: 'Redirect the user to authUrl. They will authorize on Reddit and be redirected back with ?code=&state= params. POST those to /api/v1/accounts/connect/reddit/callback.',
      [SocialPlatform.instagram]: 'Redirect the user to authUrl. They will authorize on Facebook (Instagram Business account required). POST code+state to /api/v1/accounts/connect/instagram/callback.',
      [SocialPlatform.linkedin]: 'Redirect the user to authUrl. They will authorize on LinkedIn. POST code+state to /api/v1/accounts/connect/linkedin/callback.',
      [SocialPlatform.threads]: 'Redirect the user to authUrl. They will authorize on Threads. POST code+state to /api/v1/accounts/connect/threads/callback.',
    };
    return instructions[platform] ?? `Redirect user to authUrl and POST callback to /api/v1/accounts/connect/${platform}/callback`;
  }
}
