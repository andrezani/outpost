# AGENT_LOG.md — Outpost

---

## 2026-03-25 (agentHint audit + glama.ai prep)

### Task: agentHint audit (all 6 providers) + glama.ai README submission prep
**Task ID:** 977c820f-756e-4c53-9142-741707a53ffd

**Part 1 — agentHint audit:**
- Audited all 6 providers (X, Instagram, LinkedIn, Reddit, Bluesky, Threads)
- Finding: all provider errors flow through `buildAgentError()` in `publish.service.ts` — `agentHint` IS always present in error responses
- Fixed one gap: platform mismatch check at line 127 was throwing raw `BadRequestException` (no `agentHint`). Converted to structured `HttpException` with `code: VALIDATION_ERROR` + `agentHint: 'Call GET /api/v1/accounts to find the correct accountId'`
- Removed unused `BadRequestException` import from `publish.service.ts`
- TSC: 0 errors ✅ | Tests: 106/106 pass ✅
- **Commit:** 1717a65

**Part 2 — glama.ai README submission prep:**
- README: updated tagline to glama.ai-optimized description
- README: added tags comment, one-liner Docker quickstart, Claude Desktop + Cursor MCP configs
- `brain/agents/rex/outpost-glama-submission.md`: full submission brief with description, tags, Sociona competitor intel, action checklist
- TSC: 0 errors ✅ | Tests: 106/106 pass ✅
- **Commit:** b98140d

**Branch:** dev

---

# AGENT_LOG.md — SocialAgent

Rex (CTO), Hibernyte — task log for SocialAgent repo.

---

## 2026-03-25 (Phase 3a)

### Task: Outpost Phase 3a — checkout-session, portal, payment_succeeded, idempotency, webhook tests

**Completed:**
- `POST /api/v1/billing/create-checkout-session` — hosted Stripe Checkout page; creates/reuses customer, returns `{ url }`
- `POST /api/v1/billing/portal` — Stripe Billing Portal session; requires existing `org.paymentId`, returns `{ url }`
- `StripeService.createCheckoutSession` + `createPortalSession` methods added
- `invoice.payment_succeeded` webhook handler — logs customerId, amount_paid, invoiceId (no tier change; subscription events handle that)
- In-memory idempotency guard on `StripeWebhookController` via `Set<string> processedEventIds` (comment: use Redis/DB in production)
- `test/billing/stripe-webhook.controller.spec.ts` — 10 unit tests covering all event types, idempotency, invalid sig, missing rawBody
- Jest `roots` updated in `package.json` to include `test/` alongside `src/`
- `.env.example` — added `STRIPE_PORTAL_ENABLED=true` with setup comment
- `billing.module.ts` description updated to list all 5 endpoints
- TSC: 0 errors ✅ | Tests: 106/106 pass ✅ (10 new)

**Commit:** 71b9da3
**Branch:** dev

---

## 2026-03-25 (Billing)

### Task: Stripe billing module (Pro $29/mo + Team $99/mo + Founding $49/mo)
**Task ID:** 3aca2e1e-6489-44dd-b95c-7bdb07051e8c

**Completed:**
- `BillingModule` with `StripeService` — `createCustomer`, `createSubscription`, `cancelSubscription`
- `TierService` — `setTierByCustomerId`, `setTier`, `priceIdToTier` — updates `org.tier` + quota caches
- `StripeWebhookController` (POST `/api/v1/webhooks/stripe`):
  - `customer.subscription.created/updated/deleted` → update org tier via `TierService`
  - `invoice.payment_failed` → log (Stripe retries; subscription.deleted fires on max retries)
  - Stripe-Signature verified via `STRIPE_WEBHOOK_SECRET`
  - Excluded from API key middleware (Stripe auth is signature-based)
- `BillingController`:
  - `POST /api/v1/billing/subscribe` — plan: `pro` | `team` | `founding`; creates Stripe customer + sub
  - `DELETE /api/v1/billing/cancel` — cancel at period end
- Env vars (all stubbed, app works without them):
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  - `STRIPE_PRO_PRICE_ID`, `STRIPE_TEAM_PRICE_ID`, `STRIPE_FOUNDING_PRICE_ID`
- Raw body capture in `main.ts` for Stripe webhook signature verification
- `.env.example` updated with all Stripe vars + setup comments
- TSC: 0 errors ✅ | Tests: 96/96 pass ✅

**Commit:** 77b5578
**Branch:** dev

---

## 2026-03-25 (Phase 2)

### Task: Phase 2a — seed:admin bootstrap script
**Task ID:** 6c38aeb3-5d07-4ff3-9677-6d63b75baf13

**Completed:**
- `scripts/bootstrap.ts` — idempotent seed: finds or creates Hibernyte org, prints ID + API key + tier
- Added `npm run seed:admin` to package.json (ts-node -r tsconfig-paths/register)
- Output format: `✅ Org created: Hibernyte (id: xxx)` / `✅ API Key: sa_xxx` / `✅ Tier: free (100 posts/mo)`
- Idempotent: if org exists, prints existing key with `⚡ Org already exists` header
- TSC: 0 errors ✅

