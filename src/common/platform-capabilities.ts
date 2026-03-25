import { SocialPlatform } from '@prisma/client';

export interface TextCapabilities {
  maxLength: number;
  supportsRichText: boolean;
  supportsMarkdown?: boolean;
}

export interface MediaCapabilities {
  maxImages: number;
  maxVideos: number;
  supportedTypes: string[];
  maxFileSizeMb?: number;
}

export interface RateLimit {
  posts: {
    window: string;
    max: number;
  };
}

export interface PlatformCapabilities {
  id: SocialPlatform;
  name: string;
  /** operational | degraded | down — can be updated dynamically */
  status: 'operational' | 'degraded' | 'down';
  text: TextCapabilities;
  media: MediaCapabilities;
  features: string[];
  rateLimit: RateLimit;
  /** Platform-specific notes for the agent */
  notes?: string[];
}

/**
 * Static platform capability definitions.
 * These are the known limits as of Q1 2026.
 * Update when platforms change their limits.
 */
export const PLATFORM_CAPABILITIES: Record<SocialPlatform, PlatformCapabilities> = {
  [SocialPlatform.x]: {
    id: SocialPlatform.x,
    name: 'X (Twitter)',
    status: 'operational',
    text: {
      maxLength: 280,
      supportsRichText: false,
    },
    media: {
      maxImages: 4,
      maxVideos: 1,
      supportedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4'],
      maxFileSizeMb: 5,
    },
    features: ['reply', 'quote_tweet', 'threads'],
    rateLimit: {
      posts: { window: '15min', max: 50 },
    },
    notes: [
      'Free API tier limited to 17 posts per 24h',
      'OAuth 2.0 PKCE required',
      'Text-only posts work natively',
    ],
  },

  [SocialPlatform.linkedin]: {
    id: SocialPlatform.linkedin,
    name: 'LinkedIn',
    status: 'operational',
    text: {
      maxLength: 3000,
      supportsRichText: false,
    },
    media: {
      maxImages: 9,
      maxVideos: 1,
      supportedTypes: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'],
      maxFileSizeMb: 100,
    },
    features: ['article', 'image', 'text', 'reply'],
    rateLimit: {
      posts: { window: '24h', max: 150 },
    },
    notes: [
      'Text posts work natively',
      'Image posts require pre-upload via Assets API',
      'UGC Posts API used for publishing',
    ],
  },

  [SocialPlatform.instagram]: {
    id: SocialPlatform.instagram,
    name: 'Instagram',
    status: 'operational',
    text: {
      maxLength: 2200,
      supportsRichText: false,
    },
    media: {
      maxImages: 10,
      maxVideos: 1,
      supportedTypes: ['image/jpeg', 'image/png', 'video/mp4'],
      maxFileSizeMb: 8,
    },
    features: ['carousel', 'photo', 'video', 'reel'],
    rateLimit: {
      posts: { window: '24h', max: 50 },
    },
    notes: [
      'Text-only posts NOT supported — requires at least one image URL',
      'Image must be a public HTTPS URL',
      'Requires Instagram Business or Creator account linked to a Facebook Page',
      'Container-publish flow: create container → publish',
    ],
  },

  [SocialPlatform.reddit]: {
    id: SocialPlatform.reddit,
    name: 'Reddit',
    status: 'operational',
    text: {
      maxLength: 40000,
      supportsRichText: true,
      supportsMarkdown: true,
    },
    media: {
      maxImages: 20,
      maxVideos: 1,
      supportedTypes: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'],
      maxFileSizeMb: 20,
    },
    features: ['text', 'link', 'image', 'video', 'flair', 'nsfw', 'spoiler'],
    rateLimit: {
      posts: { window: '10min', max: 10 },
    },
    notes: [
      'REQUIRED: metadata.subreddit must be set',
      'REQUIRED: metadata.title must be set',
      'Supports markdown in text posts',
    ],
  },

  [SocialPlatform.bluesky]: {
    id: SocialPlatform.bluesky,
    name: 'Bluesky',
    status: 'operational',
    text: {
      maxLength: 300,
      supportsRichText: false,
    },
    media: {
      maxImages: 4,
      maxVideos: 0,
      supportedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
      maxFileSizeMb: 1,
    },
    features: ['reply', 'quote', 'facets', 'language_tags'],
    rateLimit: {
      posts: { window: '24h', max: 1666 },
    },
    notes: [
      'Auth via app password (not OAuth) — use POST /api/v1/accounts/connect/bluesky',
      'Token format is JSON: { accessJwt, refreshJwt, handle, did }',
      'AT Protocol: createRecord → app.bsky.feed.post',
    ],
  },

  [SocialPlatform.threads]: {
    id: SocialPlatform.threads,
    name: 'Threads',
    status: 'operational',
    text: {
      maxLength: 500,
      supportsRichText: false,
    },
    media: {
      maxImages: 10,
      maxVideos: 1,
      supportedTypes: ['image/jpeg', 'image/png', 'image/gif', 'video/mp4'],
      maxFileSizeMb: 8,
    },
    features: ['text', 'image', 'carousel', 'reply'],
    rateLimit: {
      posts: { window: '24h', max: 250 },
    },
    notes: [
      'Text-only posts supported (unlike Instagram)',
      'Container-publish flow: create container → publish',
      'Long-lived tokens expire after 60 days',
    ],
  },

  // TikTok — not in MVP but enum exists, include placeholder
  [SocialPlatform.tiktok]: {
    id: SocialPlatform.tiktok,
    name: 'TikTok',
    status: 'down',
    text: {
      maxLength: 2200,
      supportsRichText: false,
    },
    media: {
      maxImages: 0,
      maxVideos: 1,
      supportedTypes: ['video/mp4'],
      maxFileSizeMb: 500,
    },
    features: ['video'],
    rateLimit: {
      posts: { window: '24h', max: 100 },
    },
    notes: ['TikTok integration not available in Phase 1 (v1.1 roadmap)'],
  },
};

export function getPlatformCapabilities(platform: SocialPlatform): PlatformCapabilities {
  return PLATFORM_CAPABILITIES[platform];
}

export function getAllPlatformCapabilities(): PlatformCapabilities[] {
  return Object.values(PLATFORM_CAPABILITIES).filter(
    (p) => p.id !== SocialPlatform.tiktok, // Exclude TikTok from MVP
  );
}
