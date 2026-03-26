/**
 * PublicController tests
 *
 * Verifies the unauthenticated endpoints:
 *   GET  /api/v1/public/founding-seats  — founding seat counter
 *   POST /api/v1/public/waitlist        — waitlist signup (with firstName + whatAreYouBuilding)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PublicController } from '../../src/modules/billing/public.controller';
import { PrismaService } from '../../src/common/prisma.service';
import { EmailService } from '../../src/common/email.service';

// EmailService is injected into PublicController (Resend transactional emails).
// Mock it so tests don't require RESEND_API_KEY or ConfigService.
const mockEmailService = {
  sendWaitlistConfirmation: jest.fn().mockResolvedValue(undefined),
  sendApiKeyWelcome: jest.fn().mockResolvedValue(undefined),
};

const mockPrismaService = {
  organization: {
    count: jest.fn(),
  },
  waitlistEntry: {
    create: jest.fn(),
  },
};

describe('PublicController', () => {
  let controller: PublicController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PublicController],
      providers: [
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: EmailService, useValue: mockEmailService },
      ],
    }).compile();

    controller = module.get<PublicController>(PublicController);
    jest.clearAllMocks();
  });

  // ─── GET /public/founding-seats ────────────────────────────────────────────

  describe('GET /public/founding-seats', () => {
    it('returns correct counts when no founding seats taken', async () => {
      mockPrismaService.organization.count.mockResolvedValue(0);

      const result = await controller.getFoundingSeats();

      expect(result).toEqual({
        total: 50,
        taken: 0,
        remaining: 50,
        active: true,
      });
    });

    it('returns correct counts when some founding seats taken', async () => {
      mockPrismaService.organization.count.mockResolvedValue(12);

      const result = await controller.getFoundingSeats();

      expect(result).toEqual({
        total: 50,
        taken: 12,
        remaining: 38,
        active: true,
      });
    });

    it('returns active:false and remaining:0 when all 50 seats taken', async () => {
      mockPrismaService.organization.count.mockResolvedValue(50);

      const result = await controller.getFoundingSeats();

      expect(result).toEqual({
        total: 50,
        taken: 50,
        remaining: 0,
        active: false,
      });
    });

    it('caps remaining at 0 (never negative) if count exceeds 50', async () => {
      // Defensive: shouldn't happen in DB but guard against it
      mockPrismaService.organization.count.mockResolvedValue(55);

      const result = await controller.getFoundingSeats();

      expect(result.remaining).toBe(0);
      expect(result.active).toBe(false);
    });

    it('queries only team_founding tier organizations', async () => {
      mockPrismaService.organization.count.mockResolvedValue(5);

      await controller.getFoundingSeats();

      expect(mockPrismaService.organization.count).toHaveBeenCalledWith({
        where: { tier: 'team_founding' },
      });
    });
  });

  // ─── POST /public/waitlist ─────────────────────────────────────────────────

  describe('POST /public/waitlist', () => {
    it('creates a new waitlist entry with derived firstName and returns created:true', async () => {
      mockPrismaService.waitlistEntry.create.mockResolvedValue({ id: 'wl_1', email: 'dev@ai.co' });

      const result = await controller.joinWaitlist({ email: 'dev@ai.co' });

      expect(result).toEqual({ ok: true, created: true });
      // firstName derived from email prefix "dev" → "Dev"
      expect(mockPrismaService.waitlistEntry.create).toHaveBeenCalledWith({
        data: {
          email: 'dev@ai.co',
          source: 'landing',
          firstName: 'Dev',
          whatAreYouBuilding: null,
        },
      });
    });

    it('stores explicit firstName when provided', async () => {
      mockPrismaService.waitlistEntry.create.mockResolvedValue({});

      await controller.joinWaitlist({ email: 'sarah@company.ai', firstName: 'Sarah' });

      expect(mockPrismaService.waitlistEntry.create).toHaveBeenCalledWith({
        data: {
          email: 'sarah@company.ai',
          source: 'landing',
          firstName: 'Sarah',
          whatAreYouBuilding: null,
        },
      });
    });

    it('stores whatAreYouBuilding when provided', async () => {
      mockPrismaService.waitlistEntry.create.mockResolvedValue({});

      await controller.joinWaitlist({
        email: 'builder@ai.co',
        whatAreYouBuilding: 'An AI agent that posts my weekly learnings to LinkedIn',
      });

      expect(mockPrismaService.waitlistEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          whatAreYouBuilding: 'An AI agent that posts my weekly learnings to LinkedIn',
        }),
      });
    });

    it('normalizes email to lowercase', async () => {
      mockPrismaService.waitlistEntry.create.mockResolvedValue({});

      await controller.joinWaitlist({ email: 'Dev@AI.Co' });

      expect(mockPrismaService.waitlistEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ email: 'dev@ai.co' }),
      });
    });

    it('accepts a custom source field', async () => {
      mockPrismaService.waitlistEntry.create.mockResolvedValue({});

      await controller.joinWaitlist({ email: 'agent@company.ai', source: 'mcp-registry' });

      expect(mockPrismaService.waitlistEntry.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ source: 'mcp-registry' }),
      });
    });

    it('fires sendWaitlistConfirmation with email + firstName', async () => {
      mockPrismaService.waitlistEntry.create.mockResolvedValue({});

      await controller.joinWaitlist({ email: 'sarah@acme.ai', firstName: 'Sarah' });

      // Give void promise a tick to fire
      await new Promise((r) => setTimeout(r, 0));

      expect(mockEmailService.sendWaitlistConfirmation).toHaveBeenCalledWith('sarah@acme.ai', 'Sarah');
    });

    it('returns created:false (not 409) when email already on list', async () => {
      // P2002 = Prisma unique constraint violation
      const uniqueError = Object.assign(new Error('Unique constraint'), { code: 'P2002' });
      mockPrismaService.waitlistEntry.create.mockRejectedValue(uniqueError);

      const result = await controller.joinWaitlist({ email: 'existing@user.ai' });

      expect(result).toEqual({ ok: true, created: false });
    });

    it('re-throws non-unique Prisma errors', async () => {
      const dbError = Object.assign(new Error('DB connection lost'), { code: 'P1001' });
      mockPrismaService.waitlistEntry.create.mockRejectedValue(dbError);

      await expect(controller.joinWaitlist({ email: 'user@test.ai' })).rejects.toThrow('DB connection lost');
    });

    it('throws BadRequestException when email is empty string', async () => {
      await expect(
        controller.joinWaitlist({ email: '   ' }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
