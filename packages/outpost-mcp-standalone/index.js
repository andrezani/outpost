#!/usr/bin/env node
/**
 * outpost-mcp — MCP server for Outpost API
 *
 * Exposes Outpost's social publishing API as Model Context Protocol tools
 * for use in Claude Desktop, Cursor, and any MCP-compatible AI agent.
 *
 * Tools:
 *   - publish_post       → Publish content to X, LinkedIn, Reddit, Instagram, Bluesky, Threads
 *   - list_accounts      → List all connected social accounts
 *   - get_capabilities   → Get platform capabilities (char limits, media types, features)
 *   - check_rate_limits  → Check rate limit status for an account
 *   - get_post_status    → Look up the status of a published post
 *
 * Config:
 *   OUTPOST_API_KEY  — required (get yours at outpostapi.dev)
 *   OUTPOST_API_URL  — optional (default: https://api.outpostapi.dev)
 *
 * Usage:
 *   npx @outpost/mcp-server
 *
 * © 2024 Hibernyte — MIT License
 */

'use strict';

const readline = require('readline');

const BASE_URL = (process.env.OUTPOST_API_URL ?? 'https://api.outpostapi.dev').replace(/\/$/, '');
const API_KEY = process.env.OUTPOST_API_KEY;
const API_PREFIX = `${BASE_URL}/api/v1`;

if (!API_KEY) {
  process.stderr.write(
    '[outpost-mcp] ERROR: OUTPOST_API_KEY environment variable is required.\n' +
    '[outpost-mcp] Get your API key at https://outpostapi.dev\n'
  );
  process.exit(1);
}

// ─── Tool Definitions ────────────────────────────────────────────────────────

const TOOLS = [
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
          description: 'Optional: filter accounts by platform.',
        },
      },
    },
  },
  {
    name: 'get_capabilities',
    description:
      'Get what a platform supports before posting — character limits, media types, features, and rate limits. ' +
      'Call this before composing content to ensure it fits platform constraints.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['x', 'linkedin', 'instagram', 'reddit', 'bluesky', 'threads'],
          description: 'The platform to check. Omit to get capabilities for all platforms.',
        },
      },
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
    name: 'get_post_status',
    description:
      'Check the status of a previously published post (published, failed, pending). ' +
      'Use the postId returned by publish_post.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: {
          type: 'string',
          description: 'The post ID returned by publish_post.',
        },
      },
      required: ['postId'],
    },
  },
];

// ─── API Helpers ─────────────────────────────────────────────────────────────

async function apiGet(path) {
  const res = await fetch(`${API_PREFIX}${path}`, {
    headers: { 'X-API-Key': API_KEY },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(JSON.stringify(body));
  }
  return res.json();
}

async function apiPost(path, body) {
  const res = await fetch(`${API_PREFIX}${path}`, {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  // Return structured response whether ok or not — agents need to parse errors
  return res.json().catch(() => ({ error: `HTTP ${res.status}` }));
}

// ─── Tool Handlers ────────────────────────────────────────────────────────────

async function handleTool(name, args) {
  switch (name) {
    case 'publish_post': {
      const { platform, accountId, text, subreddit, title, imageUrl, replyTo } = args;

      const body = {
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
            ? { media: [{ url: imageUrl, type: 'image' }] }
            : {}),
        },
      };

      return apiPost('/publish', body);
    }

    case 'list_accounts': {
      const accounts = await apiGet('/accounts');
      const { platform } = args;
      if (platform && Array.isArray(accounts)) {
        return accounts.filter((a) => a.platform === platform);
      }
      return accounts;
    }

    case 'get_capabilities': {
      const { platform } = args;
      if (platform) {
        return apiGet(`/platforms/${platform}/capabilities`);
      }
      return apiGet('/platforms');
    }

    case 'check_rate_limits': {
      const { accountId } = args;
      return apiGet(`/accounts/${accountId}/rate-limits`);
    }

    case 'get_post_status': {
      const { postId } = args;
      return apiGet(`/posts/${postId}/status`);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// ─── MCP Protocol ─────────────────────────────────────────────────────────────

function send(response) {
  process.stdout.write(JSON.stringify(response) + '\n');
}

async function handleRequest(req) {
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
              name: 'outpost-mcp',
              version: '0.1.0',
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
        const { name: toolName, arguments: toolArgs = {} } = req.params;
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
    send({
      jsonrpc: '2.0',
      id: req.id,
      error: {
        code: -32603,
        message: err instanceof Error ? err.message : String(err),
      },
    });
  }
}

// ─── Stdio Transport ───────────────────────────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false,
});

process.stderr.write('[outpost-mcp] Started. Waiting for requests on stdin.\n');

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let req;
  try {
    req = JSON.parse(trimmed);
  } catch {
    process.stderr.write(`[outpost-mcp] Failed to parse request: ${trimmed}\n`);
    return;
  }

  handleRequest(req).catch((err) => {
    process.stderr.write(
      `[outpost-mcp] Unhandled error: ${err instanceof Error ? err.message : String(err)}\n`
    );
  });
});

rl.on('close', () => {
  process.stderr.write('[outpost-mcp] stdin closed. Exiting.\n');
  process.exit(0);
});
