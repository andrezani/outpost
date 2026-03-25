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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiSecurity,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PostsService } from './posts.service';
import type { CreatePostDto, UpdatePostDto } from './posts.service';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';
import { PostStatus } from '@prisma/client';

@ApiTags('Posts')
@ApiBearerAuth()
@ApiSecurity('X-API-Key')
@Controller('posts')
export class PostsController {
  constructor(private readonly service: PostsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a draft post',
    description:
      'Create a post record in DRAFT or SCHEDULED state. ' +
      'To publish immediately, use `POST /api/v1/publish` instead.',
  })
  @ApiResponse({ status: 201, description: 'Post created.' })
  @ApiResponse({ status: 400, description: 'Validation error.' })
  @ApiResponse({ status: 401, description: 'Invalid or missing API key.' })
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
  @ApiOperation({
    summary: 'List posts',
    description: 'Returns all posts for the authenticated organization, optionally filtered by status.',
  })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: PostStatus,
    description: 'Filter by post status.',
    example: 'PUBLISHED',
  })
  @ApiResponse({
    status: 200,
    description: 'Array of post objects.',
  })
  findAll(
    @Req() req: AuthenticatedRequest,
    @Query('status') status?: PostStatus,
  ) {
    return this.service.findByOrganization(req.organization.id, status);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get post by ID' })
  @ApiParam({ name: 'id', description: 'Post ID', example: 'cld1234abcd' })
  @ApiResponse({ status: 200, description: 'Post object.' })
  @ApiResponse({ status: 404, description: 'Post not found.' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  /**
   * GET /api/v1/posts/:id/status
   * Check publish status of a post — used by MCP get_post_status tool.
   * Returns: { id, status, publishedAt, url, error, postIntegrations }
   */
  @Get(':id/status')
  @ApiOperation({
    summary: 'Get post publish status',
    description:
      'Compact status endpoint for polling. Used by MCP `get_post_status` tool. ' +
      'Returns publish status, platform URLs, and any errors.',
  })
  @ApiParam({ name: 'id', description: 'Post ID', example: 'cld1234abcd' })
  @ApiResponse({
    status: 200,
    description: 'Post status summary.',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        status: { type: 'string', enum: ['DRAFT', 'SCHEDULED', 'PUBLISHED', 'FAILED'] },
        publishedAt: { type: 'string', format: 'date-time', nullable: true },
        postIntegrations: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              platform: { type: 'string' },
              status: { type: 'string', enum: ['PENDING', 'PUBLISHED', 'FAILED'] },
              url: { type: 'string', nullable: true },
              error: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Post not found.' })
  getStatus(@Param('id') id: string) {
    return this.service.getStatus(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update post' })
  @ApiParam({ name: 'id', description: 'Post ID', example: 'cld1234abcd' })
  @ApiResponse({ status: 200, description: 'Updated post object.' })
  @ApiResponse({ status: 404, description: 'Post not found.' })
  update(@Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete post' })
  @ApiParam({ name: 'id', description: 'Post ID', example: 'cld1234abcd' })
  @ApiResponse({ status: 200, description: 'Post deleted.' })
  @ApiResponse({ status: 404, description: 'Post not found.' })
  remove(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
