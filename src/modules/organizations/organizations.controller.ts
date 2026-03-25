import { Controller, Get, Post, Body, Param, Patch, Req } from '@nestjs/common';
import { OrganizationsService } from './organizations.service';
import type { CreateOrganizationDto } from './organizations.service';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Post()
  create(@Body() dto: CreateOrganizationDto) {
    return this.service.create(dto);
  }

  @Get('me')
  getMe(@Req() req: AuthenticatedRequest) {
    return req.organization;
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id/rotate-api-key')
  rotateApiKey(@Param('id') id: string) {
    return this.service.rotateApiKey(id);
  }
}