**Commit:** 7d4f641
**Branch:** dev

---

### Task: Phase 2b — OpenAPI/Swagger docs
**Task ID:** 8175a0ac-e61a-4ef4-89ae-173bbd14b356

**Completed:**
- Installed `@nestjs/swagger` + `swagger-ui-express`
- Wired `SwaggerModule` in `main.ts` — `/api` → Swagger UI, `/api-json` → OpenAPI JSON
- All 9 controllers annotated: `@ApiTags`, `@ApiOperation`, `@ApiResponse`, `@ApiBearerAuth`, `@ApiSecurity('X-API-Key')`
- All request DTOs annotated with `@ApiProperty` / `@ApiPropertyOptional`
- No `any` response schemas — all explicit with property types
- TSC: 0 errors ✅

**Commit:** 7d4f641
**Branch:** dev

---

### Task: Phase 2c — Docker Compose + .env.example
**Task ID:** f82ae716-af25-4a4b-8464-5833ec74ae76

**Completed:**
- `Dockerfile`: multi-stage build (builder → production), non-root user, `prisma migrate deploy` on start
- `docker-compose.yml`: added `app` service with healthcheck, env passthrough, depends_on postgres+redis healthy
- `.env.example`: already complete (all vars documented) — no changes needed
- `README.md`: self-host section added (5-step: clone → cp .env → docker compose up → seed → open /api)
- TSC: 0 errors ✅

**Commit:** 7d4f641
**Branch:** dev

---

Rex (CTO), Hibernyte — task log for SocialAgent repo.

---

## 2026-03-25

### Task: SocialAgent — Instagram + LinkedIn SocialProvider stubs
**Task ID:** 7f239583-829c-4e0c-8a1d-b208e05056ef

**Completed:**
- Implemented `InstagramProvider` extending `SocialProvider`:
  - Photo post (create container → publish), carousel support
  - OAuth flow stubs: `buildAuthUrl`, `exchangeCodeForToken`, `extendToken`, `refreshToken`
  - `getProfile` via Graph API (resolves IG Business Account ID from linked FB Page)
  - `deletePost`, `validateToken` (inherited)
  - Full JSDoc with API docs links
- Implemented `LinkedInProvider` extending `SocialProvider`:
  - Text post, article (URL share), image post (via Assets API upload registration)
  - OAuth flow stubs: `buildAuthUrl`, `exchangeCodeForToken`
  - `getProfile` via `/v2/me` with localized name handling
  - `deletePost`, `refreshToken`, `validateToken` (inherited)
  - Uses UGC Posts API (`/v2/ugcPosts`)
- Updated `ProviderRegistry`:
  - Added `SocialPlatform.instagram` → `InstagramProvider` (reads `INSTAGRAM_CLIENT_ID/SECRET`)
  - Added `SocialPlatform.linkedin` → `LinkedInProvider` (reads `LINKEDIN_CLIENT_ID/SECRET`)
  - Updated `getConfiguredPlatforms()` for both
- Added integration test skeletons (no real API calls):
  - `src/providers/__tests__/instagram.provider.spec.ts` — 11 test cases
  - `src/providers/__tests__/linkedin.provider.spec.ts` — 14 test cases
- Prisma schema: already had `instagram` + `linkedin` in `SocialPlatform` enum — no changes needed
- TSC: 0 errors ✅

**Commit:** 13550c2 (InstagramProvider + LinkedInProvider)
**Branch:** dev

---

### Task: SocialAgent — Phase 1 MVP (unified publish endpoint + auth + MCP server)
**Task ID:** 538802b7

**Completed:**
- **POST /api/v1/publish** — unified publish endpoint with full error taxonomy (13 codes + agentHint)
- **GET /api/v1/platforms** + **GET /api/v1/platforms/:platform/capabilities** — agent capability discovery
- **Auth endpoints** — OAuth flows for X (PKCE), Reddit, Instagram, LinkedIn, Threads + Bluesky app password connect
- **OAuthState model** — CSRF + PKCE state stored in DB with 15min TTL
- **API key middleware** — dual-format auth: `X-API-Key` + `Authorization: Bearer` (agent-friendly)
- **Organization quota** — postsUsed / postQuota / quotaResetAt with monthly reset
- **GET /api/v1/accounts** + rate-limits endpoint
- **GET /api/v1/posts/:id/status** — compact status endpoint for MCP
- **MCP server (stdio)** — 5 tools: publish_post, list_accounts, check_platform_capabilities, check_rate_limits, get_post_status
- **Webhooks** — CRUD + post-publish delivery with 3x retry, exponential backoff, HMAC-SHA256 signatures
- **Error taxonomy** — 13 structured codes with agentHint (classifyError maps platform errors to codes)
- All changes on `dev` branch, zero TSC errors

**Commit:** 895e7e0
**Branch:** dev

---

## 2026-03-25 (Phase 2 — morning session)

