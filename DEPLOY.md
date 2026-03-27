# 🚀 DEPLOY.md — Outpost on Railway

**Goal:** API → Railway | Landing → Vercel  
**Status:** Code is deployed. Container will self-heal the moment Postgres + Redis are provisioned.

---

## ⚡ 5-Minute Fix — Provision Postgres + Redis in Railway Dashboard

> The container is crash-looping because `DATABASE_URL` isn't set yet.  
> Add the two database plugins → Railway auto-injects the URLs → container restarts and boots cleanly.

### Step 1 — Add PostgreSQL (2 min)

1. Go to [railway.com](https://railway.com) → open the **Outpost** project
2. Click **+ New** (top right of the project canvas)
3. Choose **Database → PostgreSQL**
4. Railway creates the Postgres service and **auto-injects `DATABASE_URL`** into your app service
5. ✅ Done — no manual URL copying needed

### Step 2 — Add Redis (2 min)

1. In the same project, click **+ New** again
2. Choose **Database → Redis**
3. Railway creates Redis and **auto-injects `REDIS_URL`** into your app service
4. ✅ Done

### Step 3 — Verify env vars (1 min)

1. Click on your **outpost** service (the API container)
2. Go to **Variables** tab
3. Confirm you see `DATABASE_URL` and `REDIS_URL` — both auto-populated by Railway
4. Also check `NODE_ENV=production` is set (add it if missing)

### Step 4 — Container self-heals 🎉

Railway automatically triggers a redeploy when new env vars are added.  
The container will:
1. Run `prisma migrate deploy` (applies schema to the fresh Postgres DB)
2. Boot the NestJS API
3. Pass the healthcheck on `/api/v1/health`

**Watch it in:** Railway project → **Deployments** tab → click the latest deployment → view live logs.

### Step 5 — Seed admin org + get your API key

```bash
# Run from the outpost repo dir
railway run npm run seed:admin
```

Output:
```
✅ Org created: Hibernyte (id: xxx)
✅ API Key: sa_xxx
✅ Tier: free (100 posts/mo)
```

**Save that API key** — it's your master key for the MCP server and dashboard.

---

## ✅ Verify It's Live

```bash
curl https://outpost-production-b1b8.up.railway.app/api/v1/health
# Expected: {"status":"ok","timestamp":"..."}
```

Swagger UI: `https://outpost-production-b1b8.up.railway.app/api`

---

## 📋 Additional Env Vars (set after databases are up)

### 🟡 REQUIRED for OAuth (connect social accounts)

| Variable | Where to get it |
|---|---|
| `X_CLIENT_ID` | developer.twitter.com → Your App → Keys |
| `X_CLIENT_SECRET` | developer.twitter.com → Your App → Keys |
| `REDDIT_CLIENT_ID` | reddit.com/prefs/apps → your app |
| `REDDIT_CLIENT_SECRET` | reddit.com/prefs/apps → your app |
| `INSTAGRAM_CLIENT_ID` | Meta Developer Console → App ID |
| `INSTAGRAM_CLIENT_SECRET` | Meta Developer Console → App Secret |
| `THREADS_CLIENT_ID` | Same Meta app ID as Instagram |
| `THREADS_CLIENT_SECRET` | Same Meta app secret as Instagram |
| `LINKEDIN_CLIENT_ID` | linkedin.com/developers/apps |
| `LINKEDIN_CLIENT_SECRET` | linkedin.com/developers/apps |
| `BLUESKY_APP_PASSWORD` | bsky.app → Settings → App Passwords |

### ⚪ OPTIONAL (safe to skip for first deploy)

| Variable | Notes |
|---|---|
| `CORS_ORIGIN` | Default `*` is fine for staging |
| `RESEND_API_KEY` | Email; silently skipped if not set |
| `EMAIL_FROM` | ⚠️ DO NOT use custom domain until verified in Resend. `onboarding@resend.dev` works immediately. |
| `SCHEDULER_INTERVAL_MS` | Default 60000ms (60s) |
| `STRIPE_SECRET_KEY` | Skip — billing returns 400 with clear message if not set |
| `STRIPE_WEBHOOK_SECRET` | Skip for now |
| `STRIPE_PRO_PRICE_ID` | Skip for now |
| `STRIPE_TEAM_PRICE_ID` | Skip for now |
| `STRIPE_FOUNDING_PRICE_ID` | Skip for now |
| `STRIPE_PORTAL_ENABLED` | Skip for now |
| `OUTPOST_BASE_URL` | Only needed for standalone MCP server mode |

---

## 🔁 Redeploy from Local (when needed)

```bash
cd ~/Documents/Dev/outpost
railway up
```

---

## 🏗️ Architecture Notes

- **Dockerfile:** Multi-stage (builder → production), non-root user, `prisma migrate deploy` runs at startup
- **railway.toml:** Healthcheck on `/api/v1/health`, `restartPolicyType: ON_FAILURE`, 10 max retries, 300s timeout
- **Prisma:** v5.22.0, `binaryTargets: ["native", "linux-musl-openssl-3.0.x"]` (Alpine + OpenSSL 3)
- **Migrations:** `prisma/migrations/0_init/` — schema is tracked, `migrate deploy` applies it idempotently
- **PORT:** Railway auto-injects `$PORT` — app reads it correctly
- **No domain required for staging** — Railway + Vercel give free subdomains

---

## 🆘 Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Container crash-loops immediately | `DATABASE_URL` not set | Add Postgres plugin in Railway dashboard |
| `prisma migrate deploy` fails | Can't reach Postgres | Check that Postgres service is in the same Railway project |
| 404 on all routes | Container not started / wrong URL | Check Railway Deployments tab → view logs |
| Waitlist POST returns error | API down or `DATABASE_URL` missing | Fix DB first, then retry |
| `seed:admin` fails | Migrations not applied | Run `railway run npx prisma migrate deploy` manually first |
