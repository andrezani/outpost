# Publishing @outpost/mcp-server to npm

## Status
- ✅ `package.json` name updated to `@outpost/mcp-server` (was `outpost-mcp`)
- ❌ npm not logged in on this machine — need `npm login` first

## What Andrea Needs to Do

### 1. Login to npm

```bash
cd ~/Documents/Dev/outpost-mcp
npm login
```

This opens a browser flow. You'll need:
- npm account username + password (or SSO if your org uses it)
- 2FA code if enabled

If you don't have an npm account, create one at https://www.npmjs.com/signup

### 2. Create the @outpost org on npm (if it doesn't exist)

The package uses the `@outpost` scope. You need to own this org on npm.

Check if it exists:
```
https://www.npmjs.com/org/outpost
```

If it doesn't exist:
```bash
npm org create outpost
```

Or go to: https://www.npmjs.com/org/create

### 3. Publish

```bash
cd ~/Documents/Dev/outpost-mcp
npm publish --access public
```

The `--access public` flag is required for scoped packages to be publicly installable.

### 4. Verify it's live

```bash
npm view @outpost/mcp-server
```

Or check: https://www.npmjs.com/package/@outpost/mcp-server

### 5. Test npx works

```bash
OUTPOST_API_KEY=test npx -y @outpost/mcp-server
```

Should print: `[outpost-mcp] Started. Waiting for requests on stdin.`
(then hang waiting for stdin — that's correct MCP server behaviour)

---

## What Was Fixed

- `package.json` name changed from `outpost-mcp` → `@outpost/mcp-server`
  - This matches what the landing page quickstart calls: `npx -y @outpost/mcp-server`
  - The old name `outpost-mcp` would have been a different package and broken the quickstart

## Notes

- No code changes needed — only the package name was wrong
- The `bin` entry stays as `outpost-mcp` so the binary name is still clean
- Version is `0.1.0` — good for initial publish
- glama.ai will pick it up automatically once it's live on npm
