# Outpost

> **The social media API built for AI agents.** One endpoint. Six platforms. Native MCP support.

Post to X, LinkedIn, Instagram, Reddit, Bluesky, and Threads — from any AI agent — with a single API call. Outpost understands agent needs: structured errors with `agentHint`, MCP native integration for Claude Desktop/Cursor, and per-org credential isolation (the thing Postiz literally cannot do).

---

## Why Outpost

- **Agent-native errors** — every failure returns `code` + `agentHint` so your LLM knows exactly what to do
- **MCP server included** — works natively in Claude Desktop, Cursor, and any MCP-compatible agent
- **Multi-tenant OAuth** — each org connects their own social accounts (not shared credentials like Postiz)
- **One unified endpoint** — `POST /api/v1/publish` posts to any platform, same request shape
- **6 platforms, all working** — X (Twitter), LinkedIn, Instagram, Reddit, Bluesky, Threads

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 11 (TypeScript) |
| Database | PostgreSQL 16 via Prisma |
| Cache | Redis 7 |
| Auth | API Key (`X-API-Key` or `Authorization: Bearer`) |
| MCP | stdio transport (Claude Desktop, Cursor) |

---

## Quick Start

### Prerequisites

- Node.js 18+
- Docker (for Postgres + Redis)

### 1. Install

```bash
git clone <repo-url> Outpost
cd Outpost
npm install
npx prisma generate
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — DATABASE_URL and social platform credentials
```

### 3. Start infrastructure

```bash
docker compose up -d
```

### 4. Run migrations + seed

```bash
npx prisma migrate dev
```

### 5. Start

```bash
npm run start:dev
```

---

## API Reference

### Authentication

All endpoints (except `POST /organizations` and `GET /health`) require an API key:

```
X-API-Key: sa_xxx
# or
Authorization: Bearer sa_xxx
```

Create your organization + get an API key:
```bash
curl -X POST http://localhost:3000/organizations \
  -H "Content-Type: application/json" \
  -d '{"name": "My Org"}'
```

---

### POST /api/v1/publish

Publish a post to any platform.

```bash
curl -X POST http://localhost:3000/api/v1/publish \
  -H "X-API-Key: sa_xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "platform": "x",
    "accountId": "clxxx",
    "content": {
      "text": "Hello from Outpost! 🤖"
    }
  }'
```

**Success response:**
```json
{
  "success": true,
  "postId": "1234567890",
  "platform": "x",
  "url": "https://x.com/user/status/1234567890",
  "publishedAt": "2026-03-25T03:35:00.000Z"
}
```

**Failure response (agent-parseable):**
```json
{
  "success": false,
  "error": {
    "code": "RATE_LIMITED",
    "message": "X rate limit exceeded",
    "agentHint": "Retry after 2026-03-25T03:45:00Z. Rate limit resets every 15 minutes.",
    "retryAfter": "2026-03-25T03:45:00Z"
  }
}
```

**Error codes:**

| Code | Meaning |
|------|---------|
| `AUTH_EXPIRED` | Token expired — reconnect account |
| `AUTH_INVALID` | Token revoked — full re-auth needed |
| `RATE_LIMITED` | Platform rate limit hit |
| `ORG_QUOTA_EXCEEDED` | Monthly free tier (100 posts) exhausted |
| `CONTENT_TOO_LONG` | Text exceeds platform limit |
| `CONTENT_POLICY` | Platform rejected for policy violation |
| `MEDIA_TOO_LARGE` | Media file too large |
| `MEDIA_TYPE_UNSUPPORTED` | Platform doesn't support this media type |
| `ACCOUNT_NOT_FOUND` | accountId not found in org |
| `PLATFORM_ERROR` | Generic platform-side error |
| `PLATFORM_DOWN` | Platform API unavailable |
| `SUBREDDIT_REQUIRED` | Reddit post missing subreddit |
| `SUBREDDIT_NOT_FOUND` | Subreddit doesn't exist |

---

### GET /api/v1/platforms

List all platforms + capabilities. Call this before composing content.

```bash
curl http://localhost:3000/api/v1/platforms -H "X-API-Key: sa_xxx"
```

### GET /api/v1/platforms/:platform/capabilities

