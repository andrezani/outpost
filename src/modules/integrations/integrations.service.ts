import {
  Injectable,
  NotFoundException,
  ConflictException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Integration, SocialPlatform } from '@prisma/client';
import { SocialAgentErrorCode } from '../../common/errors';
import type { OrgTier as TierKey } from '../../common/tier-limits';
import { getPlatformQuota } from '../../common/tier-limits';

export interface CreateIntegrationDto {
  organizationId: string;
  token: string;
  refreshToken?: string;
  internalId: string;
  identifier: SocialPlatform;
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
}

export interface UpdateIntegrationDto {
  token?: string;
  refreshToken?: string;
  disabled?: boolean;
  handle?: string;
  displayName?: string;
  avatarUrl?: string;
}

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateIntegrationDto): Promise<Integration> {
    const existing = await this.prisma.integration.findUnique({
      where: {
        organizationId_identifier_internalId: {
          organizationId: dto.organizationId,
          identifier: dto.identifier,
          internalId: dto.internalId,
        },
      },
    });

    if (existing) {
      if (!existing.disabled) {
        throw new ConflictException(
          `Integration for ${dto.identifier} already exists in this organization`,
        );
      }
      // Re-enable and update token for a previously disabled integration
      return this.prisma.integration.update({
        where: { id: existing.id },
        data: {
          token: dto.token,
          refreshToken: dto.refreshToken,
          disabled: false,
          handle: dto.handle,
          displayName: dto.displayName,
          avatarUrl: dto.avatarUrl,
        },
      });
    }

    // Enforce per-org platform quota (derived from tier)
    const org = await this.prisma.organization.findUnique({
      where: { id: dto.organizationId },
    });
    if (!org) throw new NotFoundException('Organization not found');

    if (org.platformQuota !== null) {
      const activeCount = await this.prisma.integration.count({
        where: { organizationId: dto.organizationId, disabled: false },
      });
      if (activeCount >= org.platformQuota) {
        const tierQuota = getPlatformQuota(org.tier as TierKey) ?? activeCount;
        throw new HttpException(
          {
            success: false,
            error: {
              code: SocialAgentErrorCode.PLATFORM_QUOTA_EXCEEDED,
              message: `Your ${org.tier} plan allows up to ${tierQuota} connected platforms. You have ${activeCount}.`,
              agentHint:
                'Disconnect an existing platform integration or upgrade your plan. ' +
                'Use DELETE /api/v1/integrations/:id to remove one.',
            },
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }

    return this.prisma.integration.create({ data: dto });
  }

  async findByOrganization(organizationId: string): Promise<Integration[]> {
    return this.prisma.integration.findMany({
      where: { organizationId, disabled: false },
    });
  }

  async findById(id: string): Promise<Integration> {
    const integration = await this.prisma.integration.findUnique({
      where: { id },
    });
    if (!integration) throw new NotFoundException(`Integration ${id} not found`);
    return integration;
  }

  async update(id: string, dto: UpdateIntegrationDto): Promise<Integration> {
    await this.findById(id);
    return this.prisma.integration.update({ where: { id }, data: dto });
  }

  async disable(id: string): Promise<Integration> {
    await this.findById(id);
    return this.prisma.integration.update({
      where: { id },
      data: { disabled: true },
    });
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.integration.delete({ where: { id } });
  }
}
