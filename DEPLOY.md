# Deploy (Coolify on the VPS)

The production API is self-hosted on the OVH VPS under [Coolify](https://coolify.io).

| | URL |
|---|---|
| API base | https://outpost.hibernyte.com/api/v1 |
| Health | https://outpost.hibernyte.com/api/v1/health |
| Swagger UI | https://outpost.hibernyte.com/api |

Box-level runbook (VPS, Coolify, databases, DNS): private repo `andrezani/VPS` →
[`stacks/outpost/README.md`](https://github.com/andrezani/VPS/blob/main/stacks/outpost/README.md).

## How deploys happen

- Coolify builds the root `Dockerfile` from the **`main`** branch and auto-deploys on every push to `main`.
- Day-to-day work lands on `dev` (the default branch). To ship, merge `dev` into `main` (PR or fast-forward). Anything that reaches `main` goes live.
- On boot the container runs `prisma migrate deploy`, then starts the API. Migrations are applied automatically on every deploy; a failing migration makes the container crash-loop (check the deployment logs in Coolify).
- Verify after a deploy:

  ```bash
  curl https://outpost.hibernyte.com/api/v1/health
  # {"status":"ok","timestamp":"..."}
  ```

## Where config lives

- **Env vars:** Coolify → Outpost application → Environment Variables. Never commit secrets to this repo. Changing an env var requires a redeploy in Coolify.
  - Set: `DATABASE_URL`, `REDIS_URL`, `NODE_ENV=production`, `PORT=3000`, `CORS_ORIGIN=*`, `OUTPOST_BASE_URL=https://outpost.hibernyte.com`, `JWT_SECRET`, `STRIPE_*`.
  - Not set yet: `ADMIN_API_KEY` (`/api/v1/admin/*` returns 503 "Admin API not configured" until it is), and the social OAuth client IDs/secrets (`X_*`, `LINKEDIN_*`, `REDDIT_*`, `INSTAGRAM_*`, `THREADS_*`). See [`OAUTH_STATUS.md`](./OAUTH_STATUS.md). The full list of variables is in [`.env.example`](./.env.example).
- **Postgres 16 and Redis 7:** Coolify-managed resources on the internal Docker network only, with random passwords. They are not exposed to the internet. Connection strings live in Coolify.

## Rollback

In Coolify → Outpost application → Deployments, redeploy a previous commit. Then revert the bad change on `main` as well, otherwise the next push to `main` ships it again.

Prisma migrations are **not** rolled back by a redeploy. If the bad deploy included a migration, the database keeps the newer schema, so fix forward or write the down-migration by hand.

## `docker-compose.yml` is for local development only

It publishes Postgres on host port `5432` with the password `outpost`, and Redis on `6379` with no password. **Never run it on a server:** ports published by Docker bypass the host firewall (e.g. `ufw`), so this would put the database on the internet. Production uses the Coolify-managed databases above.

## History

The API was previously deployed on Railway (`outpost-production-b1b8.up.railway.app`). That deployment had been failing since 2026-03-27 and the Railway project is being deleted. `railway.toml` was removed because nothing reads it any more.
