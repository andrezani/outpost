import { Injectable } from '@nestjs/common';
import { PostStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listOrgs(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [orgs, total] = await Promise.all([
      this.prisma.organization.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          tier: true,
          postsUsed: true,
          postQuota: true,
          createdAt: true,
          _count: { select: { integrations: true, users: true } },
        },
      }),
      this.prisma.organization.count(),
    ]);

    return {
      data: orgs.map((org) => ({
        id: org.id,
        name: org.name,
        tier: org.tier,
        postsUsed: org.postsUsed,
        postQuota: org.postQuota,
        createdAt: org.createdAt,
        integrationCount: org._count.integrations,
        userCount: org._count.users,
      })),
      total,
      page,
      limit,
    };
  }

  async getOrg(id: string) {
    return this.prisma.organization.findUniqueOrThrow({
      where: { id },
      include: {
        posts: { orderBy: { createdAt: 'desc' }, take: 5 },
        integrations: true,
        _count: { select: { users: true } },
      },
    });
  }

  async listWaitlist(page: number, limit: number) {
    const skip = (page - 1) * limit;
    const [entries, total] = await Promise.all([
      this.prisma.waitlistEntry.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          firstName: true,
          whatAreYouBuilding: true,
          source: true,
          createdAt: true,
        },
      }),
      this.prisma.waitlistEntry.count(),
    ]);

    return { data: entries, total, page, limit };
  }

  async getAllWaitlistEntries() {
    return this.prisma.waitlistEntry.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        email: true,
        firstName: true,
        whatAreYouBuilding: true,
        source: true,
        createdAt: true,
      },
    });
  }

  async getStats() {
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalOrgs,
      orgsByTier,
      totalWaitlist,
      waitlistLast24h,
      waitlistLast7d,
      totalPosts,
      publishedPosts,
      failedPosts,
      postsLast24h,
      totalIntegrations,
      integrationsByPlatform,
    ] = await Promise.all([
      this.prisma.organization.count(),
      this.prisma.organization.groupBy({ by: ['tier'], _count: { _all: true } }),
      this.prisma.waitlistEntry.count(),
      this.prisma.waitlistEntry.count({ where: { createdAt: { gte: last24h } } }),
      this.prisma.waitlistEntry.count({ where: { createdAt: { gte: last7d } } }),
      this.prisma.post.count(),
      this.prisma.post.count({ where: { status: PostStatus.PUBLISHED } }),
      this.prisma.post.count({ where: { status: PostStatus.FAILED } }),
      this.prisma.post.count({ where: { createdAt: { gte: last24h } } }),
      this.prisma.integration.count(),
      this.prisma.integration.groupBy({ by: ['identifier'], _count: { _all: true } }),
    ]);

    const byTier: Record<string, number> = { free: 0, pro: 0, team: 0, team_founding: 0 };
    for (const row of orgsByTier) {
      byTier[row.tier] = row._count._all;
    }

    const byPlatform: Record<string, number> = {};
    for (const row of integrationsByPlatform) {
      byPlatform[row.identifier] = row._count._all;
    }

    return {
      orgs: { total: totalOrgs, byTier },
      waitlist: { total: totalWaitlist, last24h: waitlistLast24h, last7d: waitlistLast7d },
      posts: { total: totalPosts, published: publishedPosts, failed: failedPosts, last24h: postsLast24h },
      integrations: { total: totalIntegrations, byPlatform },
    };
  }
}
