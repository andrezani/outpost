# Outpost — glama.ai MCP Server Submission

> ⚡ PRIORITY: Submit immediately after Andrea creates the GitHub repo. Sociona is already listed — we need to be there FIRST as the definitive "social media MCP" server.

## Submission URL

https://glama.ai/mcp/servers/submit

---

## Submission Details

**Server name:** `outpost-mcp`

**Description (optimized for glama.ai search):**
> Social media API and MCP server for AI agents. Publish to X, Instagram, LinkedIn, Reddit, Bluesky, and Threads from a single endpoint.

**Full description:**
> Outpost is an agent-native social media publishing API with a built-in MCP server. Post to X (Twitter), Instagram, LinkedIn, Reddit, Bluesky, and Threads using a single `POST /api/v1/publish` endpoint. Every error response includes `code` + `agentHint` so your LLM knows exactly what to do next. Multi-tenant OAuth: each org connects their own accounts (not shared credentials). Supports Claude Desktop and Cursor natively via stdio MCP transport. Self-host with Docker in 5 commands.

**Tags:**
- social-media
- mcp
- multi-platform
- agents
- publish
- ai-agents
- oauth
- webhooks

**GitHub repo URL:** _(pending — Andrea to create)_

**npm package:** `@outpost/mcp-server` _(publish after GitHub repo is live)_

**MCP config snippet (for submission form):**
```json
{
  "mcpServers": {
    "outpost": {
      "command": "npx",
      "args": ["-y", "@outpost/mcp-server"],
      "env": {
        "OUTPOST_API_KEY": "sa_xxx",
        "OUTPOST_BASE_URL": "http://localhost:3000"
      }
    }
  }
}
```

---

## Competitor Intel

- **Sociona** (`fav-devs/sociona-mcp-server`) — already listed on glama.ai
- We need to be listed as the FIRST and definitive social media MCP server
- Our differentiators vs Sociona:
  - `agentHint` on every error response (they likely don't have this)
  - Multi-tenant OAuth — each org's own credentials, not shared
  - 6 platforms in one API (unified `POST /api/v1/publish`)
  - Built-in MCP server (not bolt-on)
  - Webhooks with HMAC-SHA256 signing
  - Platform capability discovery (`GET /api/v1/platforms`)
  - Stripe billing + tier system (Pro/Team/Founding)

---

## Action Checklist (Rex tracks this)

- [ ] Andrea creates GitHub repo (public)
- [ ] Rex publishes `@outpost/mcp-server` to npm
- [ ] Submit to glama.ai at URL above
- [ ] Submit to Smithery (smithery.ai/submit)
- [ ] Submit to mcp.so
- [ ] Add to awesome-mcp-servers GitHub list
- [ ] Stella posts launch announcement on X/LinkedIn/Reddit r/MachineLearning

---

## Notes

- Submission was prepared 2026-03-25 by Rex (CTO)
- Beat Sociona to the listing — this is a first-mover SEO play
- glama.ai search uses description + tags heavily — both are optimized
- The "6 platforms" and "agentHint" angles are our strongest differentiators
