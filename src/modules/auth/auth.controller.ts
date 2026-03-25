import { Controller, Post, Body, Get, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import type { CreateUserDto } from './auth.service';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  @Post('users')
  @ApiOperation({
    summary: 'Create or find user',
    description: 'Find an existing user by email or create a new one.',
  })
  @ApiResponse({ status: 201, description: 'User created or found.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  createUser(@Body() dto: CreateUserDto) {
    return this.service.findOrCreateUser(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiSecurity('X-API-Key')
  @ApiOperation({
    summary: 'Get authenticated org',
    description: 'Returns the organization associated with the current API key.',
  })
  @ApiResponse({ status: 200, description: 'Organization object.' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key.' })
  getMe(@Req() req: AuthenticatedRequest) {
    return req.organization;
  }
}
