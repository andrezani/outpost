import {
  Controller,
  Get,
  Post,
  Body,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
} from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { PrismaService } from '../../common/prisma.service';
import { EmailService } from '../../common/email.service';

class WaitlistDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  whatAreYouBuilding?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  source?: string;
}

/**
 * PublicController — unauthenticated public endpoints.
 *
 * These routes are intentionally unguarded (no API key required).
 * Do NOT add sensitive data here — stats + waitlist only.
 */
@ApiTags('Public')
@Controller('public')
export class PublicController {
  private static readonly FOUNDING_SEATS_TOTAL = 50;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

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

  /**
   * POST /api/v1/public/waitlist
   *
   * Captures a waitlist signup email from the landing page.
   * Idempotent: submitting the same email returns 200 (not 409).
   *
   * No authentication required.
   */
  @Post('waitlist')
  @ApiOperation({
    summary: 'Join the waitlist',
    description:
      'Captures an email address for the Outpost waitlist. ' +
      'Idempotent — submitting the same email twice returns 200 both times. ' +
      'No authentication required.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email', example: 'dev@company.ai' },
        firstName: {
          type: 'string',
          example: 'Sarah',
          description: 'Optional first name — used to personalize confirmation email',
        },
        whatAreYouBuilding: {
          type: 'string',
          example: 'An AI agent that posts my weekly learnings to LinkedIn',
          description: 'Optional — what the developer is building (max 280 chars)',
        },
        source: {
          type: 'string',
          example: 'landing',
          description: 'Where the signup came from (default: "landing")',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Email captured (already existed or newly created).',
    schema: {
      type: 'object',
      properties: {
        ok: { type: 'boolean', example: true },
        created: { type: 'boolean', example: true, description: 'false if email already on list' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid email address.',
  })
  async joinWaitlist(
    @Body() body: WaitlistDto,
  ): Promise<{ ok: boolean; created: boolean }> {
    const email = (body.email ?? '').trim().toLowerCase();
    if (!email) throw new BadRequestException('email is required');

    const source = body.source ?? 'landing';

    // Derive firstName from email prefix if not provided (e.g. "sarah@acme.com" → "Sarah")
    const firstName =
      body.firstName?.trim() ||
      (email.split('@')[0].replace(/[^a-z]/gi, '') || 'there').replace(/^\w/, (c) =>
        c.toUpperCase(),
      );

    const whatAreYouBuilding = body.whatAreYouBuilding?.trim() ?? null;

    try {
      await this.prisma.waitlistEntry.create({
        data: { email, source, firstName, whatAreYouBuilding },
      });
      void this.emailService.sendWaitlistConfirmation(email, firstName);
      return { ok: true, created: true };
    } catch (err: unknown) {
      // P2002 = unique constraint violation — email already on list
      const isPrismaUnique =
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2002';

      if (isPrismaUnique) {
        return { ok: true, created: false };
      }
      throw err;
    }
  }
}
