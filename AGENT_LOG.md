# AGENT_LOG.md — SocialAgent

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
