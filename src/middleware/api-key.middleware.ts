import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../common/prisma.service';
import { Organization } from '@prisma/client';

export interface AuthenticatedRequest extends Request {
  organization: Organization;
}

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const apiKey = req.headers['x-api-key'];

    if (!apiKey || typeof apiKey !== 'string') {
      throw new UnauthorizedException('Missing X-API-Key header');
    }

    const organization = await this.prisma.organization.findUnique({
      where: { apiKey },
    });

    if (!organization) {
      throw new UnauthorizedException('Invalid API key');
    }

    (req as AuthenticatedRequest).organization = organization;
    next();
  }
}
