/**
 * McpService + McpController tests
 *
 * Covers:
 *   - initialize → protocol version + server info
 *   - tools/list → returns all 6 tools
 *   - tools/call → publish_post, list_accounts, check_platform_capabilities,
 *     list_all_platform_capabilities, check_rate_limits, get_post_status
 *   - notifications/initialized + ping → empty result
 *   - unknown method → -32601 error
 *   - tool error → -32603 error
 *   - HttpException in publish → returns error response (not thrown)
 *   - batch request handling (controller)
 *   - unknown tool name → error
 */
import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { McpController } from '../../src/modules/mcp/mcp.controller';
import { McpService, McpMessage, McpResponse } from '../../src/modules/mcp/mcp.service';
import { AccountsService } from '../../src/modules/accounts/accounts.service';
import { PublishService } from '../../src/modules/publish/publish.service';
import { PostsService } from '../../src/modules/posts/posts.service';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockAccountsService = {
  listAccounts: jest.fn(),
  getRateLimits: jest.fn(),
};

const mockPublishService = {
  publish: jest.fn(),
};

const mockPostsService = {
  getStatus: jest.fn(),
};

function makeReq(orgId = 'org-123') {
  return { organization: { id: orgId } } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('McpService', () => {
  let service: McpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        McpService,
        { provide: AccountsService, useValue: mockAccountsService },
        { provide: PublishService, useValue: mockPublishService },
        { provide: PostsService, useValue: mockPostsService },
      ],
    }).compile();

    service = module.get<McpService>(McpService);
    jest.clearAllMocks();
  });

  // ── initialize ──────────────────────────────────────────────────────────

  it('responds to initialize with protocol version and server info', async () => {
    const res = await service.handleMessage({ jsonrpc: '2.0', id: 1, method: 'initialize' }, 'org-123');
    expect(res).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'outpost', version: '1.0.0' },
      },
    });
  });

  // ── tools/list ──────────────────────────────────────────────────────────

  it('returns all 6 tools on tools/list', async () => {
    const res = await service.handleMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, 'org-123');
    const tools = (res.result as any).tools;
    expect(tools).toHaveLength(6);
    expect(tools.map((t: any) => t.name).sort()).toEqual([
      'check_platform_capabilities',
      'check_rate_limits',
      'get_post_status',
      'list_accounts',
      'list_all_platform_capabilities',
      'publish_post',
    ]);
  });

  // ── notifications/initialized + ping ────────────────────────────────────

  it('returns empty result for notifications/initialized', async () => {
    const res = await service.handleMessage(
      { jsonrpc: '2.0', id: null, method: 'notifications/initialized' },
      'org-123',
    );
    expect(res).toEqual({ jsonrpc: '2.0', id: null, result: {} });
  });

  it('returns empty result for ping', async () => {
    const res = await service.handleMessage({ jsonrpc: '2.0', id: 3, method: 'ping' }, 'org-123');
    expect(res).toEqual({ jsonrpc: '2.0', id: 3, result: {} });
  });

  // ── unknown method ──────────────────────────────────────────────────────

  it('returns -32601 for unknown method', async () => {
    const res = await service.handleMessage({ jsonrpc: '2.0', id: 4, method: 'bogus' }, 'org-123');
    expect(res).toEqual({
      jsonrpc: '2.0',
      id: 4,
      error: { code: -32601, message: 'Method not found: bogus' },
    });
  });

  // ── tools/call: list_accounts ───────────────────────────────────────────

  it('calls accounts.listAccounts for list_accounts tool', async () => {
    const accounts = [
      { id: 'acc-1', platform: 'x', handle: '@test', status: 'active' },
      { id: 'acc-2', platform: 'linkedin', handle: 'Test User', status: 'active' },
    ];
    mockAccountsService.listAccounts.mockResolvedValue(accounts);

    const res = await service.handleMessage(
      {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: { name: 'list_accounts', arguments: {} },
      },
      'org-123',
    );

    expect(mockAccountsService.listAccounts).toHaveBeenCalledWith('org-123');
    const content = JSON.parse((res.result as any).content[0].text);
    expect(content).toEqual(accounts);
  });

  it('filters list_accounts by platform when specified', async () => {
    const accounts = [
      { id: 'acc-1', platform: 'x', handle: '@test', status: 'active' },
      { id: 'acc-2', platform: 'linkedin', handle: 'Test User', status: 'active' },
    ];
    mockAccountsService.listAccounts.mockResolvedValue(accounts);

    const res = await service.handleMessage(
      {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: { name: 'list_accounts', arguments: { platform: 'x' } },
      },
      'org-123',
    );

    const content = JSON.parse((res.result as any).content[0].text);
    expect(content).toHaveLength(1);
    expect(content[0].platform).toBe('x');
  });

  // ── tools/call: publish_post ────────────────────────────────────────────

  it('calls publish.publish with correct args', async () => {
    const publishResult = { postId: 'post-1', url: 'https://x.com/123', publishedAt: new Date().toISOString() };
    mockPublishService.publish.mockResolvedValue(publishResult);

    const res = await service.handleMessage(
      {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'publish_post',
          arguments: { platform: 'x', accountId: 'acc-1', text: 'Hello world' },
        },
      },
      'org-123',
    );

    expect(mockPublishService.publish).toHaveBeenCalledWith('org-123', {
      platform: 'x',
      accountId: 'acc-1',
      content: { text: 'Hello world' },
    });
    const content = JSON.parse((res.result as any).content[0].text);
    expect(content).toEqual(publishResult);
  });

  it('passes subreddit + title metadata for reddit posts', async () => {
    mockPublishService.publish.mockResolvedValue({ postId: 'post-2' });

    await service.handleMessage(
      {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'publish_post',
          arguments: {
            platform: 'reddit',
            accountId: 'acc-2',
            text: 'Check this out',
            subreddit: 'testsubreddit',
            title: 'My Post Title',
          },
        },
      },
      'org-123',
    );

    expect(mockPublishService.publish).toHaveBeenCalledWith('org-123', {
      platform: 'reddit',
      accountId: 'acc-2',
      content: {
        text: 'Check this out',
        metadata: { subreddit: 'testsubreddit', title: 'My Post Title' },
      },
    });
  });

  it('passes imageUrl as media array', async () => {
    mockPublishService.publish.mockResolvedValue({ postId: 'post-3' });

    await service.handleMessage(
      {
        jsonrpc: '2.0',
        id: 9,
        method: 'tools/call',
        params: {
          name: 'publish_post',
          arguments: {
            platform: 'instagram',
            accountId: 'acc-3',
            text: 'Photo post',
            imageUrl: 'https://example.com/photo.jpg',
          },
        },
      },
      'org-123',
    );

    expect(mockPublishService.publish).toHaveBeenCalledWith('org-123', {
      platform: 'instagram',
      accountId: 'acc-3',
      content: {
        text: 'Photo post',
        media: [{ url: 'https://example.com/photo.jpg', type: 'image' }],
      },
    });
  });

  it('returns error response (not thrown) for HttpException in publish', async () => {
    const httpError = new HttpException(
      { code: 'RATE_LIMITED', agentHint: 'Wait 60s and retry.' },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    mockPublishService.publish.mockRejectedValue(httpError);

    const res = await service.handleMessage(
      {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'publish_post',
          arguments: { platform: 'x', accountId: 'acc-1', text: 'test' },
        },
      },
      'org-123',
    );

    // Should NOT be an error JSON-RPC response — returns the HttpException response as tool content
    expect(res.error).toBeUndefined();
    const content = JSON.parse((res.result as any).content[0].text);
    expect(content.code).toBe('RATE_LIMITED');
  });

  // ── tools/call: check_platform_capabilities ─────────────────────────────

  it('returns platform capabilities for check_platform_capabilities', async () => {
    const res = await service.handleMessage(
      {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: { name: 'check_platform_capabilities', arguments: { platform: 'x' } },
      },
      'org-123',
    );

    const content = JSON.parse((res.result as any).content[0].text);
    expect(content).toHaveProperty('id', 'x');
    expect(content).toHaveProperty('text.maxLength');
    expect(content).toHaveProperty('media.supportedTypes');
  });

  // ── tools/call: list_all_platform_capabilities ──────────────────────────

  it('returns all platform capabilities', async () => {
    const res = await service.handleMessage(
      {
        jsonrpc: '2.0',
        id: 12,
        method: 'tools/call',
        params: { name: 'list_all_platform_capabilities', arguments: {} },
      },
      'org-123',
    );

    const content = JSON.parse((res.result as any).content[0].text);
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThanOrEqual(6);
    const platformIds = content.map((p: any) => p.id);
    expect(platformIds).toContain('x');
    expect(platformIds).toContain('linkedin');
    expect(platformIds).toContain('reddit');
  });

  // ── tools/call: check_rate_limits ───────────────────────────────────────

  it('calls accounts.getRateLimits with accountId + orgId', async () => {
    const rateLimits = { used: 5, limit: 100, remaining: 95, resetAt: '2026-04-01', windowMinutes: 43200 };
    mockAccountsService.getRateLimits.mockResolvedValue(rateLimits);

    const res = await service.handleMessage(
      {
        jsonrpc: '2.0',
        id: 13,
        method: 'tools/call',
        params: { name: 'check_rate_limits', arguments: { accountId: 'acc-1' } },
      },
      'org-123',
    );

    expect(mockAccountsService.getRateLimits).toHaveBeenCalledWith('acc-1', 'org-123');
    const content = JSON.parse((res.result as any).content[0].text);
    expect(content).toEqual(rateLimits);
  });

  // ── tools/call: get_post_status ─────────────────────────────────────────

  it('calls posts.getStatus with postId', async () => {
    const postStatus = { id: 'post-1', status: 'published', publishedAt: '2026-03-27T12:00:00Z' };
    mockPostsService.getStatus.mockResolvedValue(postStatus);

    const res = await service.handleMessage(
      {
        jsonrpc: '2.0',
        id: 14,
        method: 'tools/call',
        params: { name: 'get_post_status', arguments: { postId: 'post-1' } },
      },
      'org-123',
    );

    expect(mockPostsService.getStatus).toHaveBeenCalledWith('post-1');
    const content = JSON.parse((res.result as any).content[0].text);
    expect(content).toEqual(postStatus);
  });

  // ── tools/call: unknown tool ────────────────────────────────────────────

  it('returns -32603 for unknown tool name', async () => {
    const res = await service.handleMessage(
      {
        jsonrpc: '2.0',
        id: 15,
        method: 'tools/call',
        params: { name: 'nonexistent_tool', arguments: {} },
      },
      'org-123',
    );

    expect(res.error).toEqual({ code: -32603, message: 'Unknown tool: nonexistent_tool' });
  });

  // ── error handling: non-HttpException errors propagate as -32603 ─────────

  it('returns -32603 when service throws non-HttpException', async () => {
    mockAccountsService.listAccounts.mockRejectedValue(new Error('DB connection lost'));

    const res = await service.handleMessage(
      {
        jsonrpc: '2.0',
        id: 16,
        method: 'tools/call',
        params: { name: 'list_accounts', arguments: {} },
      },
      'org-123',
    );

    expect(res.error).toEqual({ code: -32603, message: 'DB connection lost' });
  });
});

