import { Controller, Post, Body, Get, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import type { CreateUserDto } from './auth.service';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';

@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('users')
  createUser(@Body() dto: CreateUserDto) {
    return this.service.findOrCreateUser(dto);
  }

  @Get('me')
  getMe(@Req() req: AuthenticatedRequest) {
    return req.organization;
  }
}