Check a specific platform's text limits, media types, rate limits.

```bash
curl http://localhost:3000/api/v1/platforms/x/capabilities -H "X-API-Key: sa_xxx"
```

---

### Account Management

```bash
# List connected accounts
GET /api/v1/accounts

# Connect X via OAuth
POST /api/v1/accounts/connect/x
Body: { "redirectUri": "https://yourapp.com/callback" }
→ Returns: { "authUrl": "...", "state": "...", "instructions": "..." }

# OAuth callback
POST /api/v1/accounts/connect/x/callback
Body: { "code": "...", "state": "..." }

# Connect Bluesky (app password)
POST /api/v1/accounts/connect/bluesky
Body: { "handle": "user.bsky.social", "appPassword": "xxxx-xxxx-xxxx-xxxx" }

# Disconnect account
DELETE /api/v1/accounts/:id

# Check rate limits
GET /api/v1/accounts/:id/rate-limits
```

---

### Webhooks

Get notified when posts succeed or fail:

```bash
# Register webhook
POST /api/v1/webhooks
Body: { "url": "https://your-agent.com/hook", "events": ["post_published", "post_failed"] }
```

Payload:
```json
{
  "event": "post.published",
  "postId": "1234567890",
  "platform": "x",
  "url": "https://x.com/user/status/1234567890",
  "timestamp": "2026-03-25T03:35:00.000Z"
}
```

Delivery: 3 retries with exponential backoff (1s → 5s → 30s). HMAC-SHA256 signed.

---

## MCP Server (Claude Desktop / Cursor)

Add to `~/.claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "outpost": {
      "command": "node",
      "args": ["/path/to/Outpost/dist/mcp/mcp-server.js"],
      "env": {
        "OUTPOST_API_KEY": "sa_xxx",
        "OUTPOST_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

Build first: `npm run build`

**MCP Tools available:**

| Tool | Description |
|------|-------------|
| `publish_post` | Publish to any platform |
| `list_accounts` | List connected accounts |
| `check_platform_capabilities` | Get text limits, media types, rate limits |
| `check_rate_limits` | Current rate limit status for an account |
| `list_all_platform_capabilities` | All platforms at once |
| `get_post_status` | Check status of a published post |

---

## Platform OAuth Setup

Each platform requires its own developer app. Add credentials to `.env`.

| Platform | Auth method | Setup URL |
|----------|------------|-----------|
| X (Twitter) | OAuth 2.0 PKCE | [developer.twitter.com](https://developer.twitter.com/en/apps) |
| Reddit | OAuth 2.0 | [reddit.com/prefs/apps](https://www.reddit.com/prefs/apps) |
| Instagram | Meta OAuth | [developers.facebook.com](https://developers.facebook.com/apps/) |
| LinkedIn | OAuth 2.0 | [linkedin.com/developers](https://www.linkedin.com/developers/apps) |
| Threads | Meta OAuth | Same Meta app as Instagram |
| Bluesky | App password | No setup needed — user provides app password |

> ⚠️ **Instagram/Threads:** Use the "Other/legacy" Meta app type, NOT the new use-case wizard (it auto-attaches deprecated scopes that get rejected).

> ⚠️ **X OAuth:** Add your callback URL to the Twitter developer app or OAuth will silently fail.

---

## Self-Host with Docker

Deploy the full stack (app + postgres + redis) in 5 commands:

```bash
# 1. Clone the repo
git clone <repo-url> Outpost && cd Outpost

# 2. Copy and fill in credentials
cp .env.example .env
# Edit .env — add your social platform client IDs/secrets

# 3. Start everything
docker compose up -d

# 4. Seed your admin org + get API key
docker compose exec app npm run seed:admin

# 5. Open Swagger playground
open http://localhost:3000/api
```

> The app container runs `prisma migrate deploy` automatically on startup.
> Postgres and Redis data persist in named Docker volumes across restarts.

---

## Development

```bash
# Run in watch mode
npm run start:dev

# TypeScript check (must be 0 errors before committing)
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json

# Regenerate Prisma client after schema changes
npx prisma generate

# Run tests
npm test
```

Pre-commit hook runs `prisma generate` + `tsc --noEmit` automatically.

---

## License

UNLICENSED — private repo.
