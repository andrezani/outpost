# @outpost/mcp-server

> MCP server for [Outpost](https://outpost.dev) — publish social media posts to X (Twitter), LinkedIn, Instagram, Reddit, Bluesky, and Threads from any AI agent.

## Quick Start

Add to your Claude Desktop / Cursor config:

```json
{
  "mcpServers": {
    "outpost": {
      "command": "npx",
      "args": ["-y", "@outpost/mcp-server"],
      "env": {
        "OUTPOST_API_KEY": "sa_your_key_here"
      }
    }
  }
}
```

Get your API key at [outpost.dev](https://outpost.dev).

## Self-Hosted

If you're running Outpost locally:

```json
{
  "mcpServers": {
    "outpost": {
      "command": "npx",
      "args": ["-y", "@outpost/mcp-server"],
      "env": {
        "OUTPOST_API_KEY": "sa_your_key_here",
        "OUTPOST_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

## Tools

| Tool | Description |
|------|-------------|
| `publish_post` | Publish a post to any supported platform |
| `list_accounts` | List connected social media accounts |
| `check_platform_capabilities` | Check character limits, media support, features |
| `check_rate_limits` | Check rate limit status for an account |
| `list_all_platform_capabilities` | Get capabilities for all platforms at once |
| `get_post_status` | Check status of a previously published post |

## Supported Platforms

- **X (Twitter)** — OAuth 2.0 PKCE
- **LinkedIn** — UGC Posts API
- **Instagram** — Container publish flow
- **Reddit** — OAuth 2.0, subreddit targeting
- **Bluesky** — App password + AT Protocol
- **Threads** — Meta OAuth, container publish flow

## Agent-Native Design

Every error response includes `agentHint` — a plain English explanation of what went wrong and exactly what to do next. No more agents retrying blindly.

```json
{
  "error": {
    "code": "CONTENT_TOO_LONG",
    "message": "Content exceeds X character limit (280)",
    "agentHint": "Shorten the text to 280 characters or fewer and retry. Current length: 347 characters."
  }
}
```

## Links

- [Outpost](https://outpost.dev) — Hosted API
- [GitHub](https://github.com/andrezani/outpost) — Self-host
- [Documentation](https://outpost.dev/docs)
