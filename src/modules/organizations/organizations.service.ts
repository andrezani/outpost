import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Organization, OrgTier } from '@prisma/client';
import { randomBytes } from 'crypto';
import {
  getPostQuota,
  getPlatformQuota,
  TIER_VALUES,
  OrgTier as TierKey,
} from '../../common/tier-limits';

export interface CreateOrganizationDto {
  name: string;
  tier?: TierKey;
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    const tier: TierKey = dto.tier ?? 'free';
    const apiKey = `sa_${randomBytes(32).toString('hex')}`;

    return this.prisma.organization.create({
      data: {
        name: dto.name,
        apiKey,
        tier: tier as OrgTier,
        postQuota: getPostQuota(tier),
        platformQuota: getPlatformQuota(tier),
      },
    });
  }

  async findById(id: string): Promise<Organization> {
    const org = await this.prisma.organization.findUnique({ where: { id } });
    if (!org) throw new NotFoundException(`Organization ${id} not found`);
    return org;
  }

  async findByApiKey(apiKey: string): Promise<Organization | null> {
    return this.prisma.organization.findUnique({ where: { apiKey } });
  }

  async rotateApiKey(id: string): Promise<Organization> {
    const newApiKey = `sa_${randomBytes(32).toString('hex')}`;
    return this.prisma.organization.update({
      where: { id },
      data: { apiKey: newApiKey },
    });
  }

  /**
   * Upgrade (or downgrade) an organization's tier.
   * Updates both the tier enum AND the derived quota caches.
   */
  async setTier(id: string, tier: TierKey): Promise<Organization> {
    if (!TIER_VALUES.includes(tier)) {
      throw new BadRequestException(
        `Invalid tier: ${tier}. Valid tiers: ${TIER_VALUES.join(', ')}`,
      );
    }

    return this.prisma.organization.update({
      where: { id },
      data: {
        tier: tier as OrgTier,
        postQuota: getPostQuota(tier),
        platformQuota: getPlatformQuota(tier),
      },
    });
  }
}