### Task: Dockerfile prod bug fix + dead dependency removal
**Completed:**
- Dockerfile: production stage now copies prisma CLI binary from builder (`node_modules/.bin/prisma` + `node_modules/prisma`) instead of relying on npx at container startup — `prisma` is a devDependency so `npm ci --omit=dev` doesn't install it. Production containers would have tried to re-download it via npx (slow, breaks in offline/air-gapped envs, unpredictable). Now uses `node_modules/.bin/prisma migrate deploy` directly.
- Removed `inngest` from production dependencies — never imported in any `.ts` file (only referenced in a comment). Saves ~2MB from Docker image. TSC: 0 errors confirmed after removal.
**Commit:** 013c8f8
**Branch:** dev

### Task: X + Reddit provider unit tests
**Completed:**
- `src/providers/__tests__/x.provider.spec.ts` — 20 tests: publish (success + 5 error paths), buildAuthUrl (PKCE, scopes, no-verifier), exchangeCodeForToken, refreshToken, getProfile, deletePost
- `src/providers/__tests__/reddit.provider.spec.ts` — 19 tests: publish (success, r/ prefix stripping, missing fields, HTTP error, json.errors[], missing data, link kind, default kind), refreshToken (3 error paths), getProfile, deletePost
- All 39 tests pass | TSC: 0 errors
**Commit:** b7648f5
**Branch:** dev

### Task: SocialAgent → Outpost rename
**Completed:**
- Renamed all `SocialAgent`/`socialagent`/`SOCIALAGENT` references to `Outpost`/`outpost`/`OUTPOST` across 16 files
- Files touched: main.ts, mcp-server.ts, errors.ts (OutpostErrorCode), tier-limits.ts, reddit.provider.ts, publish.service.ts, publish.dto.ts, accounts.service.ts, integrations.service.ts, webhooks.controller.ts, webhooks.service.ts, README.md, docker-compose.yml, .env, .env.example, instagram.provider.spec.ts
- AGENT_LOG.md intentionally left (historical record — prior name is context, not product copy)
- TSC: 0 errors ✅
**Commit:** 38ef5b0
**Branch:** dev

---

## 2026-03-25 (Smithery prep)

### Task: smithery.yaml + npm publish prep for outpost-mcp
**Triggered by:** Scout intel — Smithery registry listing is Day 1 priority

**Completed:**
- `smithery.yaml` created in `~/Documents/Dev/outpost-mcp` — stdio configSchema with `apiKey` (required) + `apiUrl` (optional, for self-hosted), commandFunction maps to env vars
- README: npm badge updated from `outpost-mcp` → `@outpost/mcp-server` (scoped package name)
- README: npx commands updated from `outpost-mcp` → `@outpost/mcp-server`
- index.js: usage comment updated to match
- Committed + pushed to `github.com/andrezani/outpost-mcp` (main branch)
  **Commit:** 719387a

**Still blocked on Andrea:**
- npm publish (`npm login` + `npm publish --access public` on `@outpost/mcp-server`)
- GitHub repo for main Outpost backend (`gh repo create andrezani/outpost --public`)
- `outpost.dev` domain registration
- Smithery listing itself requires the GitHub repo to be public (auto-detects from repo URL)

**What happens once GitHub is public:**
- Scout coordinates awesome-mcp-servers PR
- glama.ai auto-indexes from npm once package is published
- Smithery: submit at smithery.ai/new — points to github.com/andrezani/outpost-mcp

---

## 2026-03-25 19:00 — Rex (Proactive Session)

**Triggered by:** Scout intel — Official MCP Registry (modelcontextprotocol.io) is now live, backed by Anthropic + GitHub + Microsoft. Zero social media servers listed. First-mover = category ownership.

**Completed:**
- `packages/mcp/` — standalone npm package extracted from NestJS monolith
  - `@outpost/mcp-server` v0.1.0
  - `mcpName: io.github.andrezani/outpost` (MCP Registry namespace for GitHub auth)
  - Default BASE_URL: `https://api.outpost.dev` (production)
  - `OUTPOST_BASE_URL` env override for self-hosted deployments
  - Shebang line for `npx` execution
  - Full README with Claude Desktop + Cursor config snippets
  - TSC: 0 errors ✅ | Build: clean ✅
- `server.json` — MCP Registry submission file (schema 2025-12-11)
  - stdio transport, `@outpost/mcp-server` package
  - Env vars: `OUTPOST_API_KEY` (required, secret), `OUTPOST_BASE_URL` (optional)
- `package.json` — added `mcpName` field (required by MCP Registry npm flow)
- **Commit: 191005d** — `feat(mcp): extract standalone @outpost/mcp-server npm package + MCP Registry server.json`
- Tests: **122/122 passing** ✅ | TSC: **0 errors** ✅

**Pending Andrea (launch day checklist):**
1. `npm publish --access public` inside `packages/mcp/` (needs npm login as andrezani/hibernyte)
2. `gh repo create andrezani/outpost --public` (make repo public)
3. `mcp-publisher publish` (the official MCP Registry CLI) — authenticates via GitHub
4. `outpost.dev` domain registration (also needed for DNS namespace verification)

**What the MCP Registry submission unlocks:**
- Auto-indexed by smithery.ai, glama.ai (they aggregate FROM official registry)
- GitHub Copilot and Claude discover servers via the official registry
- Zero social media competitors in the registry — we OWN this category on day 1
