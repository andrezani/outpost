import { Injectable, Logger } from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';
import { RedisService } from './redis.service';
import { getPlatformCapabilities } from './platform-capabilities';

export interface LiveRateLimitStatus {
  /** Posts used in the current window */
  used: number;
  /** Total posts allowed in this window */
  limit: number;
  /** Posts remaining in the current window */
  remaining: number;
  /** ISO timestamp when the window resets */
  resetAt: string;
  /** Window size in minutes */
  windowMinutes: number;
}

/**
 * Sliding-window rate limit tracking via Redis.
 *
 * Key pattern: `ratelimit:{accountId}:{platform}:{windowBucket}`
 *   where windowBucket = floor(epochMs / windowMs)
 *
 * TTL is set to windowMs * 2 to guarantee expiry after the window closes.
 * On redis unavailability we degrade gracefully (log + return static caps).
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly redis: RedisService) {}

  /**
   * Increment the counter for an account + platform after a successful publish.
   * Returns the live rate limit status after incrementing.
   */
  async increment(
    accountId: string,
    platform: SocialPlatform,
  ): Promise<LiveRateLimitStatus> {
    const { windowMs, windowMinutes, limit } = this.getWindowConfig(platform);
    const key = this.buildKey(accountId, platform, windowMs);
    const resetAt = this.getWindowResetAt(windowMs);

    try {
      const client = this.redis.getClient();
      // INCR + conditional EXPIRE in a pipeline for atomicity
      const pipeline = client.pipeline();
      pipeline.incr(key);
      pipeline.pexpire(key, windowMs * 2); // TTL = 2x window to ensure expiry
      const results = await pipeline.exec();

      const used =
        results && results[0] && results[0][1] != null
          ? (results[0][1] as number)
          : 1;

      return {
        used,
        limit,
        remaining: Math.max(0, limit - used),
        resetAt: resetAt.toISOString(),
        windowMinutes,
      };
    } catch (err) {
      this.logger.warn(
        `Redis rate limit increment failed for ${platform}:${accountId} — degrading to static caps`,
        err instanceof Error ? err.message : String(err),
      );
      return this.staticStatus(platform, resetAt);
    }
  }

  /**
   * Read the current rate limit status without incrementing.
   * Used by GET /accounts/:id/rate-limits.
   */
  async getStatus(
    accountId: string,
    platform: SocialPlatform,
  ): Promise<LiveRateLimitStatus> {
    const { windowMs, windowMinutes, limit } = this.getWindowConfig(platform);
    const key = this.buildKey(accountId, platform, windowMs);
    const resetAt = this.getWindowResetAt(windowMs);

    try {
      const raw = await this.redis.get(key);
      const used = raw ? parseInt(raw, 10) : 0;
      return {
        used,
        limit,
        remaining: Math.max(0, limit - used),
        resetAt: resetAt.toISOString(),
        windowMinutes,
      };
    } catch (err) {
      this.logger.warn(
        `Redis rate limit read failed for ${platform}:${accountId} — degrading to static caps`,
        err instanceof Error ? err.message : String(err),
      );
      return this.staticStatus(platform, resetAt);
    }
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private getWindowConfig(platform: SocialPlatform): {
    windowMs: number;
    windowMinutes: number;
    limit: number;
  } {
    const caps = getPlatformCapabilities(platform);
    const windowStr = caps.rateLimit.posts.window; // e.g. "15min", "24h"
    const windowMs = this.parseWindowMs(windowStr);
    const windowMinutes = Math.round(windowMs / 60_000);
    return { windowMs, windowMinutes, limit: caps.rateLimit.posts.max };
  }

  private parseWindowMs(window: string): number {
    if (window.endsWith('min')) {
      return parseInt(window, 10) * 60 * 1000;
    }
    if (window.endsWith('h')) {
      return parseInt(window, 10) * 60 * 60 * 1000;
    }
    // Default fallback: 24h
    this.logger.warn(`Unknown window format "${window}" — defaulting to 24h`);
    return 24 * 60 * 60 * 1000;
  }

  private buildKey(
    accountId: string,
    platform: SocialPlatform,
    windowMs: number,
  ): string {
    const bucket = Math.floor(Date.now() / windowMs);
    return `ratelimit:${accountId}:${platform}:${bucket}`;
  }

  private getWindowResetAt(windowMs: number): Date {
    const bucket = Math.floor(Date.now() / windowMs);
    return new Date((bucket + 1) * windowMs);
  }

  private staticStatus(
    platform: SocialPlatform,
    resetAt: Date,
  ): LiveRateLimitStatus {
    const caps = getPlatformCapabilities(platform);
    const windowMs = this.parseWindowMs(caps.rateLimit.posts.window);
    const windowMinutes = Math.round(windowMs / 60_000);
    return {
      used: 0,
      limit: caps.rateLimit.posts.max,
      remaining: caps.rateLimit.posts.max,
      resetAt: resetAt.toISOString(),
      windowMinutes,
    };
  }
}
