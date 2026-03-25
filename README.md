# SocialAgent API

> Agent-native social media API — think Ayrshare, but built for AI agents with MCP support.

SocialAgent is a headless social media publishing API that lets AI agents (and humans) schedule and publish content across X, Instagram, Reddit, LinkedIn, and TikTok via a simple REST API authenticated with API keys.

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS (TypeScript) |
| Database | PostgreSQL 16 via Prisma ORM |
| Cache / Queue | Redis 7 |
| Job Scheduling | Inngest |
| Auth | API Key (X-API-Key header) |

## Features

- 🔑 **API Key auth** — per-organization, rotatable
- 📅 **Post scheduling** — draft, schedule, publish to one or many platforms
- 🔌 **Multi-platform integrations** — X, Instagram, Reddit, LinkedIn, TikTok
- 🤖 **Agent-native** — designed for programmatic use (no OAuth required from the agent side)
- 🔄 **Inngest jobs** — reliable scheduled publishing (no BullMQ footguns)

## Setup

### Prerequisites

- Node.js 18+
- Docker (for Postgres + Redis)

### 1. Clone and install

```bash
git clone <repo-url> SocialAgent
cd SocialAgent
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values
```

### 3. Start infrastructure

```bash
docker compose up -d
```

This starts:
- PostgreSQL 16 on port 5432
- Redis 7 on port 6379

### 4. Run database migrations

```bash
npx prisma migrate dev --name init
```

### 5. Generate Prisma client

```bash
npx prisma generate
```

## Running

### Development

```bash
npm run start:dev
```

API available at: `http://localhost:3000/api/v1`

### Production

```bash
npm run build
npm run start:prod
```

## API Quick Reference

All endpoints (except `POST /api/v1/organizations` and `POST /api/v1/auth/users`) require the `X-API-Key` header.

### Organizations

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/organizations` | Create organization (returns API key) |
| `GET` | `/api/v1/organizations/me` | Get current org |
| `PATCH` | `/api/v1/organizations/:id/rotate-api-key` | Rotate API key |

### Posts

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/posts` | Create/schedule a post |
| `GET` | `/api/v1/posts` | List posts (filter: `?status=SCHEDULED`) |
| `GET` | `/api/v1/posts/:id` | Get post |
| `PATCH` | `/api/v1/posts/:id` | Update post |
| `DELETE` | `/api/v1/posts/:id` | Delete post |

### Integrations

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/integrations` | Connect a social platform |
| `GET` | `/api/v1/integrations` | List connected platforms |
| `DELETE` | `/api/v1/integrations/:id` | Disconnect platform |

### Example: Create org + post

```bash
# Create org
curl -X POST http://localhost:3000/api/v1/organizations \
  -H "Content-Type: application/json" \
  -d '{"name": "My AI Agent"}'

# Response: { "id": "...", "apiKey": "sa_..." }

# Create a scheduled post
curl -X POST http://localhost:3000/api/v1/posts \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sa_your_api_key" \
  -d '{"content": "Hello from SocialAgent 🤖", "scheduledAt": "2026-03-25T10:00:00Z"}'
```

## Project Structure

```
src/
├── common/           # PrismaService, RedisService, CommonModule
├── health/           # Health check endpoint
├── middleware/        # ApiKeyMiddleware
├── modules/
│   ├── auth/         # AuthModule (user management)
│   ├── integrations/ # IntegrationsModule (social platform connections)
│   ├── organizations/ # OrganizationsModule (tenants + API keys)
│   └── posts/        # PostsModule (content scheduling)
└── providers/
    └── social.provider.ts  # Abstract SocialProvider base class
prisma/
└── schema.prisma     # Database schema
docker-compose.yml    # Local dev infrastructure
```

## Prisma Schema Models

- **Organization** — tenant with API key and billing
- **User** — user account (OAuth provider, timezone)
- **UserOrganization** — user ↔ org with role (OWNER/ADMIN/MEMBER)
- **Integration** — connected social account (token, platform identifier)
- **Post** — content with schedule and status (DRAFT/SCHEDULED/PUBLISHED/FAILED)
- **PostIntegration** — which integrations a post is published to

## Implementing a Social Provider

Extend `SocialProvider` to add a new platform:

```typescript
import { SocialProvider, PublishResult, ProviderProfile } from '../providers/social.provider';
import { SocialPlatform } from '@prisma/client';

export class XProvider extends SocialProvider {
  readonly platform = SocialPlatform.x;

  async publish(token: string, content: string): Promise<PublishResult> {
    // call Twitter API v2
    return { externalId: 'tweet_id', url: 'https://x.com/...' };
  }

  async refreshToken(refreshToken: string) {
    // implement token refresh
    return { token: 'new_token' };
  }

  async getProfile(token: string): Promise<ProviderProfile> {
    // fetch profile from Twitter API
    return { id: '...', username: '...' };
  }

  async deletePost(token: string, externalId: string): Promise<void> {
    // delete tweet
  }
}
```

## License

MIT — Hibernyte
