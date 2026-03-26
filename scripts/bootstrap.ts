#!/usr/bin/env ts-node
/**
 * bootstrap.ts — Admin bootstrap seed script
 *
 * Creates the first Hibernyte org + API key.
 * Safe to run multiple times — idempotent.
 *
 * Usage:
 *   npm run seed:admin
 *
 * Expected output:
 *   ✅ Org created: Hibernyte (id: abc-123)
 *   ✅ API Key: sa_xxxxxxxxxxxx
 *   ✅ Tier: free (100 posts/mo)
 */

import { PrismaClient, OrgTier } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as dotenv from 'dotenv';

dotenv.config();

const ORG_NAME = 'Hibernyte';
const TIER: OrgTier = OrgTier.free;
const POST_QUOTA = 100;
const PLATFORM_QUOTA = 3;

function generateApiKey(): string {
  return `sa_${randomBytes(32).toString('hex')}`;
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  try {
    // Check if org already exists
    const existing = await prisma.organization.findFirst({
      where: { name: ORG_NAME },
    });

    if (existing) {
      console.log(`\n⚡ Org already exists — printing existing credentials:\n`);
      console.log(`✅ Org found:   ${existing.name} (id: ${existing.id})`);
      console.log(`✅ API Key:     ${existing.apiKey}`);
      console.log(
        `✅ Tier:        ${existing.tier} (${existing.postQuota ?? '∞'} posts/mo)\n`,
      );
      return;
    }

    // Create org
    const org = await prisma.organization.create({
      data: {
        name: ORG_NAME,
        apiKey: generateApiKey(),
        tier: TIER,
        postQuota: POST_QUOTA,
        platformQuota: PLATFORM_QUOTA,
        isTrialing: true,
      },
    });

    console.log(`\n🚀 Bootstrap complete!\n`);
    console.log(`✅ Org created: ${org.name} (id: ${org.id})`);
    console.log(`✅ API Key:     ${org.apiKey}`);
    console.log(`✅ Tier:        ${org.tier} (${org.postQuota} posts/mo)\n`);
    console.log(
      `💡 Add to your .env:  OUTPOST_API_KEY="${org.apiKey}"\n`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('❌ Bootstrap failed:', err);
  process.exit(1);
});
