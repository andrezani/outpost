/**
 * Tier limits — approved by Max (CRO) + Maya (CPO), March 25 2026
 *
 * These are the CANONICAL tier definitions for SocialAgent.
 * All quota checks MUST reference this file. Do not hardcode limits elsewhere.
 *
 * Quota enforcement is per-ORG, not per-social-account.
 * Multi-tenant isolation is our moat — this must hold.
 */

export const TIER_LIMITS = {
  free: {
    postsPerMonth: 100,
    platformCount: 3,
    webhooks: false,
    price: 0,
  },
  pro: {
    postsPerMonth: 1000,
    platformCount: 6,
    webhooks: false,
    price: 2900, // cents ($29/mo)
  },
  team: {
    postsPerMonth: -1, // unlimited
    platformCount: -1, // all platforms
    webhooks: true,
    price: 9900, // cents ($99/mo)
  },
  /**
   * Founding rate — await Andrea's OSS/Closed decision before going live.
   * Struct added now so migration is clean; gate behind feature flag at launch.
   */
  team_founding: {
    postsPerMonth: -1, // unlimited
    platformCount: -1, // all platforms
    webhooks: true,
    price: 4900, // cents ($49/mo locked forever for first 50 customers)
    foundingSlots: 50,
  },
} as const;

export type OrgTier = keyof typeof TIER_LIMITS;

/**
 * All valid tier names as a string array (for Prisma enum generation + validation).
 */
export const TIER_VALUES: OrgTier[] = [
  'free',
  'pro',
  'team',
  'team_founding',
];

/**
 * Derive the monthly post quota from a tier.
 * Returns null for unlimited tiers (Prisma nullable Int → null = unlimited).
 */
export function getPostQuota(tier: OrgTier): number | null {
  const limit = TIER_LIMITS[tier].postsPerMonth;
  return limit === -1 ? null : limit;
}

/**
 * Derive the max platform count from a tier.
 * Returns null for unlimited tiers.
 */
export function getPlatformQuota(tier: OrgTier): number | null {
  const limit = TIER_LIMITS[tier].platformCount;
  return limit === -1 ? null : limit;
}

/**
 * Check whether webhooks are enabled for a given tier.
 */
export function webhooksEnabled(tier: OrgTier): boolean {
  return TIER_LIMITS[tier].webhooks;
}
