import { Controller, Get, Post, Body, Param, Patch, Req } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiSecurity,
  ApiParam,
} from '@nestjs/swagger';
import { OrganizationsService } from './organizations.service';
import type { CreateOrganizationDto } from './organizations.service';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';

@ApiTags('Organizations')
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create organization',
    description:
      'Creates a new organization and returns an API key. ' +
      'This is the only endpoint that does NOT require an API key. ' +
      'Alternatively, use `npm run seed:admin` for a pre-seeded Hibernyte org.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name'],
      properties: {
        name: { type: 'string', example: 'Hibernyte' },
        tier: {
          type: 'string',
          enum: ['free', 'pro', 'team', 'team_founding'],
          default: 'free',
          example: 'free',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Organization created. Store the apiKey — it cannot be retrieved again.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'cld1234abcd' },
        name: { type: 'string', example: 'Hibernyte' },
        apiKey: { type: 'string', example: 'sa_abc123...' },
        tier: { type: 'string', example: 'free' },
        postQuota: { type: 'number', example: 100 },
        platformQuota: { type: 'number', example: 3 },
        postsUsed: { type: 'number', example: 0 },
      },
    },
  })
  create(@Body() dto: CreateOrganizationDto) {
    return this.service.create(dto);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiSecurity('X-API-Key')
  @ApiOperation({
    summary: 'Get current organization',
    description: 'Returns the organization associated with the provided API key.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current organization object.',
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key.' })
  getMe(@Req() req: AuthenticatedRequest) {
    return req.organization;
  }

  @Get(':id')
  @ApiBearerAuth()
  @ApiSecurity('X-API-Key')
  @ApiOperation({ summary: 'Get organization by ID' })
  @ApiParam({ name: 'id', description: 'Organization CUID', example: 'cld1234abcd' })
  @ApiResponse({ status: 200, description: 'Organization object.' })
  @ApiResponse({ status: 404, description: 'Organization not found.' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id/rotate-api-key')
  @ApiBearerAuth()
  @ApiSecurity('X-API-Key')
  @ApiOperation({
    summary: 'Rotate API key',
    description:
      'Generates a new API key for the organization. The old key is immediately invalidated.',
  })
  @ApiParam({ name: 'id', description: 'Organization CUID', example: 'cld1234abcd' })
  @ApiResponse({ status: 200, description: 'Organization with new API key.' })
  @ApiResponse({ status: 404, description: 'Organization not found.' })
  rotateApiKey(@Param('id') id: string) {
    return this.service.rotateApiKey(id);
  }
}
