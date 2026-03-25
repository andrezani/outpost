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
import { IntegrationsService } from './integrations.service';
import type {
  CreateIntegrationDto,
  UpdateIntegrationDto,
} from './integrations.service';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';

@Controller('integrations')
export class IntegrationsController {
  constructor(private readonly service: IntegrationsService) {}

  @Post()
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
  findAll(@Req() req: AuthenticatedRequest) {
    return this.service.findByOrganization(req.organization.id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateIntegrationDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
