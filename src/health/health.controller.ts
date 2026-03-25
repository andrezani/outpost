import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({
    summary: 'Health check',
    description: 'Returns server status and timestamp.',
  })
  @ApiResponse({
    status: 200,
    description: 'Server is healthy.',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', format: 'date-time', example: '2026-03-25T06:00:00.000Z' },
      },
    },
  })
  check() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
