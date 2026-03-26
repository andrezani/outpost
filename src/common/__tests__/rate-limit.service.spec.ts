import { SocialPlatform } from '@prisma/client';
import { RateLimitService } from '../rate-limit.service';
import { RedisService } from '../redis.service';

/**
 * RateLimitService unit tests.
 * All tests mock RedisService — no real Redis connection needed.
 */
describe('RateLimitService', () => {
  let service: RateLimitService;
  let mockRedis: jest.Mocked<RedisService>;
  let mockPipeline: {
    incr: jest.MockedFunction<(key: string) => unknown>;
    pexpire: jest.MockedFunction<(key: string, ms: number) => unknown>;
    exec: jest.MockedFunction<() => Promise<Array<[Error | null, unknown]>>>;
  };

  beforeEach(() => {
    mockPipeline = {
      incr: jest.fn().mockReturnThis(),
      pexpire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([[null, 1], [null, 1]]),
    };

    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      getClient: jest.fn().mockReturnValue({
        pipeline: jest.fn().mockReturnValue(mockPipeline),
      }),
    } as unknown as jest.Mocked<RedisService>;

    service = new RateLimitService(mockRedis);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ─── increment ─────────────────────────────────────────────────────────────

  describe('increment', () => {
    it('should increment counter and return status with used=1', async () => {
      mockPipeline.exec.mockResolvedValueOnce([[null, 1], [null, 1]]);

      const result = await service.increment('acc_123', SocialPlatform.x);

      expect(result.used).toBe(1);
      expect(result.limit).toBeGreaterThan(0);
      expect(result.remaining).toBe(result.limit - 1);
      expect(result.resetAt).toBeTruthy();
      expect(typeof result.windowMinutes).toBe('number');
    });

    it('should compute remaining as limit - used', async () => {
      mockPipeline.exec.mockResolvedValueOnce([[null, 10], [null, 1]]);

      const result = await service.increment('acc_123', SocialPlatform.bluesky);

      expect(result.used).toBe(10);
      expect(result.remaining).toBe(result.limit - 10);
    });

    it('should clamp remaining to 0 when over limit', async () => {
      // Simulate going over limit
      mockPipeline.exec.mockResolvedValueOnce([[null, 9999], [null, 1]]);

      const result = await service.increment('acc_123', SocialPlatform.x);

      expect(result.remaining).toBe(0);
    });

    it('should degrade gracefully when Redis throws', async () => {
      mockRedis.getClient.mockReturnValue({
        pipeline: jest.fn().mockReturnValue({
          incr: jest.fn().mockReturnThis(),
          pexpire: jest.fn().mockReturnThis(),
          exec: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
        }),
      } as unknown as ReturnType<RedisService['getClient']>);

      const result = await service.increment('acc_123', SocialPlatform.reddit);

      // Should not throw — returns static caps
      expect(result.used).toBe(0);
      expect(result.limit).toBeGreaterThan(0);
      expect(result.remaining).toBe(result.limit);
    });

    it('should use correct window for X (15min)', async () => {
      mockPipeline.exec.mockResolvedValueOnce([[null, 1], [null, 1]]);

      const result = await service.increment('acc_123', SocialPlatform.x);

      expect(result.windowMinutes).toBe(15);
    });

    it('should use correct window for Bluesky (24h)', async () => {
      mockPipeline.exec.mockResolvedValueOnce([[null, 1], [null, 1]]);

      const result = await service.increment('acc_123', SocialPlatform.bluesky);

      expect(result.windowMinutes).toBe(1440); // 24 * 60
    });

    it('should use correct limit for Reddit (10/10min)', async () => {
      mockPipeline.exec.mockResolvedValueOnce([[null, 5], [null, 1]]);

      const result = await service.increment('acc_123', SocialPlatform.reddit);

      expect(result.limit).toBe(10);
      expect(result.windowMinutes).toBe(10);
    });
  });

  // ─── getStatus ─────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('should return used=0 when no key in Redis', async () => {
      mockRedis.get.mockResolvedValueOnce(null);

      const result = await service.getStatus('acc_123', SocialPlatform.linkedin);

      expect(result.used).toBe(0);
      expect(result.remaining).toBe(result.limit);
    });

    it('should return live count from Redis', async () => {
      mockRedis.get.mockResolvedValueOnce('42');

      const result = await service.getStatus('acc_123', SocialPlatform.threads);

      expect(result.used).toBe(42);
      expect(result.remaining).toBe(result.limit - 42);
    });

    it('should degrade gracefully when Redis.get throws', async () => {
      mockRedis.get.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.getStatus('acc_123', SocialPlatform.instagram);

      // Should not throw — returns static caps
      expect(result.used).toBe(0);
      expect(result.limit).toBeGreaterThan(0);
    });

    it('should return correct resetAt as ISO string', async () => {
      mockRedis.get.mockResolvedValueOnce('5');

      const result = await service.getStatus('acc_123', SocialPlatform.x);

      expect(() => new Date(result.resetAt)).not.toThrow();
      const reset = new Date(result.resetAt);
      expect(reset.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
