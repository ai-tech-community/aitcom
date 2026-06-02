# Runtime DB driver is neon-serverless (WebSocket), not neon-http

**Status:** accepted

The application's runtime Drizzle query layer (`src/server/db/index.ts`)
connects through **`drizzle-orm/neon-serverless`** — the `@neondatabase/serverless`
WebSocket `Pool` — rather than `drizzle-orm/neon-http`. The driver still talks to
Neon's serverless endpoint in production; only the wire protocol changes from
single-shot HTTP to a pooled WebSocket connection.

The `neon-http` driver is deliberately limited: its `transaction()` method
throws `"No transactions support in neon-http driver"` unconditionally,
client-side, before any network call. That is fine for one-shot queries but
incompatible with the interactive `db.transaction(async (tx) => …)` callbacks
this codebase already relies on — community ownership transfer
(`communities.ts`), the audited investigation writes (`recorded-write.ts`), and
the seed scripts. Under `neon-http` those paths throw in **production**, not just
locally. `neon-serverless` supports interactive transactions, so it both removes
that latent production failure and lets the Dockerised local environment
(see [`docker-compose.yml`](../../docker-compose.yml)) run the **same driver as
production**, with full parity, through a local `wsproxy` container.

This is safe here specifically because **nothing on the Edge runtime touches the
database**: `src/middleware.ts` does only i18n routing and a cookie check, and the
only `runtime = "edge"` route (the OG image) imports no DB code. The usual reason
to prefer `neon-http` — it works in Edge where a WebSocket `Pool` does not — does
not apply.

**Why:** The instinct is to keep `neon-http` because it is the lightest Neon
driver for serverless single queries and was already wired in. But the codebase
had outgrown it: real, user-reachable flows need atomic multi-statement writes,
and on `neon-http` those flows are broken in production. Reaching for a Docker
setup forced the question into the open — any local Postgres has to satisfy the
same transaction semantics as prod, or local would mask (or invent) behaviour.
Standardising on `neon-serverless` everywhere is the only option that fixes the
production bug, keeps a single driver across dev and prod, and unblocks local
seeding — at the cost of one extra runtime dependency (`ws`, for a WebSocket
implementation on Node < 22) and a pooled-connection model on Vercel Fluid
Compute instead of per-query HTTP.

**Rejected alternatives:**

- **Keep `neon-http`; gate local dev to a transaction-capable driver.** Lets
  Docker ship without touching the production entry point, but leaves the
  production transaction bug live and bakes in a permanent "dev has transactions,
  prod does not" divergence — local would hide exactly the failures it should
  surface. Declined.
- **Swap to `node-postgres` (`pg`) locally only.** Same divergence problem, plus
  it abandons the Neon driver family that production deploys on. Declined.
- **A community HTTP proxy (`local-neon-http-proxy`) in front of `neon-http`.**
  The proxy cannot help: `neon-http` rejects interactive transactions client-side
  regardless of what is behind it. Declined.

**Consequences:**

- `src/server/db/index.ts` constructs a cached `Pool` and `drizzle-orm/neon-serverless`,
  sets `neonConfig.webSocketConstructor = ws`, and — only when `NEON_LOCAL_PROXY`
  is set — routes the WebSocket through the local `wsproxy` (`useSecureWebSocket`,
  `pipelineTLS`, `pipelineConnect` off). Production sets no such flag and is
  unchanged in behaviour.
- `ws` is a runtime dependency. Importing it in `db/index.ts` is safe because the
  module is never pulled into an Edge bundle (no Edge code imports the DB).
- The standalone `seed-ait-community.ts` no longer builds its own `neon-http`
  connection; it uses the shared `neon-serverless` `db` so its transaction runs.
- Local development uses Neon's official `wsproxy` image to tunnel
  Postgres-over-WebSocket to a plain `postgres` container; the same `DATABASE_URL`
  serves Payload (`pg`) and `drizzle-kit` directly and the runtime driver via the
  proxy.
- A production deploy must be verified after this change (connection pooling
  under Fluid Compute, transaction-bearing flows).
