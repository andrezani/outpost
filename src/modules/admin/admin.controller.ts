import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
  Res,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  NotFoundException,
} from '@nestjs/common';
import { IsEnum } from 'class-validator';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { TierService } from '../billing/tier.service';
import type { OrgTier } from '../../common/tier-limits';
import { TIER_VALUES } from '../../common/tier-limits';

class UpdateTierDto {
  @IsEnum(TIER_VALUES, { message: 'tier must be one of: free, pro, team, team_founding' })
  tier!: string;
}

// Minimal response shape needed for CSV streaming — avoids emitDecoratorMetadata issues
// with the express Response interface (mirrors the stripe-webhook controller pattern).
type StreamResponse = {
  setHeader(name: string, value: string): void;
  write(data: string): boolean;
  end(): void;
};

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly tierService: TierService,
  ) {}

  @Get('orgs')
  listOrgs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.listOrgs(page, limit);
  }

  @Get('orgs/:id')
  async getOrg(@Param('id') id: string) {
    try {
      return await this.adminService.getOrg(id);
    } catch {
      throw new NotFoundException(`Organization ${id} not found`);
    }
  }

  @Patch('orgs/:id/tier')
  updateTier(@Param('id') id: string, @Body() dto: UpdateTierDto) {
    return this.tierService.setTier(id, dto.tier as OrgTier);
  }

  @Get('waitlist/export.csv')
  async exportWaitlist(@Res() res: StreamResponse) {
    const entries = await this.adminService.getAllWaitlistEntries();

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="waitlist.csv"');

    res.write('email,firstName,whatAreYouBuilding,source,createdAt\n');

    for (const entry of entries) {
      const row = [
        entry.email,
        entry.firstName ?? '',
        entry.whatAreYouBuilding ?? '',
        entry.source,
        entry.createdAt.toISOString(),
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
      res.write(row + '\n');
    }

    res.end();
  }

  @Get('waitlist')
  listWaitlist(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.listWaitlist(page, limit);
  }

  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }
}
