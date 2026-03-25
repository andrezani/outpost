import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { Organization } from '@prisma/client';
import { randomBytes } from 'crypto';

export interface CreateOrganizationDto {
  name: string;
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateOrganizationDto): Promise<Organization> {
    const apiKey = `sa_${randomBytes(32).toString('hex')}`;
    return this.prisma.organization.create({
      data: {
        name: dto.name,
        apiKey,
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
}
