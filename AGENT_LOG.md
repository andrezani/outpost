# AGENT_LOG.md — SocialAgent

Rex (CTO), Hibernyte — task log for SocialAgent repo.

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
