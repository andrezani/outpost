import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Integration, SocialPlatform } from '@prisma/client';

export interface CreateIntegrationDto {
  organizationId: string;
  token: string;
  refreshToken?: string;
  internalId: string;
  identifier: SocialPlatform;
}

export interface UpdateIntegrationDto {
  token?: string;
  refreshToken?: string;
  disabled?: boolean;
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
      throw new ConflictException(
        `Integration for ${dto.identifier} already exists in this organization`,
      );
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
