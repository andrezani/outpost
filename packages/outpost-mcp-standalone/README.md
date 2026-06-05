# outpost-mcp

[![npm version](https://img.shields.io/npm/v/%40outpost%2Fmcp-server)](https://www.npmjs.com/package/@outpost/mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**MCP server for [Outpost](https://outpostapi.dev)** — publish to X (Twitter), LinkedIn, Reddit, Instagram, Bluesky, and Threads directly from Claude, Cursor, or any AI agent.

Outpost is a unified social media publishing API. This MCP server wraps it as a [Model Context Protocol](https://modelcontextprotocol.io) tool, so your AI agent can post to social media as a first-class capability — no separate UI needed.

---

## Quick Start

### Claude Desktop

Add this to your `~/.claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "outpost": {
      "command": "npx",
      "args": ["-y", "@outpost/mcp-server"],
      "env": {
        "OUTPOST_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

Restart Claude Desktop — the Outpost tools will appear automatically.

### Custom API URL (self-hosted)

```json
{
  "mcpServers": {
    "outpost": {
      "command": "npx",
      "args": ["-y", "@outpost/mcp-server"],
      "env": {
        "OUTPOST_API_KEY": "your-api-key-here",
        "OUTPOST_API_URL": "https://your-outpost-instance.com"
      }
    }
  }
}
```

### Cursor / Other MCP Clients

Same config structure — refer to your client's MCP documentation for where to put it.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OUTPOST_API_KEY` | ✅ Yes | — | Your Outpost API key ([get one here](https://outpostapi.dev)) |
| `OUTPOST_API_URL` | No | `https://api.outpostapi.dev` | Outpost API base URL (for self-hosted instances) |

---

## Tools

### `publish_post`
Publish content to a social media platform.

```
Platforms: x, linkedin, instagram, reddit, bluesky, threads

Required: platform, accountId, text
Optional: imageUrl, subreddit (reddit), title (reddit), replyTo
```

**Example prompt:** *"Post to my X account: 'Just shipped a new feature 🚀 #buildinpublic'"*

---

### `list_accounts`
List all connected social accounts available for posting.

```
Optional: platform (filter by platform)
Returns: accountId, platform, handle, status
```

**Example prompt:** *"What social accounts do I have connected in Outpost?"*

---

### `get_capabilities`
Get platform capabilities before posting — character limits, media types, supported features.

```
Optional: platform (omit to get all platforms)
Returns: charLimit, mediaTypes, features, rateLimits
```

**Example prompt:** *"What's the character limit on LinkedIn vs Bluesky?"*

---

### `check_rate_limits`
Check current rate limit status for a connected account.

```
Required: accountId
Returns: remaining, resetAt, limit
```

---

### `get_post_status`
Look up the status of a previously published post.

```
Required: postId (returned by publish_post)
Returns: status (published|pending|failed), url, publishedAt
```

---

## Example Workflow

Ask Claude:

> *"Post this thread to my X account and then check if it published successfully."*

Claude will:
1. Call `list_accounts` → find your X account ID
2. Call `get_capabilities` → verify character limits
3. Call `publish_post` → publish the content
4. Call `get_post_status` → confirm it went through

---

## Get an API Key

Sign up at **[outpostapi.dev](https://outpostapi.dev)** to get your API key and connect your social accounts.

---

## License

MIT © [Hibernyte](https://hibernyte.com)
