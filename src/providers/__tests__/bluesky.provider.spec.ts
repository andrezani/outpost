import { BlueskyProvider } from '../bluesky.provider';

/**
 * Bluesky Provider unit tests.
 * These tests validate provider contract compliance without making real API calls.
 * Real integration requires a Bluesky app password + valid handle.
 */
describe('BlueskyProvider', () => {
  let provider: BlueskyProvider;

  const mockSession = JSON.stringify({
    accessJwt: 'mock-access-jwt',
    refreshJwt: 'mock-refresh-jwt',
    handle: 'testuser.bsky.social',
    did: 'did:plc:abc123',
  });

  beforeEach(() => {
    provider = new BlueskyProvider();
  });

  describe('platform', () => {
    it('should return bluesky as platform', () => {
      expect(provider.platform).toBe('bluesky');
    });
  });

  describe('parseSession (via publish)', () => {
    it('should throw on invalid token JSON', async () => {
      await expect(
        provider.publish('not-json', 'hello world'),
      ).rejects.toThrow('Bluesky token must be a JSON-serialized BlueskySession');
    });

    it('should accept valid session JSON token', async () => {
      // Real API call guarded — just verify it parses without the format error
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uri: 'at://did:plc:abc123/app.bsky.feed.post/3kjhgf',
          cid: 'bafy123',
        }),
      } as unknown as Response);

      const result = await provider.publish(mockSession, 'Hello Bluesky!');
      expect(result.externalId).toContain('at://');
      expect(result.url).toContain('bsky.app/profile/testuser.bsky.social');
    });
  });

  describe('publish', () => {
    it('should include langs in record when provided', async () => {
      let capturedBody: Record<string, unknown> = {};

      global.fetch = jest.fn().mockImplementationOnce(
        (_url: string, init?: RequestInit) => {
          capturedBody = JSON.parse(init?.body as string) as Record<
            string,
            unknown
          >;
          return Promise.resolve({
            ok: true,
            json: async () => ({
              uri: 'at://did:plc:abc123/app.bsky.feed.post/rkey1',
              cid: 'bafy456',
            }),
          } as unknown as Response);
        },
      );

      await provider.publish(mockSession, 'Multilingual post', { langs: ['en', 'fr'] });
      const record = capturedBody.record as Record<string, unknown>;
      expect(record.langs).toEqual(['en', 'fr']);
    });

    it('should include reply ref when replyTo provided', async () => {
      let capturedBody: Record<string, unknown> = {};

      global.fetch = jest.fn().mockImplementationOnce(
        (_url: string, init?: RequestInit) => {
          capturedBody = JSON.parse(init?.body as string) as Record<
            string,
            unknown
          >;
          return Promise.resolve({
            ok: true,
            json: async () => ({
              uri: 'at://did:plc:abc123/app.bsky.feed.post/rkey2',
              cid: 'bafy789',
            }),
          } as unknown as Response);
        },
      );

      await provider.publish(mockSession, 'Reply post', {
        replyTo: { uri: 'at://did:plc:parent/app.bsky.feed.post/rkey0', cid: 'bafyParent' },
      });
      const record = capturedBody.record as Record<string, unknown>;
      expect(record.reply).toBeDefined();
    });

    it('should throw on API error response', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'InvalidToken', message: 'Token has expired' }),
      } as unknown as Response);

      await expect(provider.publish(mockSession, 'test')).rejects.toThrow(
        'Bluesky error: Token has expired',
      );
    });

    it('should derive rkey from AT-URI for post URL', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uri: 'at://did:plc:abc123/app.bsky.feed.post/myrkey',
          cid: 'bafy000',
        }),
      } as unknown as Response);

      const result = await provider.publish(mockSession, 'Test');
      expect(result.url).toBe(
        'https://bsky.app/profile/testuser.bsky.social/post/myrkey',
      );
    });
  });

  describe('deletePost', () => {
    it('should call deleteRecord with correct rkey', async () => {
      let capturedBody: Record<string, unknown> = {};

      global.fetch = jest.fn().mockImplementationOnce(
        (_url: string, init?: RequestInit) => {
          capturedBody = JSON.parse(init?.body as string) as Record<
            string,
            unknown
          >;
          return Promise.resolve({
            ok: true,
            json: async () => ({}),
          } as unknown as Response);
        },
      );

      await provider.deletePost(
        mockSession,
        'at://did:plc:abc123/app.bsky.feed.post/myrkey',
      );
      expect(capturedBody.rkey).toBe('myrkey');
      expect(capturedBody.collection).toBe('app.bsky.feed.post');
    });
  });

  describe('buildAuthUrl', () => {
    it('should throw (AT Protocol OAuth 2.0 DPoP not implemented)', () => {
      expect(() => provider.buildAuthUrl('https://app.com/cb', 'state123')).toThrow(
        'Bluesky OAuth 2.0 DPoP not yet implemented',
      );
    });
  });

  describe('exchangeCodeForToken', () => {
    it('should throw (AT Protocol OAuth 2.0 DPoP not implemented)', async () => {
      await expect(
        provider.exchangeCodeForToken('code', 'https://app.com/cb'),
      ).rejects.toThrow('Bluesky OAuth 2.0 DPoP not yet implemented');
    });
  });

  describe('validateToken', () => {
    it('should return true when getProfile succeeds', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          did: 'did:plc:abc123',
          handle: 'testuser.bsky.social',
          displayName: 'Test User',
        }),
      } as unknown as Response);

      const result = await provider.validateToken(mockSession);
      expect(result).toBe(true);
    });

    it('should return false when getProfile throws', async () => {
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: 'AuthRequired', message: 'Session expired' }),
      } as unknown as Response);

      const result = await provider.validateToken(mockSession);
      expect(result).toBe(false);
    });
  });
});
