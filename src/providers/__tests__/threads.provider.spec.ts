import { ThreadsProvider } from '../threads.provider';

/**
 * Threads Provider unit tests.
 * Tests validate provider contract compliance without real API calls.
 * Real integration requires Meta developer app credentials + threads_content_publish scope.
 */
describe('ThreadsProvider', () => {
  let provider: ThreadsProvider;
  const CLIENT_ID = 'test-client-id';
  const CLIENT_SECRET = 'test-client-secret';
  const TOKEN = 'mock-access-token';

  beforeEach(() => {
    provider = new ThreadsProvider(CLIENT_ID, CLIENT_SECRET);
  });

  describe('platform', () => {
    it('should return threads as platform', () => {
      expect(provider.platform).toBe('threads');
    });
  });

  describe('publish — text post', () => {
    it('should create text container then publish', async () => {
      const calls: string[] = [];

      global.fetch = jest.fn().mockImplementation((url: string) => {
        calls.push(url as string);
        if ((url as string).includes('/me/threads') && calls.length === 1) {
          // createTextContainer
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: 'container-id-1' }),
          } as unknown as Response);
        }
        if ((url as string).includes('/me/threads_publish')) {
          // publish
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: 'post-id-1' }),
          } as unknown as Response);
        }
        // permalink fetch
        return Promise.resolve({
          ok: true,
          json: async () => ({
            permalink: 'https://www.threads.net/@user/post/abc123',
          }),
        } as unknown as Response);
      });

      const result = await provider.publish(TOKEN, 'Hello Threads!');
      expect(result.externalId).toBe('post-id-1');
      expect(result.url).toBe('https://www.threads.net/@user/post/abc123');
    });

    it('should throw on container creation failure', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: 'Invalid access token' },
        }),
      } as unknown as Response);

      await expect(
        provider.publish(TOKEN, 'Test post'),
      ).rejects.toThrow('Threads API error (createTextContainer): Invalid access token');
    });

    it('should throw on publish failure', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          // container OK
          ok: true,
          json: async () => ({ id: 'container-id-x' }),
        } as unknown as Response)
        .mockResolvedValueOnce({
          // publish fails
          ok: false,
          json: async () => ({
            error: { message: 'Rate limit exceeded' },
          }),
        } as unknown as Response);

      await expect(
        provider.publish(TOKEN, 'Test post'),
      ).rejects.toThrow('Threads API error: Rate limit exceeded');
    });
  });

  describe('publish — image post', () => {
    it('should create IMAGE container when imageUrl provided', async () => {
      let containerBody: Record<string, unknown> = {};

      global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
        if ((url as string).includes('/me/threads') && !containerBody.media_type) {
          containerBody = JSON.parse(init?.body as string) as Record<string, unknown>;
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: 'img-container-1' }),
          } as unknown as Response);
        }
        if ((url as string).includes('/me/threads_publish')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: 'img-post-1' }),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: false,
          json: async () => ({}),
        } as unknown as Response);
      });

      await provider.publish(TOKEN, 'Caption here', {
        imageUrl: 'https://example.com/image.jpg',
      });

      expect(containerBody.media_type).toBe('IMAGE');
      expect(containerBody.image_url).toBe('https://example.com/image.jpg');
      expect(containerBody.text).toBe('Caption here');
    });
  });

  describe('publish — carousel post', () => {
    it('should create child containers then carousel parent container', async () => {
      const calls: Array<Record<string, unknown>> = [];

      global.fetch = jest.fn().mockImplementation((_url: string, init?: RequestInit) => {
        if (init?.body) {
          calls.push(JSON.parse(init.body as string) as Record<string, unknown>);
        }
        if ((_url as string).includes('/me/threads_publish')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ id: 'carousel-post-1' }),
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({ id: `container-${calls.length}` }),
        } as unknown as Response);
      });

      const result = await provider.publish(TOKEN, 'Carousel caption', {
        carouselImageUrls: [
          'https://example.com/img1.jpg',
          'https://example.com/img2.jpg',
        ],
      });

      // 2 child containers + 1 carousel parent + 1 publish = 4 calls
      expect(calls.length).toBe(4);
      expect(calls[0].is_carousel_item).toBe(true);
      expect(calls[2].media_type).toBe('CAROUSEL');
      expect(result.externalId).toBe('carousel-post-1');
    });
  });

  describe('deletePost', () => {
    it('should call DELETE on the post endpoint', async () => {
      let capturedMethod = '';
      let capturedUrl = '';

      global.fetch = jest.fn().mockImplementationOnce(
        (url: string, init?: RequestInit) => {
          capturedUrl = url as string;
          capturedMethod = init?.method ?? '';
          return Promise.resolve({
            ok: true,
            json: async () => ({}),
          } as unknown as Response);
        },
      );

      await provider.deletePost(TOKEN, 'post-id-123');
      expect(capturedMethod).toBe('DELETE');
      expect(capturedUrl).toContain('post-id-123');
    });

    it('should throw on delete failure', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: { message: 'Post not found' },
        }),
      } as unknown as Response);

      await expect(provider.deletePost(TOKEN, 'bad-id')).rejects.toThrow(
        'Threads deletePost failed: Post not found',
      );
    });
  });

  describe('buildAuthUrl', () => {
    it('should include threads_basic and threads_content_publish scopes', () => {
      const url = provider.buildAuthUrl(
        'https://myapp.com/callback',
        'csrf-state-123',
      );
      expect(url).toContain('threads_basic');
      expect(url).toContain('threads_content_publish');
      expect(url).toContain('csrf-state-123');
      expect(url).toContain(CLIENT_ID);
    });

    it('should point to threads.net OAuth endpoint', () => {
      const url = provider.buildAuthUrl('https://myapp.com/callback', 'state');
      expect(url).toContain('threads.net/oauth/authorize');
    });
  });

  describe('getProfile', () => {
    it('should return profile from /me endpoint', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'threads-user-id',
          username: 'testuser',
          name: 'Test User',
          threads_profile_picture_url: 'https://example.com/avatar.jpg',
        }),
      } as unknown as Response);

      const profile = await provider.getProfile(TOKEN);
      expect(profile.id).toBe('threads-user-id');
      expect(profile.username).toBe('testuser');
      expect(profile.displayName).toBe('Test User');
      expect(profile.avatarUrl).toBe('https://example.com/avatar.jpg');
    });

    it('should fallback username to id when username not provided', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'threads-id-only',
        }),
      } as unknown as Response);

      const profile = await provider.getProfile(TOKEN);
      expect(profile.username).toBe('threads-id-only');
    });
  });

  describe('validateToken', () => {
    it('should return true when getProfile succeeds', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'uid', username: 'user' }),
      } as unknown as Response);

      const result = await provider.validateToken(TOKEN);
      expect(result).toBe(true);
    });

    it('should return false when getProfile fails', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: 'Unauthorized' } }),
      } as unknown as Response);

      const result = await provider.validateToken(TOKEN);
      expect(result).toBe(false);
    });
  });
});
