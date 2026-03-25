/**
 * SocialAgent MCP Server — stdio transport (Phase 1)
 *
 * Exposes SocialAgent API as Model Context Protocol tools for use in:
 * - Claude Desktop
 * - Cursor
 * - Any MCP-compatible agent framework
 *
 * Transport: stdio (Phase 1)
 * HTTP SSE transport: Phase 2 (hosted use)
 *
 * Config for Claude Desktop (~/.claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "socialagent": {
 *       "command": "node",
 *       "args": ["/path/to/socialagent/dist/mcp/mcp-server.js"],
 *       "env": {
 *         "SOCIALAGENT_API_KEY": "sa_xxx",
 *         "SOCIALAGENT_BASE_URL": "http://localhost:3000"
 *       }
 *     }
 *   }
 * }
 *
 * Or via npx (once published):
 * {
 *   "mcpServers": {
 *     "socialagent": {
 *       "command": "npx",
 *       "args": ["-y", "@socialagent/mcp-server"],
 *       "env": { "SOCIALAGENT_API_KEY": "sa_xxx" }
 *     }
 *   }
 * }
 */

import * as readline from 'readline';

const BASE_URL = process.env.SOCIALAGENT_BASE_URL ?? 'http://localhost:3000';
const API_KEY = process.env.SOCIALAGENT_API_KEY;
const API_PREFIX = `${BASE_URL}/api/v1`;

if (!API_KEY) {
  process.stderr.write(
    '[SocialAgent MCP] ERROR: SOCIALAGENT_API_KEY environment variable is required.\n',
  );
  process.exit(1);
}

// ─── MCP Types ──────────────────────────────────────────────────────────────

interface McpRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface McpResponse {
  jsonrpc: '2.0';
  id: string | number;
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

// ─── Tool Definitions ───────────────────────────────────────────────────────

const TOOLS: McpTool[] = [
  {
    name: 'publish_post',
    description:
      'Publish a post to a social media platform via SocialAgent. ' +
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
    description:
      'Check current rate limit status for a connected account before posting.',
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
      'Check the status of a previously published post (published, failed, pending). ' +
      'Use the postId returned by publish_post to look up the post.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: {
          type: 'string',
          description: 'The internal post ID returned by publish_post.',
        },
      },
      required: ['postId'],
    },
  },
];

// ─── API Helpers ─────────────────────────────────────────────────────────────

async function apiGet(path: string): Promise<unknown> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    headers: { 'X-API-Key': API_KEY! },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as unknown;
    throw new Error(JSON.stringify(body));
  }
  return res.json();
}

async function apiPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${API_PREFIX}${path}`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({ error: `HTTP ${res.status}` }))) as unknown;
  if (!res.ok) {
    // Return the structured error response — don't throw (agents need to parse it)
    return data;
  }
  return data;
}

// ─── Tool Handlers ───────────────────────────────────────────────────────────

type ToolArgs = Record<string, unknown>;

async function handleTool(name: string, args: ToolArgs): Promise<unknown> {
  switch (name) {
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

      const body: Record<string, unknown> = {
        platform,
        accountId,
        content: {
          text,
          ...(subreddit || title || replyTo
            ? {
                metadata: {
                  ...(subreddit && { subreddit }),
                  ...(title && { title }),
                  ...(replyTo && { replyTo }),
                },
              }
            : {}),
          ...(imageUrl
            ? {
                media: [{ url: imageUrl, type: 'image' }],
              }
            : {}),
        },
      };

      return apiPost('/publish', body);
    }

    case 'list_accounts': {
      const accounts = (await apiGet('/accounts')) as Array<Record<string, unknown>>;
      const { platform } = args as { platform?: string };
      if (platform && Array.isArray(accounts)) {
        return accounts.filter((a) => a.platform === platform);
      }
      return accounts;
    }

    case 'check_platform_capabilities': {
      const { platform } = args as { platform: string };
      return apiGet(`/platforms/${platform}/capabilities`);
    }

    case 'list_all_platform_capabilities': {
      return apiGet('/platforms');
    }

    case 'check_rate_limits': {
      const { accountId } = args as { accountId: string };
      return apiGet(`/accounts/${accountId}/rate-limits`);
    }

    case 'get_post_status': {
      const { postId } = args as { postId: string };
      return apiGet(`/posts/${postId}/status`);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP Protocol Handler ────────────────────────────────────────────────────

function send(response: McpResponse): void {
  process.stdout.write(JSON.stringify(response) + '\n');
}

async function handleRequest(req: McpRequest): Promise<void> {
  try {
    switch (req.method) {
      case 'initialize': {
        send({
          jsonrpc: '2.0',
          id: req.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: {
              name: 'socialagent',
              version: '1.0.0',
            },
          },
        });
        break;
      }

      case 'tools/list': {
        send({
          jsonrpc: '2.0',
          id: req.id,
          result: { tools: TOOLS },
        });
        break;
      }

      case 'tools/call': {
        const params = req.params as { name: string; arguments?: ToolArgs };
        const toolName = params.name;
        const toolArgs = params.arguments ?? {};

        const result = await handleTool(toolName, toolArgs);

        send({
          jsonrpc: '2.0',
          id: req.id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          },
        });
        break;
      }

      case 'notifications/initialized':
      case 'ping': {
        send({ jsonrpc: '2.0', id: req.id, result: {} });
        break;
      }

      default: {
        send({
          jsonrpc: '2.0',
          id: req.id,
          error: {
            code: -32601,
            message: `Method not found: ${req.method}`,
          },
        });
      }
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    send({
      jsonrpc: '2.0',
      id: req.id,
      error: { code: -32603, message: errMsg },
    });
  }
}

// ─── Stdio Transport ─────────────────────────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  output: undefined,
  terminal: false,
});

process.stderr.write('[SocialAgent MCP] Started. Waiting for requests on stdin.\n');

rl.on('line', (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let req: McpRequest;
  try {
    req = JSON.parse(trimmed) as McpRequest;
  } catch {
    process.stderr.write(`[SocialAgent MCP] Failed to parse request: ${trimmed}\n`);
    return;
  }

  handleRequest(req).catch((err: unknown) => {
    process.stderr.write(
      `[SocialAgent MCP] Unhandled error: ${err instanceof Error ? err.message : String(err)}\n`,
    );
  });
});

rl.on('close', () => {
  process.stderr.write('[SocialAgent MCP] stdin closed. Exiting.\n');
  process.exit(0);
});
