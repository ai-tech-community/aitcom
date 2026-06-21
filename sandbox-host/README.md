# aitcom MCP-UI sandbox host

A **standalone, separate-origin** Vercel project whose only job is to serve the
MCP-Apps sandbox proxy for the chat interactive-message feature (Slice 1,
Phase 5), with a per-request, tamper-proof Content-Security-Policy header.

## Why a separate project?

The sandbox proxy must live on a **different origin** from the main app so an
untrusted UI producer's iframe cannot reach the app's cookies / localStorage —
isolation comes from the separate origin, which is why the inner iframe can
safely keep `allow-same-origin` (the MCP Apps proxy protocol requires it). See
`docs/superpowers/specs/2026-06-20-realtime-chat-design.md`.

## Contents

- `api/proxy.js` — a Vercel function that serves the sandbox proxy HTML **and**
  sets a `Content-Security-Policy` **header** built from the `?csp=` query param
  (set by `@mcp-ui/client` `AppFrame`). A header is mandatory: a `<meta>` CSP on
  the doc.write'd View is bypassable (the guest can `document.write` a fresh,
  CSP-less document), whereas a header is bound to the response and inherited by
  the inner `about:blank` iframe. The relay implements the MCP Apps proxy
  protocol (spec `2026-01-26`, `modelcontextprotocol/ext-apps`): the
  `sandbox-proxy-ready` → `sandbox-resource-ready{html}` handshake that
  `@mcp-ui/client` (currently **7.1.1**) drives. `buildCspHeader` /
  `sanitizeCspDomains` mirror `ext-apps examples/basic-host/serve.ts`.
  **Trust gating happens in the host app** (`src/components/inbox/ui-message.tsx`
  only forwards declared domains for trust tiers that earn them), so the `?csp=`
  that arrives here is already filtered; absent/empty → restrictive default.
  Add the production app origin to `ALLOWED_HOST_ORIGIN` before shipping.
- `vercel.json` — no framework, no build (just the function).

The main repo's `public/sandbox_proxy.html` is the dev-only, same-origin
fallback (no CSP header). Keep its relay script in sync with the one inlined in
`api/proxy.js` when either changes.

## Deploy

```bash
cd sandbox-host
vercel --yes            # links/creates the project (preview)
vercel deploy --prod    # promote to a stable production URL
```

Then point the **main app** at the function endpoint:

```
NEXT_PUBLIC_CHAT_SANDBOX_URL=https://<this-project>.vercel.app/api/proxy
NEXT_PUBLIC_FEATURE_CHAT_UI=true
```

## Verify the CSP header

```bash
# unverified/untrusted (no ?csp) → restrictive default
curl -sI 'https://<this-project>.vercel.app/api/proxy' | grep -i content-security-policy
# verified producer forwarding a domain → honored
curl -sI 'https://<this-project>.vercel.app/api/proxy?csp=%7B%22connectDomains%22%3A%5B%22api.example.com%22%5D%7D' | grep -i content-security-policy
```
