import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const adminKey = process.env.ADMIN_API_KEY;

    if (!adminKey) {
      throw new ServiceUnavailableException(
        'Admin API not configured — set ADMIN_API_KEY',
      );
    }

    const req = context.switchToHttp().getRequest<Request>();
    const provided = req.headers['x-admin-key'];

    if (!provided || provided !== adminKey) {
      throw new UnauthorizedException('Invalid or missing X-Admin-Key header');
    }

    return true;
  }
}
