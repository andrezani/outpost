/**
 * PublicController tests
 *
 * Verifies the unauthenticated /api/v1/public/founding-seats endpoint
 * returns correct counts and that it does NOT require an API key.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { PublicController } from '../../src/modules/billing/public.controller';
import { PrismaService } from '../../src/common/prisma.service';

const mockPrismaService = {
  organization: {
    count: jest.fn(),
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
});
