/**
 * PublicController tests
 *
 * Verifies the unauthenticated endpoints:
 *   GET  /api/v1/public/founding-seats  — founding seat counter
 *   POST /api/v1/public/waitlist        — waitlist signup
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PublicController } from '../../src/modules/billing/public.controller';
import { PrismaService } from '../../src/common/prisma.service';

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
    it('creates a new waitlist entry and returns created:true', async () => {
      mockPrismaService.waitlistEntry.create.mockResolvedValue({ id: 'wl_1', email: 'dev@ai.co', source: 'landing' });

      const result = await controller.joinWaitlist({ email: 'dev@ai.co' });

      expect(result).toEqual({ ok: true, created: true });
      expect(mockPrismaService.waitlistEntry.create).toHaveBeenCalledWith({
        data: { email: 'dev@ai.co', source: 'landing' },
      });
    });

    it('normalizes email to lowercase', async () => {
      mockPrismaService.waitlistEntry.create.mockResolvedValue({});

      await controller.joinWaitlist({ email: 'Dev@AI.Co' });

      expect(mockPrismaService.waitlistEntry.create).toHaveBeenCalledWith({
        data: { email: 'dev@ai.co', source: 'landing' },
      });
    });

    it('accepts a custom source field', async () => {
      mockPrismaService.waitlistEntry.create.mockResolvedValue({});

      await controller.joinWaitlist({ email: 'agent@company.ai', source: 'mcp-registry' });

      expect(mockPrismaService.waitlistEntry.create).toHaveBeenCalledWith({
        data: { email: 'agent@company.ai', source: 'mcp-registry' },
      });
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
