import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Post, PostStatus, PostIntegration } from '@prisma/client';

export interface CreatePostDto {
  organizationId: string;
  content: string;
  scheduledAt?: Date;
  integrationIds?: string[];
}

export interface UpdatePostDto {
  content?: string;
  scheduledAt?: Date;
  status?: PostStatus;
}

export type PostWithIntegrations = Post & {
  postIntegrations: PostIntegration[];
};

@Injectable()
export class PostsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreatePostDto): Promise<PostWithIntegrations> {
    const { integrationIds, ...postData } = dto;

    return this.prisma.post.create({
      data: {
        ...postData,
        status: postData.scheduledAt ? PostStatus.SCHEDULED : PostStatus.DRAFT,
        postIntegrations: integrationIds?.length
          ? {
              create: integrationIds.map((integrationId) => ({
                integrationId,
              })),
            }
          : undefined,
      },
      include: { postIntegrations: true },
    });
  }

  async findByOrganization(
    organizationId: string,
    status?: PostStatus,
  ): Promise<PostWithIntegrations[]> {
    return this.prisma.post.findMany({
      where: { organizationId, ...(status ? { status } : {}) },
      include: { postIntegrations: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string): Promise<PostWithIntegrations> {
    const post = await this.prisma.post.findUnique({
      where: { id },
      include: { postIntegrations: true },
    });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    return post;
  }

  async update(id: string, dto: UpdatePostDto): Promise<Post> {
    await this.findById(id);
    return this.prisma.post.update({ where: { id }, data: dto });
  }

  async delete(id: string): Promise<void> {
    await this.findById(id);
    await this.prisma.post.delete({ where: { id } });
  }

  /**
   * Find scheduled posts that are due to be published.
   * Used by Inngest scheduled job.
   */
  async findDueScheduledPosts(): Promise<PostWithIntegrations[]> {
    return this.prisma.post.findMany({
      where: {
        status: PostStatus.SCHEDULED,
        scheduledAt: { lte: new Date() },
      },
      include: { postIntegrations: true },
    });
  }

  async markPublished(id: string): Promise<Post> {
    return this.prisma.post.update({
      where: { id },
      data: { status: PostStatus.PUBLISHED, publishedAt: new Date() },
    });
  }

  /**
   * Get a compact status summary for the MCP get_post_status tool.
   * Returns the post status + per-platform publish results.
   */
  async getStatus(id: string): Promise<{
    id: string;
    status: PostStatus;
    publishedAt: Date | null;
    platforms: Array<{
      integrationId: string;
      status: string;
      externalId: string | null;
      url: string | null;
      error: string | null;
    }>;
  }> {
    const post = await this.findById(id);
    return {
      id: post.id,
      status: post.status,
      publishedAt: post.publishedAt,
      platforms: post.postIntegrations.map((pi) => ({
        integrationId: pi.integrationId,
        status: pi.status,
        externalId: pi.externalId,
        url: pi.url,
        error: pi.error,
      })),
    };
  }

  async markFailed(id: string, error?: string): Promise<Post> {
    return this.prisma.post.update({
      where: { id },
      data: {
        status: PostStatus.FAILED,
        postIntegrations: {
          updateMany: {
            where: { postId: id },
            data: { status: 'FAILED', error: error ?? 'Unknown error' },
          },
        },
      },
    });
  }
}
