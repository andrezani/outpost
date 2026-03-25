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

/**
 * Extract the API key from the request.
 * Supports two formats:
 *   - X-API-Key: sk_xxx              (primary)
 *   - Authorization: Bearer sk_xxx   (also accepted — agent-friendly)
 */
function extractApiKey(req: Request): string | null {
  // 1. X-API-Key header (preferred)
  const xApiKey = req.headers['x-api-key'];
  if (xApiKey && typeof xApiKey === 'string') {
    return xApiKey;
  }

  // 2. Authorization: Bearer <key>
  const authHeader = req.headers['authorization'];
  if (authHeader && typeof authHeader === 'string') {
    const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

@Injectable()
export class ApiKeyMiddleware implements NestMiddleware {
  constructor(private readonly prisma: PrismaService) {}

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const apiKey = extractApiKey(req);

    if (!apiKey) {
      throw new UnauthorizedException(
        'Missing API key. Provide it via X-API-Key header or Authorization: Bearer <key>',
      );
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
