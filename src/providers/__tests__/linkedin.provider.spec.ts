import { LinkedInProvider } from '../linkedin.provider';
import { SocialPlatform } from '@prisma/client';

/**
 * LinkedIn provider integration test skeletons.
 * No real API calls are made — all external fetch calls are mocked.
 */
describe('LinkedInProvider', () => {
  const CLIENT_ID = 'test-client-id';
  const CLIENT_SECRET = 'test-client-secret';
  const ACCESS_TOKEN = 'test-access-token';

  let provider: LinkedInProvider;

  // Reusable mock profile fetch responses
  const mockProfileResponse = {
    id: 'li-user-123',
    firstName: { localized: { en_US: 'Jane' } },
    lastName: { localized: { en_US: 'Doe' } },
    profilePicture: {
      'displayImage~': {
        elements: [
          { identifiers: [{ identifier: 'https://example.com/avatar.jpg' }] },
        ],
      },
    },
  };

  beforeEach(() => {
    provider = new LinkedInProvider(CLIENT_ID, CLIENT_SECRET);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Identity
  // ─────────────────────────────────────────────────────────────────────────

  it('should have platform = linkedin', () => {
    expect(provider.platform).toBe(SocialPlatform.linkedin);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // OAuth
  // ─────────────────────────────────────────────────────────────────────────

  describe('buildAuthUrl', () => {
    it('should build a valid LinkedIn OAuth URL', () => {
      const url = provider.buildAuthUrl('https://app.example.com/callback', 'state-xyz');
      expect(url).toContain('linkedin.com/oauth/v2/authorization');
      expect(url).toContain(CLIENT_ID);
      expect(url).toContain('w_member_social');
      expect(url).toContain('state-xyz');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for token', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'access-token-abc',
          refresh_token: 'refresh-token-xyz',
          expires_in: 5184000,
        }),
      } as Response);

      const result = await provider.exchangeCodeForToken('code-123', 'https://app.example.com/callback');

      expect(result.token).toBe('access-token-abc');
      expect(result.refreshToken).toBe('refresh-token-xyz');
      expect(result.expiresIn).toBe(5184000);
    });

    it('should throw on exchange failure', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Invalid authorization code' }),
      } as Response);

      await expect(
        provider.exchangeCodeForToken('bad-code', 'https://app.example.com/callback'),
      ).rejects.toThrow('LinkedIn OAuth exchange failed: Invalid authorization code');
    });
  });

  describe('refreshToken', () => {
    it('should refresh the access token', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-token-abc',
          refresh_token: 'new-refresh-xyz',
        }),
      } as Response);

      const result = await provider.refreshToken('old-refresh-token');

      expect(result.token).toBe('new-token-abc');
      expect(result.refreshToken).toBe('new-refresh-xyz');
    });

    it('should throw on failed refresh', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Token expired' }),
      } as Response);

      await expect(provider.refreshToken('expired-token')).rejects.toThrow(
        'LinkedIn token refresh failed: Token expired',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // getProfile
  // ─────────────────────────────────────────────────────────────────────────

  describe('getProfile', () => {
    it('should return a ProviderProfile with display name', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfileResponse,
      } as Response);

      const profile = await provider.getProfile(ACCESS_TOKEN);

      expect(profile.id).toBe('li-user-123');
      expect(profile.username).toBe('li-user-123'); // LinkedIn uses ID as username
      expect(profile.displayName).toBe('Jane Doe');
      expect(profile.avatarUrl).toBe('https://example.com/avatar.jpg');
    });

    it('should throw on API failure', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Unauthorized' }),
      } as Response);

      await expect(provider.getProfile(ACCESS_TOKEN)).rejects.toThrow(
        'LinkedIn getProfile failed: Unauthorized',
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // publish — text post
  // ─────────────────────────────────────────────────────────────────────────

  describe('publish (text)', () => {
    it('should publish a text post and return externalId', async () => {
      const postUrn = 'urn:li:ugcPost:987654321';

      jest
        .spyOn(global, 'fetch')
        // getProfile call
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProfileResponse,
        } as Response)
        // UGC post call
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'x-restli-id': postUrn }),
          json: async () => ({}),
        } as unknown as Response);

      const result = await provider.publish(ACCESS_TOKEN, 'Hello LinkedIn! 🚀');

      expect(result.externalId).toBe(postUrn);
      expect(result.url).toContain(encodeURIComponent(postUrn));
    });

    it('should throw when UGC post returns no URN in headers', async () => {
      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProfileResponse,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({}), // no x-restli-id
          json: async () => ({}),
        } as unknown as Response);

      await expect(
        provider.publish(ACCESS_TOKEN, 'Post without header'),
      ).rejects.toThrow('missing post URN in response headers');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // publish — article
  // ─────────────────────────────────────────────────────────────────────────

  describe('publish (article)', () => {
    it('should publish an article post', async () => {
      const postUrn = 'urn:li:ugcPost:111222333';

      jest
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProfileResponse,
        } as Response)
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'x-restli-id': postUrn }),
          json: async () => ({}),
        } as unknown as Response);

      const result = await provider.publish(
        ACCESS_TOKEN,
        'Check out this article!',
        {
          postType: 'article',
          url: 'https://example.com/blog/post',
          title: 'My Amazing Blog Post',
        },
      );

      expect(result.externalId).toBe(postUrn);
    });

    it('should throw when article post has no url', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfileResponse,
      } as Response);

      await expect(
        provider.publish(ACCESS_TOKEN, 'Article without URL', {
          postType: 'article',
        }),
      ).rejects.toThrow('LinkedIn article post requires options.url');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // publish — image
  // ─────────────────────────────────────────────────────────────────────────

  describe('publish (image)', () => {
    it('should throw when image post has no imageUrl', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfileResponse,
      } as Response);

      await expect(
        provider.publish(ACCESS_TOKEN, 'Image post without URL', {
          postType: 'image',
        }),
      ).rejects.toThrow('LinkedIn image post requires options.imageUrl');
    });

    it('should register upload and publish image post', async () => {
      const postUrn = 'urn:li:ugcPost:444555666';

      jest
        .spyOn(global, 'fetch')
        // getProfile
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockProfileResponse,
        } as Response)
        // registerImageUpload
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            value: {
              asset: 'urn:li:digitalmediaAsset:C4E22AQHfoijk',
              uploadMechanism: {
                'com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest': {
                  uploadUrl: 'https://api.linkedin.com/mediaUpload/...',
                },
              },
            },
          }),
        } as Response)
        // submitUgcPost
        .mockResolvedValueOnce({
          ok: true,
          headers: new Headers({ 'x-restli-id': postUrn }),
          json: async () => ({}),
        } as unknown as Response);

      const result = await provider.publish(
        ACCESS_TOKEN,
        'Image caption here',
        {
          postType: 'image',
          imageUrl: 'https://example.com/image.jpg',
        },
      );

      expect(result.externalId).toBe(postUrn);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // deletePost
  // ─────────────────────────────────────────────────────────────────────────

  describe('deletePost', () => {
    it('should delete a post successfully', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await expect(
        provider.deletePost(ACCESS_TOKEN, 'urn:li:ugcPost:12345'),
      ).resolves.toBeUndefined();
    });

    it('should throw on delete failure', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ message: 'Forbidden' }),
      } as Response);

      await expect(
        provider.deletePost(ACCESS_TOKEN, 'urn:li:ugcPost:12345'),
      ).rejects.toThrow('Forbidden');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // validateToken (inherited)
  // ─────────────────────────────────────────────────────────────────────────

  describe('validateToken', () => {
    it('should return true when getProfile succeeds', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => mockProfileResponse,
      } as Response);

      const valid = await provider.validateToken(ACCESS_TOKEN);
      expect(valid).toBe(true);
    });

    it('should return false when getProfile fails', async () => {
      jest.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Unauthorized' }),
      } as Response);

      const valid = await provider.validateToken('bad-token');
      expect(valid).toBe(false);
    });
  });
});
