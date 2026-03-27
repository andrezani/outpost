import { HttpException, HttpStatus } from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';
import { McpService } from '../mcp.service';
import type { AccountsService } from '../../accounts/accounts.service';
import type { PublishService } from '../../publish/publish.service';
import type { PostsService } from '../../posts/posts.service';

const ORG_ID = 'org_test_123';

function makeService(overrides: {
  accounts?: Partial<AccountsService>;
  publish?: Partial<PublishService>;
  posts?: Partial<PostsService>;
} = {}): McpService {
  const accounts = {
    listAccounts: jest.fn().mockResolvedValue([]),
    getRateLimits: jest.fn(),
    ...overrides.accounts,
  } as unknown as jest.Mocked<AccountsService>;

  const publish = {
    publish: jest.fn(),
    ...overrides.publish,
  } as unknown as jest.Mocked<PublishService>;

  const posts = {
    getStatus: jest.fn(),
    ...overrides.posts,
  } as unknown as jest.Mocked<PostsService>;

  return new McpService(accounts, publish, posts);
}

describe('McpService', () => {
  afterEach(() => jest.resetAllMocks());

  // ─── Protocol methods ───────────────────────────────────────────────────────

  describe('initialize', () => {
    it('returns protocolVersion and serverInfo', async () => {
      const svc = makeService();
      const res = await svc.handleMessage(
        { jsonrpc: '2.0', id: 1, method: 'initialize' },
        ORG_ID,
      );
      expect(res.result).toMatchObject({
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'outpost' },
        capabilities: { tools: {} },
      });
    });
  });

  describe('tools/list', () => {
    it('returns all 6 tools', async () => {
      const svc = makeService();
      const res = await svc.handleMessage(
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        ORG_ID,
      );
      const { tools } = res.result as { tools: unknown[] };
      expect(tools).toHaveLength(6);
    });

    it('each tool has name, description, and inputSchema', async () => {
      const svc = makeService();
      const res = await svc.handleMessage(
        { jsonrpc: '2.0', id: 2, method: 'tools/list' },
        ORG_ID,
      );
      const { tools } = res.result as { tools: Array<{ name: string; description: string; inputSchema: unknown }> };
      for (const tool of tools) {
        expect(tool.name).toBeTruthy();
        expect(tool.description).toBeTruthy();
        expect(tool.inputSchema).toBeTruthy();
      }
    });
  });

  describe('unknown method', () => {
    it('returns -32601 error', async () => {
      const svc = makeService();
      const res = await svc.handleMessage(
        { jsonrpc: '2.0', id: 9, method: 'foo/bar' },
        ORG_ID,
      );
      expect(res.error?.code).toBe(-32601);
    });
  });

  describe('ping / notifications/initialized', () => {
    it.each(['ping', 'notifications/initialized'])('%s returns empty result', async (method) => {
      const svc = makeService();
      const res = await svc.handleMessage({ jsonrpc: '2.0', id: 3, method }, ORG_ID);
      expect(res.result).toEqual({});
    });
  });

  // ─── tools/call ─────────────────────────────────────────────────────────────

  describe('list_accounts', () => {
    it('returns all accounts when no platform filter', async () => {
      const mockAccounts = [
        { id: 'acc_1', platform: SocialPlatform.x, handle: '@user', status: 'active' },
        { id: 'acc_2', platform: SocialPlatform.linkedin, handle: 'user', status: 'active' },
      ];
      const svc = makeService({ accounts: { listAccounts: jest.fn().mockResolvedValue(mockAccounts) } });

      const res = await svc.handleMessage(
        { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'list_accounts', arguments: {} } },
        ORG_ID,
      );

      const content = (res.result as { content: Array<{ text: string }> }).content[0].text;
      const parsed = JSON.parse(content) as unknown[];
      expect(parsed).toHaveLength(2);
    });

    it('filters by platform', async () => {
      const mockAccounts = [
        { id: 'acc_1', platform: SocialPlatform.x, handle: '@user', status: 'active' },
        { id: 'acc_2', platform: SocialPlatform.linkedin, handle: 'user', status: 'active' },
      ];
      const svc = makeService({ accounts: { listAccounts: jest.fn().mockResolvedValue(mockAccounts) } });

      const res = await svc.handleMessage(
        {
          jsonrpc: '2.0',
          id: 4,
          method: 'tools/call',
          params: { name: 'list_accounts', arguments: { platform: 'x' } },
        },
        ORG_ID,
      );

      const content = (res.result as { content: Array<{ text: string }> }).content[0].text;
      const parsed = JSON.parse(content) as Array<{ platform: string }>;
      expect(parsed).toHaveLength(1);
      expect(parsed[0].platform).toBe(SocialPlatform.x);
    });
  });

  describe('publish_post', () => {
    it('delegates to PublishService and returns result', async () => {
      const publishResult = {
        success: true,
        postId: '12345',
        platform: SocialPlatform.x,
        url: 'https://x.com/user/status/12345',
        publishedAt: '2026-03-27T00:00:00Z',
      };
      const mockPublish = jest.fn().mockResolvedValue(publishResult);
      const svc = makeService({ publish: { publish: mockPublish } });

      const res = await svc.handleMessage(
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: {
            name: 'publish_post',
            arguments: { platform: 'x', accountId: 'acc_1', text: 'Hello from MCP!' },
          },
        },
        ORG_ID,
      );

      expect(mockPublish).toHaveBeenCalledWith(ORG_ID, expect.objectContaining({
        platform: SocialPlatform.x,
        accountId: 'acc_1',
        content: expect.objectContaining({ text: 'Hello from MCP!' }),
      }));
      const content = (res.result as { content: Array<{ text: string }> }).content[0].text;
      expect(JSON.parse(content)).toMatchObject({ success: true, postId: '12345' });
    });

    it('returns structured error (not JSON-RPC error) on HttpException', async () => {
      const errorBody = { success: false, error: { code: 'RATE_LIMITED', agentHint: 'Retry later' } };
      const mockPublish = jest.fn().mockRejectedValue(
        new HttpException(errorBody, HttpStatus.TOO_MANY_REQUESTS),
      );
      const svc = makeService({ publish: { publish: mockPublish } });

      const res = await svc.handleMessage(
        {
          jsonrpc: '2.0',
          id: 5,
          method: 'tools/call',
          params: { name: 'publish_post', arguments: { platform: 'x', accountId: 'acc_1', text: 'Hi' } },
        },
        ORG_ID,
      );

      // Must NOT be a JSON-RPC error — it should be a tool result so agents can parse it
      expect(res.error).toBeUndefined();
      const content = (res.result as { content: Array<{ text: string }> }).content[0].text;
      const parsed = JSON.parse(content) as typeof errorBody;
      expect(parsed).toMatchObject({ success: false, error: { code: 'RATE_LIMITED' } });
    });

    it('passes subreddit and title as metadata for Reddit', async () => {
      const mockPublish = jest.fn().mockResolvedValue({ success: true, postId: 'abc' });
      const svc = makeService({ publish: { publish: mockPublish } });

      await svc.handleMessage(
        {
          jsonrpc: '2.0',
          id: 6,
          method: 'tools/call',
          params: {
            name: 'publish_post',
            arguments: {
              platform: 'reddit',
              accountId: 'acc_r',
              text: 'Test',
              subreddit: 'programming',
              title: 'My post',
            },
          },
        },
        ORG_ID,
      );

      expect(mockPublish).toHaveBeenCalledWith(ORG_ID, expect.objectContaining({
        content: expect.objectContaining({
          metadata: { subreddit: 'programming', title: 'My post' },
        }),
      }));
    });
  });

  describe('check_platform_capabilities', () => {
    it('returns capabilities for a valid platform', async () => {
      const svc = makeService();
      const res = await svc.handleMessage(
        {
          jsonrpc: '2.0',
          id: 7,
          method: 'tools/call',
          params: { name: 'check_platform_capabilities', arguments: { platform: 'x' } },
        },
        ORG_ID,
      );
      const content = (res.result as { content: Array<{ text: string }> }).content[0].text;
      const parsed = JSON.parse(content) as { id: string; text: { maxLength: number } };
      expect(parsed.id).toBe(SocialPlatform.x);
      expect(parsed.text.maxLength).toBe(280);
    });
  });

  describe('list_all_platform_capabilities', () => {
    it('returns multiple platforms (excludes TikTok)', async () => {
      const svc = makeService();
      const res = await svc.handleMessage(
        {
          jsonrpc: '2.0',
          id: 8,
          method: 'tools/call',
          params: { name: 'list_all_platform_capabilities', arguments: {} },
        },
        ORG_ID,
      );
      const content = (res.result as { content: Array<{ text: string }> }).content[0].text;
      const parsed = JSON.parse(content) as Array<{ id: string }>;
      expect(parsed.length).toBeGreaterThan(1);
      expect(parsed.find((p) => p.id === 'tiktok')).toBeUndefined();
    });
  });

  describe('check_rate_limits', () => {
    it('delegates to AccountsService.getRateLimits', async () => {
      const rateLimitResult = { accountId: 'acc_1', platform: 'x', rateLimit: { used: 5, limit: 50 } };
      const mockGetRateLimits = jest.fn().mockResolvedValue(rateLimitResult);
      const svc = makeService({ accounts: { getRateLimits: mockGetRateLimits } });

      await svc.handleMessage(
        {
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: { name: 'check_rate_limits', arguments: { accountId: 'acc_1' } },
        },
        ORG_ID,
      );

      expect(mockGetRateLimits).toHaveBeenCalledWith('acc_1', ORG_ID);
    });
  });

  describe('get_post_status', () => {
    it('delegates to PostsService.getStatus', async () => {
      const statusResult = { id: 'post_1', status: 'PUBLISHED', publishedAt: new Date(), platforms: [] };
      const mockGetStatus = jest.fn().mockResolvedValue(statusResult);
      const svc = makeService({ posts: { getStatus: mockGetStatus } });

      await svc.handleMessage(
        {
          jsonrpc: '2.0',
          id: 11,
          method: 'tools/call',
          params: { name: 'get_post_status', arguments: { postId: 'post_1' } },
        },
        ORG_ID,
      );

      expect(mockGetStatus).toHaveBeenCalledWith('post_1');
    });
  });

  describe('unknown tool', () => {
    it('returns -32603 error', async () => {
      const svc = makeService();
      const res = await svc.handleMessage(
        {
          jsonrpc: '2.0',
          id: 99,
          method: 'tools/call',
          params: { name: 'does_not_exist', arguments: {} },
        },
        ORG_ID,
      );
      expect(res.error?.code).toBe(-32603);
    });
  });
});
