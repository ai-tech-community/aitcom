# aitcom MCP-UI sandbox host

A **standalone, separate-origin** static deploy whose *only* job is to serve
`sandbox_proxy.html` for the chat MCP-Apps interactive-message feature
(Slice 1, Phase 5).

## Why a separate project?

The sandbox proxy must live on a **different origin** from the main app so an
untrusted UI producer's iframe (`allow-scripts`, no `allow-same-origin`) cannot
reach the app's cookies / localStorage. The copy in the main repo's
`public/sandbox_proxy.html` is the **dev-only, same-origin fallback** — it does
not provide real isolation. See `docs/superpowers/specs/2026-06-20-realtime-chat-design.md`.

## Contents

- `sandbox_proxy.html` — a dependency-free port of the **official MCP Apps
  sandbox proxy** (spec `2026-01-26`, `modelcontextprotocol/ext-apps`,
  `examples/basic-host/src/sandbox.ts`). It implements the
  `ui/notifications/sandbox-proxy-ready` → `ui/notifications/sandbox-resource-ready`
  handshake that `@mcp-ui/client` (currently **7.1.1**) `AppFrame` drives.
  **Must stay byte-identical to the main repo's `public/sandbox_proxy.html`.**
  When bumping `@mcp-ui/client`/`@modelcontextprotocol/ext-apps`, re-check the
  handshake against the matching spec/reference and re-run the E2E.
  Add the production app origin to `ALLOWED_HOST_ORIGIN` before shipping.
- `vercel.json` — static-only config (no framework, no build).

## Deploy

This directory is its own Vercel project (deploy with this dir as the root):

```bash
cd sandbox-host
vercel --yes            # first run links/creates the project (preview)
vercel deploy --prod    # promote to a stable production URL
```

Then point the **main app** at the deployed origin:

```
NEXT_PUBLIC_CHAT_SANDBOX_URL=https://<this-project>.vercel.app/sandbox_proxy.html
NEXT_PUBLIC_FEATURE_CHAT_UI=true
```

## Keeping the two copies in sync

```bash
# from repo root — verify the host copy matches the vendored fallback
shasum public/sandbox_proxy.html sandbox-host/sandbox_proxy.html
```
