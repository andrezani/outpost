import { Injectable, Logger, HttpException } from '@nestjs/common';
import { SocialPlatform } from '@prisma/client';
import { AccountsService } from '../accounts/accounts.service';
import { PublishService } from '../publish/publish.service';
import { PostsService } from '../posts/posts.service';
import {
  getPlatformCapabilities,
  getAllPlatformCapabilities,
} from '../../common/platform-capabilities';

export interface McpMessage {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  jsonrpc: '2.0';
  id?: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const TOOLS: McpTool[] = [
  {
    name: 'publish_post',
    description:
      'Publish a post to a social media platform via Outpost. ' +
      'Supports X (Twitter), LinkedIn, Instagram, Reddit, Bluesky, and Threads. ' +
      'Always call list_accounts first to get a valid accountId. ' +
      'Returns postId, url, and publishedAt on success; error.code + agentHint on failure.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['x', 'linkedin', 'instagram', 'reddit', 'bluesky', 'threads'],
          description: 'The target social media platform.',
        },
        accountId: {
          type: 'string',
          description: 'The connected account ID to post from. Get this from list_accounts.',
        },
        text: {
          type: 'string',
          description: 'The post content/text.',
        },
        subreddit: {
          type: 'string',
          description: 'Required when platform=reddit. The subreddit to post to (without r/ prefix).',
        },
        title: {
          type: 'string',
          description: 'Required when platform=reddit. The post title.',
        },
        imageUrl: {
          type: 'string',
          description: 'Optional public image URL to attach. Required for Instagram (text-only not supported).',
        },
        replyTo: {
          type: 'string',
          description: 'Optional post ID to reply to.',
        },
      },
      required: ['platform', 'accountId', 'text'],
    },
  },
  {
    name: 'list_accounts',
    description:
      'List all connected social media accounts available for posting. ' +
      'Returns accountId (needed for publish_post), platform, handle, and status.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['x', 'linkedin', 'instagram', 'reddit', 'bluesky', 'threads'],
          description: 'Optional: filter by platform.',
        },
      },
    },
  },
  {
    name: 'check_platform_capabilities',
    description:
      'Check what a platform supports before posting — text character limits, media types, features, and rate limits. ' +
      'Always call this before composing content to ensure it fits platform constraints.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['x', 'linkedin', 'instagram', 'reddit', 'bluesky', 'threads'],
          description: 'The platform to check.',
        },
      },
      required: ['platform'],
    },
  },
  {
    name: 'check_rate_limits',
    description: 'Check current rate limit status for a connected account before posting.',
    inputSchema: {
      type: 'object',
      properties: {
        accountId: {
          type: 'string',
          description: 'The account ID to check rate limits for.',
        },
      },
      required: ['accountId'],
    },
  },
  {
    name: 'list_all_platform_capabilities',
    description:
      'List capabilities for all supported platforms at once. ' +
      'Use this to understand all platform limits before deciding where to post.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_post_status',
    description:
      'Check the status of a tracked post (draft or scheduled). ' +
      'Use the internal post ID (from scheduled post creation) to look up status.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: {
          type: 'string',
          description: 'The internal post ID of a tracked (draft/scheduled) post.',
        },
      },
      required: ['postId'],
    },
  },
];

type ToolArgs = Record<string, unknown>;

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    private readonly accounts: AccountsService,
    private readonly publish: PublishService,
    private readonly posts: PostsService,
  ) {}

  async handleMessage(msg: McpMessage, orgId: string): Promise<McpResponse> {
    try {
      switch (msg.method) {
        case 'initialize':
          return {
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'outpost', version: '1.0.0' },
            },
          };

        case 'tools/list':
          return { jsonrpc: '2.0', id: msg.id, result: { tools: TOOLS } };

        case 'tools/call': {
          const params = msg.params as { name: string; arguments?: ToolArgs };
          const result = await this.callTool(params.name, params.arguments ?? {}, orgId);
          return {
            jsonrpc: '2.0',
            id: msg.id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
            },
          };
        }

        case 'notifications/initialized':
        case 'ping':
          return { jsonrpc: '2.0', id: msg.id, result: {} };

        default:
          return {
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -32601, message: `Method not found: ${msg.method}` },
          };
      }
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id: msg.id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  private async callTool(name: string, args: ToolArgs, orgId: string): Promise<unknown> {
    switch (name) {
      case 'list_accounts': {
        const { platform } = args as { platform?: string };
        const accountList = await this.accounts.listAccounts(orgId);
        return platform ? accountList.filter((a) => a.platform === platform) : accountList;
      }

      case 'publish_post': {
        const { platform, accountId, text, subreddit, title, imageUrl, replyTo } = args as {
          platform: string;
          accountId: string;
          text: string;
          subreddit?: string;
          title?: string;
          imageUrl?: string;
          replyTo?: string;
        };

        const hasMetadata = subreddit || title || replyTo;

        try {
          return await this.publish.publish(orgId, {
            platform: platform as SocialPlatform,
            accountId,
            content: {
              text,
              ...(hasMetadata
                ? {
                    metadata: {
                      ...(subreddit && { subreddit }),
                      ...(title && { title }),
                      ...(replyTo && { replyTo }),
                    },
                  }
                : {}),
              ...(imageUrl ? { media: [{ url: imageUrl, type: 'image' as const }] } : {}),
            },
          });
        } catch (err) {
          if (err instanceof HttpException) {
            // Return structured agent error as tool result (agents need to parse it)
            return err.getResponse();
          }
          throw err;
        }
      }

      case 'check_platform_capabilities': {
        const { platform } = args as { platform: string };
        return getPlatformCapabilities(platform as SocialPlatform);
      }

      case 'list_all_platform_capabilities':
        return getAllPlatformCapabilities();

      case 'check_rate_limits': {
        const { accountId } = args as { accountId: string };
        return this.accounts.getRateLimits(accountId, orgId);
      }

      case 'get_post_status': {
        const { postId } = args as { postId: string };
        return this.posts.getStatus(postId);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }
}
