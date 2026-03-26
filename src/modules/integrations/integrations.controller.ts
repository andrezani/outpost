import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Req,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
  ApiParam,
} from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service';
import type {
  CreateIntegrationDto,
  UpdateIntegrationDto,
} from './integrations.service';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';

@ApiTags('Integrations')
@ApiBearerAuth()
@ApiSecurity('X-API-Key')
@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create integration',
    description: 'Directly create an integration record. Prefer `POST /accounts/connect/:platform` for OAuth flows.',
  })
  @ApiResponse({ status: 201, description: 'Integration created.' })
  create(
    @Body() dto: Omit<CreateIntegrationDto, 'organizationId'>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.create({
      ...dto,
      organizationId: req.organization.id,
    });
  }

  @Get()
  @ApiOperation({ summary: 'List integrations', description: 'Returns all integrations for the authenticated organization.' })
  @ApiResponse({ status: 200, description: 'Array of integration objects.' })
  findAll(@Req() req: AuthenticatedRequest) {
    return this.service.findByOrganization(req.organization.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get integration by ID' })
  @ApiParam({ name: 'id', description: 'Integration ID', example: 'cld1234abcd' })
  @ApiResponse({ status: 200, description: 'Integration object.' })
  @ApiResponse({ status: 404, description: 'Integration not found.' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update integration' })
  @ApiParam({ name: 'id', description: 'Integration ID', example: 'cld1234abcd' })
  @ApiResponse({ status: 200, description: 'Updated integration object.' })
  update(@Param('id') id: string, @Body() dto: UpdateIntegrationDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete integration' })
  @ApiParam({ name: 'id', description: 'Integration ID', example: 'cld1234abcd' })
  @ApiResponse({ status: 200, description: 'Integration deleted.' })
  remove(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
