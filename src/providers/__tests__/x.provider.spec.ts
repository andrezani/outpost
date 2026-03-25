import { XProvider } from '../x.provider';

/**
 * XProvider unit tests.
 * All tests mock global fetch — no real API calls are made.
 */
describe('XProvider', () => {
  let provider: XProvider;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    provider = new XProvider('test-client-id', 'test-client-secret');
    mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
    global.fetch = mockFetch;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('platform', () => {
    it('should return x as platform', () => {
      expect(provider.platform).toBe('x');
    });
  });

  describe('publish', () => {
    it('should publish a tweet and return externalId + url', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { id: '1234567890', text: 'Hello world' },
        }),
      } as Response);

      const result = await provider.publish('mock-bearer-token', 'Hello world');

      expect(result.externalId).toBe('1234567890');
      expect(result.url).toBe('https://x.com/i/web/status/1234567890');
    });

    it('should include reply payload when replyToTweetId is set', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { id: '9999', text: 'Reply tweet' },
        }),
      } as Response);

      await provider.publish('token', 'Reply text', { replyToTweetId: '1111' });

      const body = JSON.parse((mockFetch.mock.calls[0][1]?.body as string) ?? '{}') as {
        text: string;
        reply?: { in_reply_to_tweet_id: string };
      };
      expect(body.reply?.in_reply_to_tweet_id).toBe('1111');
    });

    it('should throw on API error with detail field', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'Forbidden — read-only app' }),
      } as Response);

      await expect(provider.publish('bad-token', 'test')).rejects.toThrow(
        'X API error: Forbidden — read-only app',
      );
    });

    it('should throw on API error with errors array', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ errors: [{ message: 'Invalid token', code: 89 }] }),
      } as Response);

      await expect(provider.publish('bad-token', 'test')).rejects.toThrow(
        'X API error: Invalid token',
      );
    });

    it('should throw with HTTP status when response body is not parseable', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => { throw new Error('not json'); },
      } as unknown as Response);

      await expect(provider.publish('token', 'test')).rejects.toThrow('HTTP 500');
    });

    it('should throw on rate limit (429) with appropriate message', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ title: 'Too Many Requests' }),
      } as Response);

      await expect(provider.publish('token', 'test')).rejects.toThrow(
        'X API error: Too Many Requests',
      );
    });
  });

  describe('buildAuthUrl', () => {
    it('should build a valid X OAuth 2.0 PKCE authorization URL', () => {
      const url = provider.buildAuthUrl(
        'https://myapp.com/callback',
        'csrf-state-123',
        'my-code-verifier',
      );

      expect(url).toContain('twitter.com/i/oauth2/authorize');
      expect(url).toContain('response_type=code');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('state=csrf-state-123');
      expect(url).toContain('code_challenge_method=S256');
      expect(url).toContain('scope=');
      expect(url).toContain('tweet.write');
      expect(url).toContain('offline.access');
    });

    it('should include redirect_uri in auth URL', () => {
      const url = provider.buildAuthUrl('https://example.com/cb', 'state-abc');
      expect(url).toContain(encodeURIComponent('https://example.com/cb'));
    });

    it('should not include code_challenge when no verifier is given', () => {
      const url = provider.buildAuthUrl('https://example.com/cb', 'state-abc');
      expect(url).not.toContain('code_challenge=');
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should exchange code for access + refresh token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
        }),
      } as Response);

      const result = await provider.exchangeCodeForToken(
        'auth-code',
        'https://myapp.com/callback',
        'verifier',
      );

      expect(result.token).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
    });

    it('should throw on token exchange failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ detail: 'Invalid code' }),
      } as Response);

      await expect(
        provider.exchangeCodeForToken('bad-code', 'https://cb.com', 'verifier'),
      ).rejects.toThrow('X token exchange failed: Invalid code');
    });
  });

  describe('refreshToken', () => {
    it('should refresh and return new tokens', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'refreshed-access',
          refresh_token: 'refreshed-refresh',
        }),
      } as Response);

      const result = await provider.refreshToken('old-refresh-token');

      expect(result.token).toBe('refreshed-access');
      expect(result.refreshToken).toBe('refreshed-refresh');
    });

    it('should throw on refresh failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Token expired' }),
      } as Response);

      await expect(provider.refreshToken('expired-token')).rejects.toThrow(
        'X token refresh failed: Token expired',
      );
    });
  });

  describe('getProfile', () => {
    it('should return structured ProviderProfile', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            id: 'uid-001',
            username: 'hibernyte',
            name: 'Hibernyte',
            profile_image_url: 'https://pbs.twimg.com/profile_images/123/photo.jpg',
          },
        }),
      } as Response);

      const profile = await provider.getProfile('token');

      expect(profile.id).toBe('uid-001');
      expect(profile.username).toBe('hibernyte');
      expect(profile.displayName).toBe('Hibernyte');
      expect(profile.avatarUrl).toContain('pbs.twimg.com');
    });

    it('should throw on getProfile failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ detail: 'Unauthorized' }),
      } as Response);

      await expect(provider.getProfile('bad-token')).rejects.toThrow(
        'X getProfile failed: Unauthorized',
      );
    });
  });

  describe('deletePost', () => {
    it('should successfully delete a tweet', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { deleted: true } }),
      } as Response);

      await expect(provider.deletePost('token', '1234567890')).resolves.not.toThrow();
    });

    it('should throw on delete failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ detail: 'Tweet not found' }),
      } as Response);

      await expect(provider.deletePost('token', 'bad-id')).rejects.toThrow(
        'X deletePost failed: Tweet not found',
      );
    });
  });
});
