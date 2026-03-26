import { RedditProvider } from '../reddit.provider';

/**
 * RedditProvider unit tests.
 * All tests mock global fetch — no real API calls are made.
 *
 * Key Reddit quirks tested:
 * - Reddit's HTTP 200 success can still contain errors in json.errors[]
 * - subreddit + title are required fields
 * - r/ prefix is stripped from subreddit name
 */
describe('RedditProvider', () => {
  let provider: RedditProvider;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    provider = new RedditProvider('test-client-id', 'test-client-secret');
    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('platform', () => {
    it('should return reddit as platform', () => {
      expect(provider.platform).toBe('reddit');
    });
  });

  describe('publish', () => {
    const validOptions = { subreddit: 'r/test', title: 'Test post title' };

    it('should publish a text post and return externalId + url', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          json: {
            errors: [],
            data: {
              id: 'abc123',
              name: 't3_abc123',
              url: 'https://www.reddit.com/r/test/comments/abc123/test_post_title/',
            },
          },
        }),
      } as Response);

      const result = await provider.publish('mock-token', 'Post body text', validOptions);

      expect(result.externalId).toBe('t3_abc123');
      expect(result.url).toContain('reddit.com/r/test');
    });

    it('should strip r/ prefix from subreddit', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          json: {
            errors: [],
            data: { id: 'xyz', name: 't3_xyz', url: 'https://reddit.com/r/reactnative/x' },
          },
        }),
      } as Response);

      await provider.publish('token', 'content', {
        subreddit: 'r/reactnative',
        title: 'title',
      });

      const body = mockFetch.mock.calls[0][1]?.body as URLSearchParams;
      expect(body.get('sr')).toBe('reactnative'); // r/ stripped
    });

    it('should work with subreddit without r/ prefix', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          json: {
            errors: [],
            data: { id: '1', name: 't3_1', url: 'https://reddit.com/r/test/1' },
          },
        }),
      } as Response);

      await provider.publish('token', 'content', {
        subreddit: 'test', // no r/ prefix
        title: 'title',
      });

      const body = mockFetch.mock.calls[0][1]?.body as URLSearchParams;
      expect(body.get('sr')).toBe('test');
    });

    it('should throw when subreddit is missing', async () => {
      await expect(
        provider.publish('token', 'content', { title: 'Title only' }),
      ).rejects.toThrow('Reddit publish requires options.subreddit');
    });

    it('should throw when title is missing', async () => {
      await expect(
        provider.publish('token', 'content', { subreddit: 'r/test' }),
      ).rejects.toThrow('Reddit publish requires options.title');
    });

    it('should throw when options are not provided', async () => {
      await expect(provider.publish('token', 'content')).rejects.toThrow(
        'Reddit publish requires options.subreddit',
      );
    });

    it('should throw on HTTP error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ message: 'Forbidden' }),
      } as Response);

      await expect(
        provider.publish('bad-token', 'content', validOptions),
      ).rejects.toThrow('Reddit API error: Forbidden');
    });

    it('should throw on Reddit application-level errors in json.errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          json: {
            errors: [['SUBREDDIT_NOTALLOWED', 'you are not allowed to post here', 'sr']],
          },
        }),
      } as Response);

      await expect(
        provider.publish('token', 'content', validOptions),
      ).rejects.toThrow('Reddit submit error: you are not allowed to post here');
    });

    it('should throw when json.data is missing in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          json: { errors: [] }, // no data field
        }),
      } as Response);

      await expect(
        provider.publish('token', 'content', validOptions),
      ).rejects.toThrow('Reddit: no post data in response');
    });

    it('should publish a link post when kind=link', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          json: {
            errors: [],
            data: { id: 'lnk1', name: 't3_lnk1', url: 'https://reddit.com/r/test/lnk1' },
          },
        }),
      } as Response);

      await provider.publish('token', 'https://example.com', {
        subreddit: 'r/test',
        title: 'Check this link',
        kind: 'link',
        url: 'https://example.com',
      });

      const body = mockFetch.mock.calls[0][1]?.body as URLSearchParams;
      expect(body.get('kind')).toBe('link');
    });

    it('should default to kind=self when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          json: {
            errors: [],
            data: { id: 's1', name: 't3_s1', url: 'https://reddit.com/r/test/s1' },
          },
        }),
      } as Response);

      await provider.publish('token', 'body text', validOptions);

      const body = mockFetch.mock.calls[0][1]?.body as URLSearchParams;
      expect(body.get('kind')).toBe('self');
    });
  });

  describe('refreshToken', () => {
    it('should return new access + refresh tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
        }),
      } as Response);

      const result = await provider.refreshToken('old-refresh-token');

      expect(result.token).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('should throw on refresh failure with error_description', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          error: 'invalid_grant',
          error_description: 'Token has been revoked',
        }),
      } as Response);

      await expect(provider.refreshToken('revoked-token')).rejects.toThrow(
        'Reddit token refresh failed: Token has been revoked',
      );
    });

    it('should throw on refresh failure with error field fallback', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'invalid_grant' }),
      } as Response);

      await expect(provider.refreshToken('bad-token')).rejects.toThrow(
        'Reddit token refresh failed: invalid_grant',
      );
    });

    it('should throw with HTTP status when body is empty', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error('empty body'); },
      } as unknown as Response);

      await expect(provider.refreshToken('token')).rejects.toThrow('HTTP 500');
    });
  });

  describe('getProfile', () => {
    it('should return structured ProviderProfile from Reddit /me', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'abc123',
          name: 'hibernyte_dev',
          icon_img: 'https://www.redditstatic.com/avatars/avatar_default.png',
        }),
      } as Response);

      const profile = await provider.getProfile('token');

      expect(profile.id).toBe('abc123');
      expect(profile.username).toBe('hibernyte_dev');
      expect(profile.displayName).toBe('hibernyte_dev');
      expect(profile.avatarUrl).toContain('redditstatic.com');
    });

    it('should throw on getProfile failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      await expect(provider.getProfile('bad-token')).rejects.toThrow(
        'Reddit getProfile failed: HTTP 401',
      );
    });
  });

  describe('deletePost', () => {
    it('should delete a post without throwing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({}),
      } as Response);

      await expect(provider.deletePost('token', 't3_abc123')).resolves.not.toThrow();
    });

    it('should pass the post id in the request body', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) } as Response);

      await provider.deletePost('token', 't3_xyz999');

      const body = mockFetch.mock.calls[0][1]?.body as URLSearchParams;
      expect(body.get('id')).toBe('t3_xyz999');
    });

    it('should throw on delete failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      } as Response);

      await expect(provider.deletePost('token', 'bad-id')).rejects.toThrow(
        'Reddit deletePost failed: HTTP 404',
      );
    });
  });
});
