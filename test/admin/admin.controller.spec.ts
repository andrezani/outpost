/**
 * AdminController + AdminGuard tests
 *
 * Covers:
 *   - Stats endpoint returns correct shape
 *   - Waitlist pagination passes arguments through
 *   - Org tier PATCH delegates to TierService.setTier
 *   - Unauthenticated request (wrong/missing key) → 401
 *   - Missing ADMIN_API_KEY env var → 503
 */
import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { AdminController } from '../../src/modules/admin/admin.controller';
import { AdminGuard } from '../../src/modules/admin/admin.guard';
import { AdminService } from '../../src/modules/admin/admin.service';
import { TierService } from '../../src/modules/billing/tier.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeContext(adminKeyHeader: string | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: adminKeyHeader !== undefined ? { 'x-admin-key': adminKeyHeader } : {},
      }),
    }),
  } as unknown as ExecutionContext;
}

const mockStats = {
  orgs: { total: 5, byTier: { free: 3, pro: 1, team: 1, team_founding: 0 } },
  waitlist: { total: 42, last24h: 3, last7d: 12 },
  posts: { total: 100, published: 80, failed: 5, last24h: 10 },
  integrations: { total: 20, byPlatform: { x: 10, linkedin: 5, bluesky: 5 } },
};

// ─── AdminGuard unit tests ─────────────────────────────────────────────────────

describe('AdminGuard', () => {
  let guard: AdminGuard;
  let savedKey: string | undefined;

  beforeEach(() => {
    guard = new AdminGuard();
    savedKey = process.env.ADMIN_API_KEY;
  });

  afterEach(() => {
    if (savedKey === undefined) {
      delete process.env.ADMIN_API_KEY;
    } else {
      process.env.ADMIN_API_KEY = savedKey;
    }
  });

  it('throws ServiceUnavailableException (503) when ADMIN_API_KEY is not set', () => {
    delete process.env.ADMIN_API_KEY;
    expect(() => guard.canActivate(makeContext('any-key'))).toThrow(
      ServiceUnavailableException,
    );
  });

  it('throws UnauthorizedException (401) when X-Admin-Key header is missing', () => {
    process.env.ADMIN_API_KEY = 'secret';
    expect(() => guard.canActivate(makeContext(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it('throws UnauthorizedException (401) when X-Admin-Key header is wrong', () => {
    process.env.ADMIN_API_KEY = 'secret';
    expect(() => guard.canActivate(makeContext('wrong'))).toThrow(
      UnauthorizedException,
    );
  });

  it('returns true when X-Admin-Key matches ADMIN_API_KEY', () => {
    process.env.ADMIN_API_KEY = 'secret';
    expect(guard.canActivate(makeContext('secret'))).toBe(true);
  });
});

// ─── AdminController unit tests ───────────────────────────────────────────────

describe('AdminController', () => {
  let controller: AdminController;
  let adminService: jest.Mocked<AdminService>;
  let tierService: jest.Mocked<TierService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: {
            listOrgs: jest.fn(),
            getOrg: jest.fn(),
            listWaitlist: jest.fn(),
            getAllWaitlistEntries: jest.fn(),
            getStats: jest.fn(),
          },
        },
        {
          provide: TierService,
          useValue: {
            setTier: jest.fn(),
          },
        },
      ],
    })
      .overrideGuard(AdminGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminController>(AdminController);
    adminService = module.get(AdminService) as jest.Mocked<AdminService>;
    tierService = module.get(TierService) as jest.Mocked<TierService>;
    jest.clearAllMocks();
  });

  // ─── Stats endpoint ───────────────────────────────────────────────────────

  describe('GET /admin/stats', () => {
    it('returns correct shape with all required keys', async () => {
      adminService.getStats.mockResolvedValue(mockStats);

      const result = await controller.getStats();

      expect(result).toMatchObject({
        orgs: expect.objectContaining({
          total: expect.any(Number),
          byTier: expect.objectContaining({
            free: expect.any(Number),
            pro: expect.any(Number),
            team: expect.any(Number),
            team_founding: expect.any(Number),
          }),
        }),
        waitlist: expect.objectContaining({
          total: expect.any(Number),
          last24h: expect.any(Number),
          last7d: expect.any(Number),
        }),
        posts: expect.objectContaining({
          total: expect.any(Number),
          published: expect.any(Number),
          failed: expect.any(Number),
          last24h: expect.any(Number),
        }),
        integrations: expect.objectContaining({
          total: expect.any(Number),
          byPlatform: expect.any(Object),
        }),
      });
    });
  });

  // ─── Waitlist pagination ──────────────────────────────────────────────────

  describe('GET /admin/waitlist', () => {
    it('passes page and limit to AdminService.listWaitlist', async () => {
      adminService.listWaitlist.mockResolvedValue({
        data: [],
        total: 0,
        page: 2,
        limit: 10,
      });

      await controller.listWaitlist(2, 10);

      expect(adminService.listWaitlist).toHaveBeenCalledWith(2, 10);
    });

    it('returns paginated response from AdminService', async () => {
      const payload = { data: [], total: 50, page: 3, limit: 5 };
      adminService.listWaitlist.mockResolvedValue(payload);

      const result = await controller.listWaitlist(3, 5);

      expect(result).toEqual(payload);
    });
  });

  // ─── Org tier patch ───────────────────────────────────────────────────────

  describe('PATCH /admin/orgs/:id/tier', () => {
    it('calls TierService.setTier with org id and tier', async () => {
      tierService.setTier.mockResolvedValue({ id: 'org1', tier: 'pro' } as never);

      await controller.updateTier('org1', { tier: 'pro' });

      expect(tierService.setTier).toHaveBeenCalledWith('org1', 'pro');
    });

    it('returns the updated org from TierService', async () => {
      const updated = { id: 'org1', tier: 'team' };
      tierService.setTier.mockResolvedValue(updated as never);

      const result = await controller.updateTier('org1', { tier: 'team' });

      expect(result).toEqual(updated);
    });
  });
});
