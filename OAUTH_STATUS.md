# OAUTH_STATUS.md — Outpost OAuth Diagnostic
*Written by Rex (CTO) — 2026-03-27*

## TL;DR

**ALL OAuth providers are broken in production.** The architecture is complete and correct — but every provider needs its credentials set as Railway environment variables. Currently the `.env` file only contains `DATABASE_URL`, `REDIS_URL`, `INNGEST_*`, `PORT`, `NODE_ENV`. Zero OAuth keys.

---

## What Happens Today

When a user tries to connect a social account via `POST /api/v1/accounts/connect/:platform`:
1. The API calls `ProviderRegistry.getProvider(platform)`
2. `getProvider` calls `config.getOrThrow('X_CLIENT_ID')` etc.
3. **CRASH** — `getOrThrow` throws because the env var is not set
4. User gets a 500 Internal Server Error

No OAuth flow ever starts. The user can't connect any platform.

---

## Platform-by-Platform Status

### 🔴 X (Twitter) — BROKEN
**Root cause:** `X_CLIENT_ID` and `X_CLIENT_SECRET` not set in Railway env vars.

**What's needed:**
1. Go to https://developer.twitter.com/en/apps
2. Create an OAuth 2.0 app (or use existing)
3. Enable **OAuth 2.0** + **Read and Write** + **Offline Access** permissions
4. Add callback URL: `https://outpost-production-b1b8.up.railway.app/api/v1/accounts/connect/x/callback`
5. Copy **Client ID** and **Client Secret**
6. Set in Railway: `X_CLIENT_ID=...` `X_CLIENT_SECRET=...`

**Note:** X uses PKCE flow — code verifier is generated server-side. No additional setup needed once credentials are in.

**Twitter app permission required:** `tweet.read tweet.write users.read offline.access`

---

### 🔴 LinkedIn — BROKEN
**Root cause:** `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` not set.

**What's needed:**
1. Go to https://www.linkedin.com/developers/apps
2. Create app / use existing
3. Under **Auth** tab, add redirect URL: `https://outpost-production-b1b8.up.railway.app/api/v1/accounts/connect/linkedin/callback`
4. **Required OAuth 2.0 scopes:** `w_member_social`, `r_liteprofile`, `r_emailaddress`
   - ⚠️ These require LinkedIn app review for 3rd-party apps — apply at https://www.linkedin.com/developers/apps/{app_id}/products
5. Set in Railway: `LINKEDIN_CLIENT_ID=...` `LINKEDIN_CLIENT_SECRET=...`

**Scope note:** `w_member_social` (posting) requires **Marketing Developer Platform** product approval from LinkedIn. This takes a few days. Until approved, posting will fail with 403 even with valid credentials.

---

### 🔴 Reddit — BROKEN
**Root cause:** `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` not set.

**What's needed:**
1. Go to https://www.reddit.com/prefs/apps
2. Create app — type: **"web app"** (NOT script, NOT installed)
3. Redirect URI: `https://outpost-production-b1b8.up.railway.app/api/v1/accounts/connect/reddit/callback`
4. Copy the client ID (under app name) and secret
5. Set in Railway: `REDDIT_CLIENT_ID=...` `REDDIT_CLIENT_SECRET=...`

**Required scopes:** `submit identity read` (already hardcoded in accounts.service.ts line 384)

**Note:** Reddit OAuth is straightforward — no app review required. This is the easiest one to get working.

---

### 🔴 Instagram — BROKEN
**Root cause:** `INSTAGRAM_CLIENT_ID` and `INSTAGRAM_CLIENT_SECRET` not set.

**What's needed:**
1. Go to https://developers.facebook.com/apps
2. Create a Meta app → add **Instagram Graph API** product
3. ⚠️ **Business requirement:** Instagram posting requires a **professional/creator account** linked to a Facebook Page
4. Add redirect URI: `https://outpost-production-b1b8.up.railway.app/api/v1/accounts/connect/instagram/callback`
5. Set in Railway: `INSTAGRAM_CLIENT_ID=...` `INSTAGRAM_CLIENT_SECRET=...`

**This is the hardest one** — Meta requires app review for `instagram_content_publish` permission (used for publishing). Without review, only the test users you add manually can connect. App review can take weeks.

---

### 🔴 Threads — BROKEN
**Root cause:** `THREADS_CLIENT_ID` and `THREADS_CLIENT_SECRET` not set.

**What's needed:** Same Meta app as Instagram — Threads uses the Threads API (separate from Instagram Graph API but same Meta app).
- Add **Threads API** product to the same Meta app
- Add redirect URI for Threads too
- Set: `THREADS_CLIENT_ID=...` `THREADS_CLIENT_SECRET=...`

---

### 🟡 Bluesky — PARTIALLY WORKS (architecture only)
Bluesky uses app passwords, not OAuth client credentials. The code is correct — no env vars needed for the OAuth init step. However, users connect via `POST /api/v1/accounts/connect/bluesky` with their handle + app password directly. **This should work once the DB is up.** No action needed from Andrea.

---

## Priority Order for Andrea

To unblock launch content (fastest → hardest):

| Priority | Platform | Effort | Blocker |
|----------|----------|--------|---------|
| 1️⃣ | Reddit | 5 min | Just create web app, no review |
| 2️⃣ | X/Twitter | 15 min | Need Twitter dev account + callback setup |
| 3️⃣ | LinkedIn | 30 min + days | Needs Marketing Dev Platform approval |
| 4️⃣ | Instagram | Days–weeks | Meta app review required |
| 5️⃣ | Threads | With Instagram | Same Meta app |

---

## What Works RIGHT NOW (no OAuth needed)

- `POST /api/v1/auth/register` → get API key ✅ (once DB is up)
- `POST /api/v1/accounts/connect/bluesky` → connect via app password ✅
- `POST /api/v1/publish` with a connected Bluesky account → publish ✅
- All admin endpoints ✅
- MCP server (stdio) ✅

---

## Env Vars to Add in Railway

```
X_CLIENT_ID=
X_CLIENT_SECRET=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
INSTAGRAM_CLIENT_ID=
INSTAGRAM_CLIENT_SECRET=
THREADS_CLIENT_ID=
THREADS_CLIENT_SECRET=
LINKEDIN_CLIENT_ID=
LINKEDIN_CLIENT_SECRET=
```

Set these in Railway dashboard → outpost service → Variables tab.

---

## Architecture Assessment

The OAuth implementation is **correct and complete**. The provider registry, PKCE flow, state management, callback handling — all solid. This is purely a missing configuration issue. Once Andrea adds the env vars, OAuth will work for X and Reddit immediately. LinkedIn + Instagram need app approvals.

*— Rex*