// ─── McpController (batch handling) ──────────────────────────────────────────

describe('McpController', () => {
  let controller: McpController;
  let service: McpService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [McpController],
      providers: [
        McpService,
        { provide: AccountsService, useValue: mockAccountsService },
        { provide: PublishService, useValue: mockPublishService },
        { provide: PostsService, useValue: mockPostsService },
      ],
    }).compile();

    controller = module.get<McpController>(McpController);
    service = module.get<McpService>(McpService);
    jest.clearAllMocks();
  });

  it('handles single message', async () => {
    const res = await controller.handle(
      { jsonrpc: '2.0', id: 1, method: 'initialize' },
      makeReq(),
    );

    expect((res as McpResponse).jsonrpc).toBe('2.0');
    expect((res as McpResponse).id).toBe(1);
  });

  it('handles batch messages', async () => {
    const messages: McpMessage[] = [
      { jsonrpc: '2.0', id: 1, method: 'initialize' },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
    ];

    const res = await controller.handle(messages, makeReq());

    expect(Array.isArray(res)).toBe(true);
    const responses = res as McpResponse[];
    expect(responses).toHaveLength(2);
    expect(responses[0].id).toBe(1);
    expect(responses[1].id).toBe(2);
    expect((responses[1].result as any).tools).toHaveLength(6);
  });

  it('passes orgId from request to service', async () => {
    mockAccountsService.listAccounts.mockResolvedValue([]);

    await controller.handle(
      {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'list_accounts', arguments: {} },
      },
      makeReq('org-456'),
    );

    expect(mockAccountsService.listAccounts).toHaveBeenCalledWith('org-456');
  });
});
