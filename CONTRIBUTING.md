# Contributing to Outpost

Thanks for your interest in contributing. Here's how to get started.

## Setup

```bash
git clone https://github.com/andrezani/outpost
cd outpost
npm install
cp .env.example .env
docker compose up -d
npx prisma migrate dev
npm run start:dev
```

## Ground Rules

- **0 TypeScript errors** before any PR — run `npx tsc --noEmit`
- **All tests pass** — run `npm test`
- **Branch from `dev`** — never commit directly to `main`
- **Commit format:** `type(scope): description` (feat, fix, chore, docs, test)

## Pull Requests

1. Fork the repo and create a branch from `dev`
2. Make your changes — include tests for new functionality
3. Run `npx tsc --noEmit && npm test` — both must pass
4. Open a PR against the `dev` branch with a clear description

## Adding a Platform Provider

Each provider lives in `src/providers/`. See `x.provider.ts` as the reference implementation:

1. Create `src/providers/<platform>.provider.ts` extending `SocialProvider`
2. Implement all abstract methods: `publish`, `buildAuthUrl`, `exchangeCodeForToken`, `refreshToken`, `getProfile`, `validateToken`, `deletePost`
3. Register it in `src/providers/provider.registry.ts`
4. Add the platform to the `SocialPlatform` Prisma enum and run `npx prisma generate`
5. Add test skeletons in `src/providers/__tests__/<platform>.provider.spec.ts`

## Reporting Issues

Open an issue with:
- What you expected to happen
- What actually happened
- OS, Node version, and platform (X, Instagram, etc.)
- Minimal reproduction steps
