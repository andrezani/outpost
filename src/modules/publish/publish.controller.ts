import { Controller, Post, Body, Req, HttpCode, HttpStatus } from '@nestjs/common';
import { PublishService } from './publish.service';
import { PublishRequestDto } from './publish.dto';
import type { AuthenticatedRequest } from '../../middleware/api-key.middleware';

@Controller('publish')
export class PublishController {
  constructor(private readonly service: PublishService) {}

  /**
   * POST /api/v1/publish
   *
   * The unified publish endpoint. Agents call this to post to any platform.
   * Always returns a structured, agent-parseable response.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  publish(
    @Body() dto: PublishRequestDto,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.service.publish(req.organization.id, dto);
  }
}
