import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma.service';

/**
 * PublicController — unauthenticated public endpoints.
 *
 * These routes are intentionally unguarded (no API key required).
 * Do NOT add sensitive data here — stats only.
 */
@ApiTags('Public')
@Controller('public')
export class PublicController {
  private static readonly FOUNDING_SEATS_TOTAL = 50;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/v1/public/founding-seats
   *
   * Returns how many founding-rate Team seats are still available.
   * Used by the landing page counter ("🔥 X/50 founding seats left").
   *
   * No authentication required.
   */
  @Get('founding-seats')
  @ApiOperation({
    summary: 'Founding seats remaining',
    description:
      'Returns the number of founding-rate Team seats still available (out of 50 total). ' +
      'Used by the landing page to show a live "X/50 founding seats left" counter. ' +
      'No authentication required.',
  })
  @ApiResponse({
    status: 200,
    description: 'Founding seat count.',
    schema: {
      type: 'object',
      properties: {
        total: { type: 'number', example: 50 },
        taken: { type: 'number', example: 3 },
        remaining: { type: 'number', example: 47 },
        active: { type: 'boolean', example: true, description: 'false when all seats are taken' },
      },
    },
  })
  async getFoundingSeats(): Promise<{
    total: number;
    taken: number;
    remaining: number;
    active: boolean;
  }> {
    const taken = await this.prisma.organization.count({
      where: { tier: 'team_founding' },
    });

    const remaining = Math.max(0, PublicController.FOUNDING_SEATS_TOTAL - taken);

    return {
      total: PublicController.FOUNDING_SEATS_TOTAL,
      taken,
      remaining,
      active: remaining > 0,
    };
  }
}
