import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { User } from '@prisma/client';

export interface CreateUserDto {
  email: string;
  providerName?: string;
  timezone?: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

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
