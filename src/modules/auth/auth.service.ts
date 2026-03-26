import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { User, Organization } from '@prisma/client';
import { TIER_LIMITS } from '../../common/tier-limits';

export interface CreateUserDto {
  email: string;
  providerName?: string;
  timezone?: string;
}

export interface RegisterDto {
  email: string;
  orgName?: string;
  timezone?: string;
}

export interface RegisterResult {
  apiKey: string;
  orgId: string;
  tier: string;
  limits: {
    postsPerMonth: number;
    platforms: number;
  };
  quickstart: string;
  created: boolean; // false = email already had an org (idempotent)
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  private generateApiKey(): string {
    return `op_live_${randomBytes(32).toString('hex')}`;
  }

  /**
   * Register a new developer org (self-service).
   *
   * Idempotent: if the email already has an org, returns the existing API key.
   * This means "get my key again" works without support tickets.
   */
  async register(dto: RegisterDto): Promise<RegisterResult> {
    const email = dto.email.trim().toLowerCase();
    const freeLimits = TIER_LIMITS.free;

    // Check if user already exists with an org
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
      include: {
        organizations: {
          include: { organization: true },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    if (existingUser?.organizations?.[0]) {
      const org = existingUser.organizations[0].organization;
      return {
        apiKey: org.apiKey,
        orgId: org.id,
        tier: org.tier,
        limits: {
          postsPerMonth: freeLimits.postsPerMonth,
          platforms: freeLimits.platformCount,
        },
        quickstart: 'https://outpost.dev/docs/quickstart',
        created: false,
      };
    }

    // New registration — create user + org + membership atomically
    const orgName = (dto.orgName ?? '').trim() || `${email.split('@')[0]}'s Workspace`;
    const apiKey = this.generateApiKey();

    const org: Organization = await this.prisma.$transaction(async (tx) => {
      const user = existingUser
        ? existingUser
        : await tx.user.create({
            data: {
              email,
              timezone: dto.timezone ?? 'UTC',
            },
          });

      const newOrg = await tx.organization.create({
        data: {
          name: orgName,
          apiKey,
          tier: 'free',
          postQuota: freeLimits.postsPerMonth,
          platformQuota: freeLimits.platformCount,
          isTrialing: false,
        },
      });

      await tx.userOrganization.create({
        data: {
          userId: user.id,
          organizationId: newOrg.id,
          role: 'OWNER',
        },
      });

      return newOrg;
    });

    return {
      apiKey: org.apiKey,
      orgId: org.id,
      tier: org.tier,
      limits: {
        postsPerMonth: freeLimits.postsPerMonth,
        platforms: freeLimits.platformCount,
      },
      quickstart: 'https://outpost.dev/docs/quickstart',
      created: true,
    };
  }

  async findOrCreateUser(dto: CreateUserDto): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existing) return existing;

    return this.prisma.user.create({ data: dto });
  }

  async findUserById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }
}
