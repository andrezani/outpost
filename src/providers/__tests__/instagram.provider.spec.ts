import { InstagramProvider } from '../instagram.provider';
import { SocialPlatform } from '@prisma/client';

/**
 * Instagram provider integration test skeletons.
 * No real API calls are made — all external fetch calls are mocked.
 */
describe('InstagramProvider', () => {
  const CLIENT_ID = 'test-client-id';
  const CLIENT_SECRET = 'test-client-secret';
  const ACCESS_TOKEN = 'test-access-token';

  let provider: InstagramProvider;

  beforeEach(() => {
    provider = new InstagramProvider(CLIENT_ID, CLIENT_SECRET);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Identity
  // ─────────────────────────────────────────────────────────────────────────

  it('should have platform = instagram', () => {
    expect(provider.platform).toBe(SocialPlatform.instagram);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // OAuth
  // ─────────────────────────────────────────────────────────────────────────

  describe('buildAuthUrl', () => {
    it('should build a valid Facebook OAuth URL', () => {
      const url = provider.buildAuthUrl('https://app.example.com/callback', 'state-abc');
      expect(url).toContain('www.facebook.com/v19.0/dialog/oauth');
      expect(url).toContain(CLIENT_ID);
      expect(url).toContain('instagram_basic');
      expect(url).toContain('instagram_content_publish');
      expect(url).toContain('state-abc');
    });
  });

  describe('refreshToken', () => {
    it('should refresh a long-lived token', async () => {
      const mockResponse = {
        access_token: 'new-long-lived-token',
        expires_in: 5183944,
      };

      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await provider.refreshToken(ACCESS_TOKEN);

      expect(result.token).toBe('new-long-lived-token');
      expect(result.refreshToken).toBe('new-long-lived-token'); // IG uses token as refresh
    });

    it('should throw on failed token refresh', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'Invalid token' } }),
      } as Response);

      await expect(provider.refreshToken('bad-token')).rejects.toThrow(
        'Instagram token refresh failed: Invalid token',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getProfile
  // ─────────────────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('should return a ProviderProfile', async () => {
      // Mock: getInstagramAccountId calls (me/accounts + page IG account)
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ id: 'page-id-1', access_token: 'page-token-1' }],
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            instagram_business_account: { id: 'ig-account-123' },
          }),
        } as Response)
        // Mock: getProfile fields call
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'ig-account-123',
            username: 'testuser',
            name: 'Test User',
            profile_picture_url: 'https://example.com/avatar.jpg',
          }),
        } as Response);

      const profile = await provider.getProfile(ACCESS_TOKEN);

      expect(profile.id).toBe('ig-account-123');
      expect(profile.username).toBe('testuser');
      expect(profile.displayName).toBe('Test User');
      expect(profile.avatarUrl).toBe('https://example.com/avatar.jpg');
    });

    it('should throw when no pages found', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [] }),
      } as Response);

      await expect(provider.getProfile(ACCESS_TOKEN)).rejects.toThrow(
        'no Facebook Pages found',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // publish
  // ─────────────────────────────────────────────────────────────────────────

  describe('publish', () => {
    it('should throw without imageUrl', async () => {
      // Mock getInstagramAccountId to succeed
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ id: 'page-id-1', access_token: 'page-token-1' }],
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            instagram_business_account: { id: 'ig-account-123' },
          }),
        } as Response);

      await expect(
        provider.publish(ACCESS_TOKEN, 'Text only post with no image'),
      ).rejects.toThrow('Instagram does not support text-only posts');
    });

    it('should publish a photo post and return externalId + url', async () => {
      jest
        .spyOn(global, 'fetch')
        // getInstagramAccountId: me/accounts
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ id: 'page-id-1', access_token: 'page-token-1' }],
          }),
        } as Response)
        // getInstagramAccountId: page IG account
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            instagram_business_account: { id: 'ig-account-123' },
          }),
        } as Response)
        // Create container
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'container-abc' }),
        } as Response)
        // Publish container
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'media-xyz' }),
        } as Response);

      const result = await provider.publish(
        ACCESS_TOKEN,
        'Hello from Outpost 🔥',
        { imageUrl: 'https://example.com/image.jpg' },
      );

      expect(result.externalId).toBe('media-xyz');
      expect(result.url).toContain('media-xyz');
    });

    it('should publish a carousel and return externalId', async () => {
      jest
        .spyOn(global, 'fetch')
        // getInstagramAccountId
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ id: 'page-id-1', access_token: 'page-token-1' }],
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            instagram_business_account: { id: 'ig-account-123' },
          }),
        } as Response)
        // carousel item 1
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'item-1' }),
        } as Response)
        // carousel item 2
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'item-2' }),
        } as Response)
        // carousel container
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'carousel-container' }),
        } as Response)
        // publish container
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'carousel-media-xyz' }),
        } as Response);

      const result = await provider.publish(
        ACCESS_TOKEN,
        'Carousel caption 🎠',
        {
          carouselImageUrls: [
            'https://example.com/img1.jpg',
            'https://example.com/img2.jpg',
          ],
        },
      );

      expect(result.externalId).toBe('carousel-media-xyz');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // deletePost
  // ─────────────────────────────────────────────────────────────────────────

  describe('deletePost', () => {
    it('should delete a post successfully', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as Response);

      await expect(
        provider.deletePost(ACCESS_TOKEN, 'media-xyz'),
      ).resolves.toBeUndefined();
    });

    it('should throw on delete failure', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ error: { message: 'Permission denied' } }),
      } as Response);

      await expect(
        provider.deletePost(ACCESS_TOKEN, 'media-xyz'),
      ).rejects.toThrow('Permission denied');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // validateToken (inherited)
  // ─────────────────────────────────────────────────────────────────────────

  describe('validateToken', () => {
    it('should return true when getProfile succeeds', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: [{ id: 'page-id-1', access_token: 'page-token-1' }],
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            instagram_business_account: { id: 'ig-123' },
          }),
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            id: 'ig-123',
            username: 'user',
            name: 'User',
          }),
        } as Response);

      const valid = await provider.validateToken(ACCESS_TOKEN);
      expect(valid).toBe(true);
    });

    it('should return false when getProfile fails', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'Unauthorized' } }),
      } as Response);

      const valid = await provider.validateToken('bad-token');
      expect(valid).toBe(false);
    });
  });
});
