# Outpost — Landing Page

Static landing page for [outpost.dev](https://outpost.dev).

## Stack
- Pure HTML/CSS/JS — no build step, no framework
- Stripe checkout links wired in `app.js`

## Hosting

Not hosted right now. If it ships, it goes on the Hibernyte VPS under Coolify, alongside the API. Nothing in this repo deploys it.

Preview locally with any static file server, e.g. `python3 -m http.server 8080`.

## Wiring Stripe

When Andrea creates the Stripe account + products, update `app.js`:

```js
const STRIPE_LINKS = {
  pro: 'https://buy.stripe.com/YOUR_PRO_LINK',
  team: 'https://buy.stripe.com/YOUR_TEAM_LINK',
  teamFounding: 'https://buy.stripe.com/YOUR_FOUNDING_LINK', // optional
};
```

## Domain & API

No marketing domain yet (`outpost.dev` / `outpostapi.dev` were the candidates).
`API_BASE` in `app.js` points at the production API, `https://outpost.hibernyte.com`.

## Founding Seat Counter

The `🔥 X/50 founding seats left` counter in Team pricing:
- Falls back to 50 seats until API is live
- Live endpoint: `GET /api/v1/public/founding-seats` → `{ remaining: number }`
- Rex: wire this endpoint in the Outpost API repo
