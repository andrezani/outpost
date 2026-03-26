import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthService } from './auth.service';
import type { CreateUserDto } from './auth.service';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';

class RegisterDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  orgName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly service: AuthService) {}

  /**
   * POST /api/v1/auth/register
   *
   * Self-service developer onboarding.
   * Idempotent — same email always returns the same org + API key.
   * No email verification, no credit card, no approval gate.
   *
   * No authentication required (excluded from ApiKeyMiddleware).
   */
  @Post('register')
  @ApiOperation({
    summary: 'Self-service registration — get your API key',
    description:
      'Creates a new organization and returns an API key. ' +
      'Free tier: 100 posts/month, 3 platforms. ' +
      'Idempotent: submitting the same email returns the existing org and key. ' +
      'No authentication required.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email', example: 'dev@company.ai' },
        orgName: {
          type: 'string',
          example: 'Acme Agent',
          description: 'Human name for your org. Defaults to "<user>\'s Workspace".',
        },
        timezone: {
          type: 'string',
          example: 'Europe/Paris',
          description: 'Optional timezone for scheduling (default: UTC).',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Registration successful — API key returned.',
    schema: {
      type: 'object',
      properties: {
        apiKey: {
          type: 'string',
          example: 'op_live_abc123...',
          description: 'Your API key. Save it — this is the only time it is returned (unless you call register again with the same email).',
        },
        orgId: { type: 'string', example: 'clx...' },
        tier: { type: 'string', example: 'free' },
        limits: {
          type: 'object',
          properties: {
            postsPerMonth: { type: 'number', example: 100 },
            platforms: { type: 'number', example: 3 },
          },
        },
        quickstart: { type: 'string', example: 'https://outpost.dev/docs/quickstart' },
        created: {
          type: 'boolean',
          description: 'true = new org created; false = existing org returned (idempotent)',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid or missing email.' })
  async register(@Body() dto: RegisterDto) {
    const email = (dto.email ?? '').trim();
    if (!email) throw new BadRequestException('email is required');
    return this.service.register(dto);
  }

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
