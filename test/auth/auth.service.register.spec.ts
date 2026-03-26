/**
 * AuthService.register() tests
 *
 * Covers the self-service onboarding endpoint:
 *   POST /api/v1/auth/register → op_live_xxx API key
 */
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '../../src/modules/auth/auth.service';
import { PrismaService } from '../../src/common/prisma.service';
import { TIER_LIMITS } from '../../src/common/tier-limits';

// Minimal mock org returned by Prisma
const mockOrg = {
  id: 'org_001',
  name: "dev's Workspace",
  apiKey: 'op_live_abc123',
  tier: 'free',
  postQuota: 100,
  platformQuota: 3,
  isTrialing: false,
  postsUsed: 0,
  quotaResetAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  paymentId: null,
};

const mockUser = {
  id: 'user_001',
  email: 'dev@ai.co',
  providerName: null,
  timezone: 'UTC',
  createdAt: new Date(),
  updatedAt: new Date(),
  organizations: [],
};

const mockUserWithOrg = {
  ...mockUser,
  organizations: [
    { organization: mockOrg, createdAt: new Date() },
  ],
};

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  organization: {
    create: jest.fn(),
  },
  userOrganization: {
    create: jest.fn(),
  },
  $transaction: jest.fn(),
};

describe('AuthService.register()', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  it('creates a new org and returns op_live_ API key + created:true', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null); // no existing user

    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.organization.create.mockResolvedValue(mockOrg);
      mockPrisma.userOrganization.create.mockResolvedValue({});
      return fn(mockPrisma);
    });

    const result = await service.register({ email: 'dev@ai.co' });

    expect(result.created).toBe(true);
    expect(result.apiKey).toMatch(/^op_live_/);
    expect(result.tier).toBe('free');
    expect(result.limits.postsPerMonth).toBe(TIER_LIMITS.free.postsPerMonth);
    expect(result.limits.platforms).toBe(TIER_LIMITS.free.platformCount);
    expect(result.quickstart).toContain('outpost.dev');
  });

  it('normalizes email to lowercase before lookup', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.organization.create.mockResolvedValue(mockOrg);
      mockPrisma.userOrganization.create.mockResolvedValue({});
      return fn(mockPrisma);
    });

    await service.register({ email: 'Dev@AI.Co' });

    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'dev@ai.co' } }),
    );
  });

  it('returns existing org with created:false when email already registered', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUserWithOrg);

    const result = await service.register({ email: 'dev@ai.co' });

    expect(result.created).toBe(false);
    expect(result.apiKey).toBe(mockOrg.apiKey);
    expect(result.orgId).toBe(mockOrg.id);
    // Should NOT call $transaction — idempotent path
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it('uses provided orgName when given', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    let capturedOrgData: Record<string, unknown> = {};
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.organization.create.mockImplementation((args: { data: Record<string, unknown> }) => {
        capturedOrgData = args.data;
        return Promise.resolve(mockOrg);
      });
      mockPrisma.userOrganization.create.mockResolvedValue({});
      return fn(mockPrisma);
    });

    await service.register({ email: 'dev@ai.co', orgName: 'Acme Agent' });

    expect(capturedOrgData['name']).toBe('Acme Agent');
  });

  it('defaults orgName to "<user>\'s Workspace" when not provided', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    let capturedOrgData: Record<string, unknown> = {};
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.organization.create.mockImplementation((args: { data: Record<string, unknown> }) => {
        capturedOrgData = args.data;
        return Promise.resolve(mockOrg);
      });
      mockPrisma.userOrganization.create.mockResolvedValue({});
      return fn(mockPrisma);
    });

    await service.register({ email: 'alice@company.ai' });

    expect(capturedOrgData['name']).toBe("alice's Workspace");
  });

  it('creates user as OWNER of the org', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    let capturedMembership: Record<string, unknown> = {};
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: typeof mockPrisma) => Promise<unknown>) => {
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.organization.create.mockResolvedValue(mockOrg);
      mockPrisma.userOrganization.create.mockImplementation((args: { data: Record<string, unknown> }) => {
        capturedMembership = args.data;
        return Promise.resolve({});
      });
      return fn(mockPrisma);
    });

    await service.register({ email: 'dev@ai.co' });

    expect(capturedMembership['role']).toBe('OWNER');
    expect(capturedMembership['userId']).toBe(mockUser.id);
    expect(capturedMembership['organizationId']).toBe(mockOrg.id);
  });
});
