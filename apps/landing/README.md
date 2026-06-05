# Outpost — Landing Page

Static landing page for [outpost.dev](https://outpost.dev).

## Stack
- Pure HTML/CSS/JS — no build step, no framework
- Deploys to Vercel (drag & drop or CLI)
- Stripe checkout links wired in `app.js`

## Deploy to Vercel

```bash
# Option 1: Vercel CLI
npm i -g vercel
vercel deploy

# Option 2: Drag the folder to vercel.com/new
```

## Wiring Stripe

When Andrea creates the Stripe account + products, update `app.js`:

```js
const STRIPE_LINKS = {
  pro: 'https://buy.stripe.com/YOUR_PRO_LINK',
  team: 'https://buy.stripe.com/YOUR_TEAM_LINK',
  teamFounding: 'https://buy.stripe.com/YOUR_FOUNDING_LINK', // optional
};
```

## Domain

Waiting on Andrea to register `outpost.dev` (or `outpostapi.dev`).
Set `API_BASE` in `app.js` once domain + API are live.

## Founding Seat Counter

The `🔥 X/50 founding seats left` counter in Team pricing:
- Falls back to 50 seats until API is live
- Live endpoint: `GET /api/v1/public/founding-seats` → `{ remaining: number }`
- Rex: wire this endpoint in the Outpost API repo
