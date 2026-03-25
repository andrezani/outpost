import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import type { CreatePostDto, UpdatePostDto } from './posts.service';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';
import { PostStatus } from '@prisma/client';

@Controller('posts')
export class PostsController {
  constructor(private readonly service: PostsService) {}

  @Post()
  create(
    @Body() dto: Omit<CreatePostDto, 'organizationId'>,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.create({
      ...dto,
      organizationId: req.organization.id,
    });
  }

  @Get()
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: PostStatus,
  ) {
    return this.service.findByOrganization(req.organization.id, status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
