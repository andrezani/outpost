# 🚀 DEPLOY.md — Outpost Staging (copy-paste line by line)

**Goal:** API → Railway | Landing → Vercel  
**Prereqs:** Railway CLI v4.35.0 ✅ | Vercel CLI ✅ | `cd ~/Documents/Dev/Outpost` to start

---

## Step 1 — Railway login (browser popup, ~60s)

```bash
railway login
```

## Step 2 — Create Railway project + deploy API

```bash
railway init
railway up
```

> After `railway up` completes, Railway gives you a URL like `https://outpost-api-production-xxxx.up.railway.app`.  
> **Copy it** — you'll need it for env vars and for the landing page CTA.

## Step 3 — Set env vars in Railway dashboard

Go to your Railway project → **Variables** tab. Add these:

### 🔴 REQUIRED (app won't start without these)

| Variable | Value |
|---|---|
| `DATABASE_URL` | Railway auto-injects this if you add a Postgres plugin — click **+ New → Database → PostgreSQL** |
| `REDIS_URL` | Railway auto-injects this if you add a Redis plugin — click **+ New → Database → Redis** |
| `NODE_ENV` | `production` |

> ⚡ Add Postgres + Redis from the Railway dashboard first. They inject `DATABASE_URL` and `REDIS_URL` automatically.

### 🟡 REQUIRED for OAuth to work (needed before connecting social accounts)

| Variable | Notes |
|---|---|
| `X_CLIENT_ID` | From developer.twitter.com |
| `X_CLIENT_SECRET` | From developer.twitter.com |
| `REDDIT_CLIENT_ID` | From reddit.com/prefs/apps |
| `REDDIT_CLIENT_SECRET` | From reddit.com/prefs/apps |
| `INSTAGRAM_CLIENT_ID` | Meta app ID |
| `INSTAGRAM_CLIENT_SECRET` | Meta app secret |
| `THREADS_CLIENT_ID` | Same Meta app ID as Instagram |
| `THREADS_CLIENT_SECRET` | Same Meta app secret as Instagram |
| `LINKEDIN_CLIENT_ID` | From linkedin.com/developers/apps |
| `LINKEDIN_CLIENT_SECRET` | From linkedin.com/developers/apps |

### ⚪ OPTIONAL (safe to skip for first deploy)

| Variable | Notes |
|---|---|
| `CORS_ORIGIN` | Default `*` is fine for staging |
| `RESEND_API_KEY` | Skip — email is silently skipped if not set |
| `EMAIL_FROM` | Skip with Resend |
| `SCHEDULER_INTERVAL_MS` | Default 60000ms (60s) — fine |
| `STRIPE_SECRET_KEY` | Skip — billing returns 400 with clear message if not set |
| `STRIPE_WEBHOOK_SECRET` | Skip for now |
| `STRIPE_PRO_PRICE_ID` | Skip for now |
| `STRIPE_TEAM_PRICE_ID` | Skip for now |
| `STRIPE_FOUNDING_PRICE_ID` | Skip for now |
| `STRIPE_PORTAL_ENABLED` | Skip for now |
| `OUTPOST_BASE_URL` | Only needed for standalone MCP server mode |

---

## Step 4 — Seed the admin org + get your API key

```bash
railway run npm run seed:admin
```

> This prints your org ID + API key (`sa_xxx`). **Save the API key** — it's your master key.

## Step 5 — Deploy OutpostLanding to Vercel

```bash
cd ~/Documents/Dev/OutpostLanding
vercel login
vercel --prod
```

---

## ✅ Verify It's Live

```bash
curl https://<your-railway-url>.up.railway.app/api/v1/health
# Expected: {"status":"ok","timestamp":"..."}
```

Swagger UI: `https://<your-railway-url>.up.railway.app/api`

---

## 📋 Notes

- Dockerfile: multi-stage (builder → production), non-root user, prisma migrate runs at startup ✅
- railway.toml: healthcheck on `/api/v1/health`, restart on failure ✅
- OutpostLanding vercel.json: cleanUrls, security headers ✅
- PORT: Railway auto-injects `$PORT` — app reads it correctly ✅
- No domain required for staging — Railway + Vercel give free subdomains ✅
