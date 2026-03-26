import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Organization } from '@prisma/client';
import {
  OrgTier as TierKey,
  TIER_VALUES,
  getPostQuota,
  getPlatformQuota,
} from '../../common/tier-limits';

/**
 * TierService — enforces tier changes in the DB.
 *
 * Called from the Stripe webhook controller when subscription events arrive.
 * Single responsibility: translate a Stripe subscription state into an
 * Outpost tier and persist it.
 */
@Injectable()
export class TierService {
  private readonly logger = new Logger(TierService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Set an org's tier by Stripe customer ID.
   * Looks up the org via paymentId (which stores the Stripe customer ID).
   */
  async setTierByCustomerId(
    stripeCustomerId: string,
    tier: TierKey,
  ): Promise<Organization | null> {
    const org = await this.prisma.organization.findFirst({
      where: { paymentId: stripeCustomerId },
    });

    if (!org) {
      this.logger.warn(
        `No org found for Stripe customer ${stripeCustomerId} — skipping tier update`,
      );
      return null;
    }

    return this.setTier(org.id, tier);
  }

  /**
   * Set an org's tier directly by org ID.
   * Updates the tier + derived quota caches atomically.
   */
  async setTier(orgId: string, tier: TierKey): Promise<Organization> {
    if (!TIER_VALUES.includes(tier)) {
      this.logger.error(
        `Unknown tier "${tier}" — defaulting to free for org ${orgId}`,
      );
      tier = 'free';
    }

    const updated = await this.prisma.organization.update({
      where: { id: orgId },
      data: {
        tier,
        postQuota: getPostQuota(tier),
        platformQuota: getPlatformQuota(tier),
      },
    });

    this.logger.log(`Org ${orgId} tier updated → ${tier}`);
    return updated;
  }

  /**
   * Map a Stripe Price ID to an Outpost tier.
   * Falls back to 'free' for unknown price IDs.
   */
  priceIdToTier(
    priceId: string,
    proPriceId?: string | null,
    teamPriceId?: string | null,
    foundingPriceId?: string | null,
  ): TierKey {
    if (proPriceId && priceId === proPriceId) return 'pro';
    if (teamPriceId && priceId === teamPriceId) return 'team';
    if (foundingPriceId && priceId === foundingPriceId) return 'team_founding';

    this.logger.warn(
      `Unknown price ID "${priceId}" — no tier mapping found, defaulting to free`,
    );
    return 'free';
  }
}
