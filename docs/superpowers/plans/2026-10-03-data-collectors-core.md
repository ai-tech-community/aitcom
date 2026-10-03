# Data Collectors — Slice 1: Core Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data-collector engine end to end without UI: tables, the collector Strategy interface, the protection Proxy that owns every network safety rule, the `feed-items` collector, quota, a lease-based worker, CSV/JSON export, and the `CollectorRuns` facade — all behind `FEATURE_COLLECTORS`.

**Architecture:** A run is a stored Command (`app.collector_run`) claimed by a worker route with a lease (`FOR UPDATE SKIP LOCKED`). The executor (Strategy *Context*) resolves a collector from a typed catalog, gives it only `input` and a `CollectorContext` (protection Proxy: blocklist → robots.txt → budget → shared per-site rate limit → `safeFetch`, with per-hop redirect checks and 429/503 back-off), consumes rows through an async iterator, validates and stores them in batches. `CollectorRuns` is the single Facade later used by tRPC (slice 2) and MCP (slice 4).

**Tech Stack:** Next.js 15 route handlers, Drizzle ORM (neon-serverless) on Postgres `app` schema, hand-written Payload migrations, Zod 4, Upstash Redis, Vitest, `fast-xml-parser`, `robots-parser`.

**Spec:** `docs/superpowers/specs/2026-10-03-data-collectors-design.md` (and `docs/adr/0040-data-collectors-are-built-in-strategies-run-from-a-queued-command.md`). Read both before Task 1.

## Global Constraints

- Branch: `feat/data-collectors-core`, created from `origin/main` **after** PR #418 (spec) is merged. Every commit step starts with `git branch --show-current` and must print `feat/data-collectors-core`. Never run `git checkout`/`git switch` inside a task.
- Stage files by name. Never `git add -A`, `git add .`, or `git stash`. No `Co-Authored-By` or AI-credit lines in commits or the PR.
- Code word is `collector`, never `scrape`/`scraper`. User-facing name: "data collector".
- Collectors (`src/server/collectors/collectors/**`, `src/server/collectors/helpers/**`) never import the database, `@/env`, or `@/server/net/*`, and never use global `fetch` or `process` (enforced by ESLint in Task 4).
- User agent: `aitcom-collector/1.0 (+https://aitcommunity.org/collectors/about)`; robots.txt token: `aitcom-collector`.
- Limits (constants, exact values): body cap 5 MB per response; robots.txt cap 500 KB; request timeout 30 s; per-site rate 1 request/second shared across all runs; 3rd consecutive 429/503 on a host stops the run; max 5 redirects; tick budget 240 000 ms; lease 5 min; max 2 attempts; max 5 000 rows per run; flush every 100 rows; log keeps last 50 lines of ≤ 300 chars; quota 20 runs / rolling 24 h per user, 2 active per user, 10 active platform-wide; retention 30 days.
- Feature flag: `FEATURE_COLLECTORS` = `on` | `off` (server env, default off). Per-collector disable: `COLLECTORS_DISABLED` (comma/space-separated ids).
- Migrations are hand-written Payload migrations in `src/migrations/` registered in `src/migrations/index.ts`, plus matching Drizzle definitions in `src/server/db/schema.ts`. Never `db:push` against `.env` (that is production). Never run `pnpm build` locally.
- Unit test command prefix: `SKIP_ENV_VALIDATION=1 pnpm vitest run`.
- **DB test prefix** (use exactly; never host port 5432):
  `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test`
  One-time setup if `aitcom_test` does not exist: `pnpm dev:db`; `docker run -d --rm --name aitcom-test-pg-forward --network aitcom_default -p 127.0.0.1:55432:5432 alpine/socat tcp-listen:5432,fork,reuseaddr tcp:postgres:5432`; `docker exec aitcom-postgres-1 createdb -U postgres aitcom_test`; then `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test SKIP_ENV_VALIDATION=1 pnpm exec drizzle-kit push --force`. Never set `PAYLOAD_PUSH` for test runs. A DB suite that reports *skipped* is a failure of setup — fix the env, do not continue.
- The public `/collectors/about` page moved to slice 2 (with the other screens and the visual review). The flag stays off until slice 2 ships, so no collector contacts a site before that page exists.

## Review Focus

1. **A page redirects from an allowed site to an opted-out site or a robots-disallowed path** → the run stops with `blocked_domain` / `robots_disallowed`; the target is never requested. Test owned by Task 5.
2. **A "feed" declares DOCTYPE entities (entity-expansion bomb)** → rejected quickly as "not an RSS or Atom feed", no CPU/memory blow-up. Test owned by Task 4.
3. **The same member (or member + their agent) starts runs at the same instant at the active limit** → never more than 2 active runs; the extra request gets a quota refusal. Test owned by Task 9.
4. **`CRON_SECRET` is unset in an environment** → the worker route refuses every caller (today's cron routes would accept `Bearer undefined`). Test owned by Task 10.
5. **The worker dies mid-run and the run is re-claimed** → rows from the first attempt are removed, the dataset has no duplicates, and a third claim ends the run as `worker_lost`. Tests owned by Task 7.

---

## File map

| File | Responsibility |
|---|---|
| `src/server/net/safe-fetch.ts` (modify) | add `accept`, `allowErrorStatus`, `signal`, `redirects` options |
| `src/server/collectors/run-status.ts` | `RunStatus`, `StopReason`, transition table, `assertTransition` |
| `src/server/collectors/errors.ts` | `CollectorStop`, `userMessageFor` |
| `src/server/collectors/collector.ts` | `Collector` (Strategy) and `CollectorContext` (Proxy interface) types |
| `src/server/collectors/db.ts` | `CollectorDb` type (db or transaction) |
| `src/server/db/schema.ts` (modify) | `collectorRuns`, `collectorItems`, `collectorBlockedDomains` |
| `src/migrations/20261003a_collector_runs.ts` + `index.ts` (modify) | DDL |
| `src/env.js`, `.env.example` (modify) | `FEATURE_COLLECTORS`, `COLLECTORS_DISABLED` |
| `src/server/collectors/flags.ts` | read the two env values |
| `src/server/collectors/helpers/feed.ts` | RSS/Atom parsing, `plainText` |
| `src/server/collectors/collectors/feed-items.ts` | the `feed-items` collector |
| `src/server/collectors/catalog.ts` | typed catalog (Strategy *Client*), `columnsOf` |
| `src/server/collectors/testing/fake-context.ts` | test double for collectors |
| `eslint.config.js` (modify) | collector boundary rules |
| `src/server/collectors/context/blocklist.ts` | opted-out domains |
| `src/server/collectors/context/robots.ts` | robots.txt check, cached per origin per run |
| `src/server/collectors/context/site-rate-limit.ts` | shared per-site limiter, Redis or memory slot store, `abortableSleep` |
| `src/server/collectors/context/collector-context.ts` | the Proxy |
| `src/server/collectors/context/live.ts` | live transport, robots fetch, Redis store, `buildLiveContext` |
| `src/server/collectors/quota.ts` | `canStartRun` |
| `src/server/collectors/executor.ts` | claim, execute, worker tick |
| `src/server/collectors/export/formats.ts` | CSV and JSON formatters (Strategy) |
| `src/server/collectors/runs.ts` | `CollectorRuns` facade |
| `src/server/collectors/kick.ts` | best-effort worker kick |
| `src/server/collectors/live.ts` | composition root (live facade + executor deps) |
| `src/app/api/cron/collector-worker/route.ts` + `vercel.json` (modify) | worker entry points |
| `src/server/collectors/collectors.integration.test.ts` | all DB tests that claim or count runs (one file → sequential, no cross-file races) |

---

### Task 1: Extend `safeFetch` with opt-in options

**Files:**
- Modify: `src/server/net/safe-fetch.ts`
- Create: `src/server/net/safe-fetch.test.ts`

**Interfaces:**
- Produces: `SafeFetchOptions` gains `accept?: string`, `allowErrorStatus?: boolean`, `signal?: AbortSignal`, `redirects?: "follow" | "return"`. Defaults keep today's behaviour for `fetch-link-preview.ts`, `feed-images.ts`, `import-from-url.ts`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/server/net/safe-fetch.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/agent/validate-webhook-url", () => ({
  validateWebhookUrl: vi.fn(),
}));

import { validateWebhookUrl } from "@/server/agent/validate-webhook-url";
import { safeFetch } from "./safe-fetch";

const guard = vi.mocked(validateWebhookUrl);
const base = { userAgent: "test-agent/1.0", timeoutMs: 5_000 };

function headersOf(mock: ReturnType<typeof vi.fn>, call = 0) {
  return mock.mock.calls[call]?.[1]?.headers as Record<string, string>;
}

beforeEach(() => {
  vi.clearAllMocks();
  guard.mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("safeFetch", () => {
  it("keeps the HTML Accept header by default", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await safeFetch("https://example.com/", base);
    expect(headersOf(fetchMock).accept).toMatch(/^text\/html/);
  });

  it("sends a caller-supplied Accept header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    await safeFetch("https://example.com/feed", {
      ...base,
      accept: "application/rss+xml",
    });
    expect(headersOf(fetchMock).accept).toBe("application/rss+xml");
  });

  it("throws on an error status by default", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("no", { status: 404 })),
    );
    await expect(safeFetch("https://example.com/", base)).rejects.toThrow(
      "Request failed with status 404",
    );
  });

  it("returns an error status when allowErrorStatus is set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("slow down", { status: 429 })),
    );
    const { response } = await safeFetch("https://example.com/", {
      ...base,
      allowErrorStatus: true,
    });
    expect(response.status).toBe(429);
  });

  it("returns a redirect to the caller when redirects is 'return'", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://other.example/next" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { response, url } = await safeFetch("https://example.com/a", {
      ...base,
      redirects: "return",
    });
    expect(response.status).toBe(302);
    expect(url).toBe("https://example.com/a");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("still validates every redirect hop when following", async () => {
    guard
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, reason: "private address" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, {
          status: 302,
          headers: { location: "http://10.0.0.1/" },
        }),
      ),
    );
    await expect(safeFetch("https://example.com/", base)).rejects.toThrow(
      "Refusing to fetch URL: private address",
    );
  });

  it("stops when the caller's signal aborts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(init.signal?.reason),
            );
          }),
      ),
    );
    const controller = new AbortController();
    const pending = safeFetch("https://example.com/", {
      ...base,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toBeDefined();
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/net/safe-fetch.test.ts`
Expected: FAIL — "sends a caller-supplied Accept header", "returns an error status…", "returns a redirect…" and "stops when the caller's signal aborts" fail; the two default-behaviour tests pass.

- [ ] **Step 3: Implement**

In `src/server/net/safe-fetch.ts`, replace the options interface and the body of `safeFetch` (keep `readBodyCapped` and the doc comment's residual-risk paragraph unchanged):

```ts
const MAX_REDIRECTS = 5;
const DEFAULT_ACCEPT =
  "text/html,application/xhtml+xml,image/*;q=0.9,*/*;q=0.5";

export interface SafeFetchOptions {
  /** Honest identification of the feature making the request. */
  userAgent: string;
  /** Budget for the whole request: every redirect hop and the body read. */
  timeoutMs: number;
  /** Overrides the default Accept header (HTML and images). */
  accept?: string;
  /** Return non-2xx answers to the caller instead of throwing. */
  allowErrorStatus?: boolean;
  /** Aborts the request early, in addition to `timeoutMs`. */
  signal?: AbortSignal;
  /**
   * "follow" (default) follows up to 5 redirects, validating each hop.
   * "return" hands the first 3xx back so the caller can apply its own
   * per-hop rules (the data-collector context does this).
   */
  redirects?: "follow" | "return";
}
```

```ts
export async function safeFetch(
  url: string,
  options: SafeFetchOptions,
): Promise<SafeResponse> {
  const timeout = AbortSignal.timeout(options.timeoutMs);
  const signal = options.signal
    ? AbortSignal.any([timeout, options.signal])
    : timeout;
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const guard = await validateWebhookUrl(current);
    if (!guard.ok) {
      throw new Error(`Refusing to fetch URL: ${guard.reason}`);
    }
    const res = await fetch(current, {
      signal,
      redirect: "manual",
      headers: {
        "user-agent": options.userAgent,
        accept: options.accept ?? DEFAULT_ACCEPT,
      },
    });
    if (res.status >= 300 && res.status < 400) {
      if (options.redirects === "return") {
        return { response: res, url: current };
      }
      const location = res.headers.get("location");
      if (!location) {
        throw new Error(`Redirect with no Location (status ${res.status})`);
      }
      current = new URL(location, current).href;
      continue;
    }
    if (!res.ok && !options.allowErrorStatus) {
      throw new Error(`Request failed with status ${res.status}`);
    }
    return { response: res, url: current };
  }
  throw new Error("Too many redirects");
}
```

- [ ] **Step 4: Run the new tests and every existing caller's tests**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/net src/server/link-preview src/server/communities/feed-images src/server/events/import-from-url`
Expected: PASS, no skipped suites besides DB-gated ones.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/data-collectors-core
git add src/server/net/safe-fetch.ts src/server/net/safe-fetch.test.ts
git commit -m "safeFetch: opt-in Accept, error-status, signal and redirect-return options"
```

---

### Task 2: Run lifecycle, stop reasons, and the collector types

**Files:**
- Create: `src/server/collectors/run-status.ts`, `src/server/collectors/errors.ts`, `src/server/collectors/collector.ts`
- Test: `src/server/collectors/run-status.test.ts`, `src/server/collectors/errors.test.ts`

**Interfaces:**
- Produces:
  - `type RunStatus = "queued" | "running" | "succeeded" | "failed"`
  - `type StopReason = "complete" | "page_limit" | "item_limit" | "time_limit" | "site_refused" | "robots_disallowed" | "blocked_domain" | "error" | "worker_lost"`
  - `canTransition(from: RunStatus, to: RunStatus): boolean`, `assertTransition(from, to): void`
  - `class CollectorStop extends Error { reason: StopReason; outcome: "succeeded" | "failed" }`
  - `userMessageFor(err: unknown): string`
  - `Collector<I, R>`, `AnyCollector`, `CollectorContext`, `CollectorResponse`, `LocalizedText`, `FieldHint`, `CollectorLimits`

- [ ] **Step 1: Write the failing tests**

```ts
// src/server/collectors/run-status.test.ts
import { describe, expect, it } from "vitest";
import { assertTransition, canTransition } from "./run-status";

describe("run lifecycle", () => {
  it.each([
    ["queued", "running"],
    ["running", "running"],
    ["running", "succeeded"],
    ["running", "failed"],
  ] as const)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each([
    ["queued", "succeeded"],
    ["queued", "failed"],
    ["succeeded", "running"],
    ["failed", "running"],
    ["succeeded", "failed"],
  ] as const)("refuses %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
    expect(() => assertTransition(from, to)).toThrow(
      `Illegal collector run transition ${from} → ${to}`,
    );
  });
});
```

```ts
// src/server/collectors/errors.test.ts
import { describe, expect, it } from "vitest";
import { CollectorStop, userMessageFor } from "./errors";

describe("userMessageFor", () => {
  it("uses a CollectorStop's own message", () => {
    const stop = new CollectorStop("robots_disallowed", "failed", "Not allowed.");
    expect(userMessageFor(stop)).toBe("Not allowed.");
  });

  it.each([
    [Object.assign(new Error("x"), { name: "TimeoutError" }), "A site took too long to answer."],
    [Object.assign(new Error("x"), { name: "AbortError" }), "A site took too long to answer."],
    [new Error("Refusing to fetch URL: private address"), "This address cannot be reached from our servers."],
    [new Error("Response too large"), "A page was larger than the 5 MB limit."],
    [new Error("Too many redirects"), "A page redirected too many times."],
  ])("maps known errors to plain words", (err, message) => {
    expect(userMessageFor(err)).toBe(message);
  });

  it("never leaks an unknown error's text", () => {
    expect(userMessageFor(new Error("ECONNRESET at 10.0.0.3:5432"))).toBe(
      "Something went wrong while collecting. Try again later.",
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/collectors/run-status.test.ts src/server/collectors/errors.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

```ts
// src/server/collectors/run-status.ts
/**
 * Collector run lifecycle (spec: "Run lifecycle"). Four states and few
 * transitions, so a table and one guard — the State pattern would be
 * overkill here. `running → running` is a re-claim after an expired lease.
 */
export type RunStatus = "queued" | "running" | "succeeded" | "failed";

/** Why a run ended, shown to the member in plain words. */
export type StopReason =
  | "complete"
  | "page_limit"
  | "item_limit"
  | "time_limit"
  | "site_refused"
  | "robots_disallowed"
  | "blocked_domain"
  | "error"
  | "worker_lost";

const ALLOWED: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["running"],
  running: ["running", "succeeded", "failed"],
  succeeded: [],
  failed: [],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return ALLOWED[from].includes(to);
}

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal collector run transition ${from} → ${to}`);
  }
}
```

```ts
// src/server/collectors/errors.ts
import type { StopReason } from "./run-status";

/**
 * Ends a run on purpose: a budget, a site rule, or a collector-detected
 * problem. `outcome: "succeeded"` means the rows so far are a valid partial
 * result (a limit was reached); `"failed"` means the member must act.
 * `message` is shown to the member, so it must be plain and safe.
 */
export class CollectorStop extends Error {
  constructor(
    readonly reason: StopReason,
    readonly outcome: "succeeded" | "failed",
    message: string,
  ) {
    super(message);
    this.name = "CollectorStop";
  }
}

/** A message safe to show a member; raw errors go to the server log only. */
export function userMessageFor(err: unknown): string {
  if (err instanceof CollectorStop) return err.message;
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") {
      return "A site took too long to answer.";
    }
    if (err.message.startsWith("Refusing to fetch URL")) {
      return "This address cannot be reached from our servers.";
    }
    if (err.message === "Response too large") {
      return "A page was larger than the 5 MB limit.";
    }
    if (err.message === "Too many redirects") {
      return "A page redirected too many times.";
    }
  }
  return "Something went wrong while collecting. Try again later.";
}
```

```ts
// src/server/collectors/collector.ts
import type { z } from "zod";

export type LocalizedText = { en: string; nl: string };

export type FieldHint = {
  label: LocalizedText;
  help?: LocalizedText;
  placeholder?: string;
};

export type CollectorLimits = {
  maxPages: number;
  maxItems: number;
  maxDurationMs: number;
};

export interface CollectorResponse {
  /** The URL that answered (after the context followed redirects). */
  url: string;
  status: number;
  headers: Headers;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

/**
 * The only door a collector has to the outside world (protection Proxy,
 * ADR-0040). Every rule — robots.txt, per-site rate limit, budgets,
 * blocklist, SSRF guard — lives behind `fetch`.
 */
export interface CollectorContext {
  fetch(url: string, opts?: { accept?: string }): Promise<CollectorResponse>;
  /** A short line the member sees on the run page. */
  log(message: string): void;
  /** Aborts when the run's time budget ends. */
  signal: AbortSignal;
}

/**
 * A data collector (Strategy). Receives only its validated input and the
 * context; yields rows one at a time (Iterator), hiding pagination.
 */
export interface Collector<I, R extends Record<string, unknown>> {
  id: string;
  version: number;
  /** Marketplace seam: widened to a member reference later. */
  author: "platform";
  kind: "api" | "feed" | "page";
  title: LocalizedText;
  description: LocalizedText;
  inputSchema: z.ZodType<I>;
  itemSchema: z.ZodType<R>;
  fieldHints: { [K in keyof I]-?: FieldHint };
  sampleItem: R;
  limits: CollectorLimits;
  run(input: I, ctx: CollectorContext): AsyncIterable<R>;
}

// `run` takes I contravariantly, so a catalog of mixed collectors needs `any`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyCollector = Collector<any, any>;
```

- [ ] **Step 4: Run tests and typecheck**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/collectors && pnpm typecheck`
Expected: PASS; no type errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/data-collectors-core
git add src/server/collectors/run-status.ts src/server/collectors/run-status.test.ts src/server/collectors/errors.ts src/server/collectors/errors.test.ts src/server/collectors/collector.ts
git commit -m "Collectors: run lifecycle, stop reasons, and the collector interface"
```

---

### Task 3: Tables, migration, and feature flags

**Files:**
- Modify: `src/server/db/schema.ts` (append after `memberAwards` block), `src/migrations/index.ts`, `src/env.js`, `.env.example`
- Create: `src/migrations/20261003a_collector_runs.ts`, `src/migrations/collector-runs.integration.test.ts`, `src/server/collectors/db.ts`, `src/server/collectors/flags.ts`

**Interfaces:**
- Consumes: `RunStatus`, `StopReason` (Task 2).
- Produces: Drizzle tables `collectorRuns`, `collectorItems`, `collectorBlockedDomains`; `type CollectorDb`; `collectorsEnabled(): boolean`; `disabledCollectorIds(): ReadonlySet<string>`.

Before starting: `git fetch origin && ls src/migrations | tail -3` on `origin/main`. If a `20261003a_*` migration already exists, use the next free letter and rename everywhere below.

- [ ] **Step 1: Write the failing migration test**

```ts
// src/migrations/collector-runs.integration.test.ts
// @vitest-environment node
// DB integration for migration 20261003a, called like the deploy runner
// (`{ db }` only) and twice, since a failed deploy re-runs it.
// Auto-skips unless RUN_DB_TESTS=1 and a local database is configured.
import type { sql as Sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type { up as Up } from "./20261003a_collector_runs";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}

describe.skipIf(!isLocalDbConfigured())(
  "migration 20261003a collector runs [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let up: typeof Up;

    beforeAll(async () => {
      const [dbMod, drizzle, migration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261003a_collector_runs"),
      ]);
      db = dbMod.db;
      sql = drizzle.sql;
      up = migration.up;
    }, 120_000);

    it("creates the three collector tables and can run again", async () => {
      await up({ db } as never);
      await up({ db } as never);

      const result = await db.execute(sql`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name IN ('collector_run', 'collector_item', 'collector_blocked_domain')
      `);
      const rows = ((result as { rows?: unknown }).rows ?? result) as {
        table_name: string;
        column_name: string;
      }[];
      const have = new Set(rows.map((r) => `${r.table_name}.${r.column_name}`));
      for (const col of [
        "collector_run.id",
        "collector_run.user_id",
        "collector_run.agent_id",
        "collector_run.origin",
        "collector_run.collector_id",
        "collector_run.collector_version",
        "collector_run.input",
        "collector_run.status",
        "collector_run.stop_reason",
        "collector_run.attempts",
        "collector_run.lease_until",
        "collector_run.pages_fetched",
        "collector_run.bytes_fetched",
        "collector_run.item_count",
        "collector_run.invalid_item_count",
        "collector_run.duration_ms",
        "collector_run.error",
        "collector_run.log",
        "collector_run.created_at",
        "collector_run.started_at",
        "collector_run.finished_at",
        "collector_run.expires_at",
        "collector_item.run_id",
        "collector_item.seq",
        "collector_item.data",
        "collector_blocked_domain.domain",
        "collector_blocked_domain.reason",
        "collector_blocked_domain.created_at",
      ]) {
        expect(have.has(col), col).toBe(true);
      }
    });

    it("guards origin and status with CHECK constraints", async () => {
      const result = await db.execute(sql`
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'app.collector_run'::regclass AND contype = 'c'
      `);
      const rows = ((result as { rows?: unknown }).rows ?? result) as {
        conname: string;
      }[];
      expect(rows.map((r) => r.conname).sort()).toEqual([
        "collector_run_origin_chk",
        "collector_run_status_chk",
      ]);
    });
  },
);
```

- [ ] **Step 2: Run to verify failure**

Run: `<DB test prefix> pnpm vitest run src/migrations/collector-runs.integration.test.ts`
Expected: FAIL — cannot import `./20261003a_collector_runs`. If the suite is *skipped*, fix the DB env first.

- [ ] **Step 3: Write the migration, register it, add Drizzle tables**

```ts
// src/migrations/20261003a_collector_runs.ts
// Data collectors (ADR-0040). Additive:
//
// - app.collector_run: one queued/running/finished run (the stored Command),
//   with metering counters and a worker lease.
// - app.collector_item: the run's rows, ordered by seq; removed with the run.
// - app.collector_blocked_domain: sites that opted out; blocks subdomains.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "app"."collector_run" (
      "id" varchar(255) PRIMARY KEY NOT NULL,
      "user_id" varchar(255) NOT NULL
        REFERENCES "app"."user"("id") ON DELETE CASCADE,
      "agent_id" varchar(255),
      "origin" varchar(16) NOT NULL,
      "collector_id" varchar(64) NOT NULL,
      "collector_version" integer NOT NULL,
      "input" jsonb NOT NULL,
      "status" varchar(16) NOT NULL,
      "stop_reason" varchar(32),
      "attempts" integer DEFAULT 0 NOT NULL,
      "lease_until" timestamp with time zone,
      "pages_fetched" integer DEFAULT 0 NOT NULL,
      "bytes_fetched" bigint DEFAULT 0 NOT NULL,
      "item_count" integer DEFAULT 0 NOT NULL,
      "invalid_item_count" integer DEFAULT 0 NOT NULL,
      "duration_ms" integer,
      "error" varchar(500),
      "log" jsonb DEFAULT '[]'::jsonb NOT NULL,
      "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      "started_at" timestamp with time zone,
      "finished_at" timestamp with time zone,
      "expires_at" timestamp with time zone NOT NULL,
      CONSTRAINT "collector_run_origin_chk"
        CHECK ("origin" IN ('web', 'mcp')),
      CONSTRAINT "collector_run_status_chk"
        CHECK ("status" IN ('queued', 'running', 'succeeded', 'failed'))
    );
    CREATE INDEX IF NOT EXISTS "collector_run_user_created_idx"
      ON "app"."collector_run" USING btree ("user_id", "created_at" DESC);
    CREATE INDEX IF NOT EXISTS "collector_run_status_created_idx"
      ON "app"."collector_run" USING btree ("status", "created_at");
    CREATE INDEX IF NOT EXISTS "collector_run_expires_idx"
      ON "app"."collector_run" USING btree ("expires_at");

    CREATE TABLE IF NOT EXISTS "app"."collector_item" (
      "run_id" varchar(255) NOT NULL
        REFERENCES "app"."collector_run"("id") ON DELETE CASCADE,
      "seq" integer NOT NULL,
      "data" jsonb NOT NULL,
      CONSTRAINT "collector_item_run_id_seq_pk" PRIMARY KEY ("run_id", "seq")
    );

    CREATE TABLE IF NOT EXISTS "app"."collector_blocked_domain" (
      "domain" varchar(255) PRIMARY KEY NOT NULL,
      "reason" varchar(200) NOT NULL,
      "created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."collector_item";
    DROP TABLE IF EXISTS "app"."collector_run";
    DROP TABLE IF EXISTS "app"."collector_blocked_domain";
  `);
}
```

In `src/migrations/index.ts` add the import after the `20261002c` import and the entry at the end of the array:

```ts
import * as migration_20261003a_collector_runs from "./20261003a_collector_runs";
```

```ts
  {
    up: migration_20261003a_collector_runs.up,
    down: migration_20261003a_collector_runs.down,
    name: "20261003a_collector_runs",
  },
```

Append to `src/server/db/schema.ts` after the `memberAwards` table (add `import type { RunStatus, StopReason } from "../collectors/run-status";` next to the existing `../communities/rituals` type import):

```ts
// Data collectors (ADR-0040). Migration 20261003a.
export const collectorRuns = appSchema.table(
  "collector_run",
  (d) => ({
    id: d
      .varchar({ length: 255 })
      .notNull()
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    agentId: d.varchar({ length: 255 }),
    origin: d.varchar({ length: 16 }).notNull().$type<"web" | "mcp">(),
    collectorId: d.varchar({ length: 64 }).notNull(),
    collectorVersion: d.integer().notNull(),
    input: d.jsonb().notNull().$type<unknown>(),
    status: d.varchar({ length: 16 }).notNull().$type<RunStatus>(),
    stopReason: d.varchar({ length: 32 }).$type<StopReason>(),
    attempts: d.integer().notNull().default(0),
    leaseUntil: d.timestamp({ withTimezone: true }),
    pagesFetched: d.integer().notNull().default(0),
    bytesFetched: d.bigint({ mode: "number" }).notNull().default(0),
    itemCount: d.integer().notNull().default(0),
    invalidItemCount: d.integer().notNull().default(0),
    durationMs: d.integer(),
    error: d.varchar({ length: 500 }),
    log: d
      .jsonb()
      .notNull()
      .$type<string[]>()
      .default(sql`'[]'::jsonb`),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    startedAt: d.timestamp({ withTimezone: true }),
    finishedAt: d.timestamp({ withTimezone: true }),
    expiresAt: d.timestamp({ withTimezone: true }).notNull(),
  }),
  (t) => [
    index("collector_run_user_created_idx").on(t.userId, t.createdAt.desc()),
    index("collector_run_status_created_idx").on(t.status, t.createdAt),
    index("collector_run_expires_idx").on(t.expiresAt),
    check("collector_run_origin_chk", sql`${t.origin} IN ('web', 'mcp')`),
    check(
      "collector_run_status_chk",
      sql`${t.status} IN ('queued', 'running', 'succeeded', 'failed')`,
    ),
  ],
);

export const collectorItems = appSchema.table(
  "collector_item",
  (d) => ({
    runId: d
      .varchar({ length: 255 })
      .notNull()
      .references(() => collectorRuns.id, { onDelete: "cascade" }),
    seq: d.integer().notNull(),
    data: d.jsonb().notNull().$type<Record<string, unknown>>(),
  }),
  (t) => [
    primaryKey({
      name: "collector_item_run_id_seq_pk",
      columns: [t.runId, t.seq],
    }),
  ],
);

export const collectorBlockedDomains = appSchema.table(
  "collector_blocked_domain",
  (d) => ({
    domain: d.varchar({ length: 255 }).notNull().primaryKey(),
    reason: d.varchar({ length: 200 }).notNull(),
    createdAt: d
      .timestamp({ withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  }),
);
```

```ts
// src/server/collectors/db.ts
import type { db as appDb } from "@/server/db";

type Tx = Parameters<Parameters<(typeof appDb)["transaction"]>[0]>[0];

/** The app database or an open transaction on it. */
export type CollectorDb = typeof appDb | Tx;
```

In `src/env.js` add to `server` (after `CLASSROOM_FILE_UPLOADS`):

```js
    // "on" turns on data collectors (ADR-0040). Off by default.
    FEATURE_COLLECTORS: z.enum(["on", "off"]).optional(),
    // Comma/space-separated collector ids to switch off without a code change.
    COLLECTORS_DISABLED: z.string().optional(),
```

and to `runtimeEnv` (after `CLASSROOM_FILE_UPLOADS`):

```js
    FEATURE_COLLECTORS: process.env.FEATURE_COLLECTORS,
    COLLECTORS_DISABLED: process.env.COLLECTORS_DISABLED,
```

Append to `.env.example`:

```
# Data collectors (ADR-0040): "on" lets members run built-in collectors.
# Leave empty (off) until the feature ships.
FEATURE_COLLECTORS=
# Collector ids to switch off, comma-separated (e.g. "feed-items").
COLLECTORS_DISABLED=
```

```ts
// src/server/collectors/flags.ts
import { env } from "@/env";

/** The deployment switch for data collectors (`FEATURE_COLLECTORS=on`). */
export function collectorsEnabled(): boolean {
  return env.FEATURE_COLLECTORS === "on";
}

/** Collector ids switched off by `COLLECTORS_DISABLED`. */
export function disabledCollectorIds(): ReadonlySet<string> {
  return new Set(
    (env.COLLECTORS_DISABLED ?? "").split(/[\s,]+/).filter(Boolean),
  );
}
```

- [ ] **Step 4: Run the migration test, then push the schema to the test DB**

Run: `<DB test prefix> pnpm vitest run src/migrations/collector-runs.integration.test.ts`
Expected: PASS (2 tests executed, not skipped).

Then make the Drizzle schema available to later DB tests:
`DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test SKIP_ENV_VALIDATION=1 pnpm exec drizzle-kit push --force`
Expected: no changes reported for the three tables (the migration already created them identically). If drizzle-kit wants to alter a collector table, the Drizzle definition and the SQL differ — fix the definition to match the SQL, then re-run.

- [ ] **Step 5: Typecheck, run the migration-runner contract test, commit**

Run: `pnpm typecheck && SKIP_ENV_VALIDATION=1 pnpm vitest run src/migrations/migration-runner-contract.test.ts`
Expected: PASS.

```bash
git branch --show-current   # must print feat/data-collectors-core
git add src/migrations/20261003a_collector_runs.ts src/migrations/index.ts src/migrations/collector-runs.integration.test.ts src/server/db/schema.ts src/server/collectors/db.ts src/server/collectors/flags.ts src/env.js .env.example
git commit -m "Collectors: run, item and blocked-domain tables (migration) and feature flags"
```

---

### Task 4: Feed parser, the `feed-items` collector, the catalog, and the boundary lint rule

**Files:**
- Create: `src/server/collectors/helpers/feed.ts`, `src/server/collectors/collectors/feed-items.ts`, `src/server/collectors/catalog.ts`, `src/server/collectors/testing/fake-context.ts`
- Modify: `eslint.config.js`, `package.json` (dependency)
- Test: `src/server/collectors/helpers/feed.test.ts`, `src/server/collectors/collectors/feed-items.test.ts`, `src/server/collectors/catalog.test.ts`

**Interfaces:**
- Consumes: `Collector`, `CollectorContext`, `AnyCollector` (Task 2), `CollectorStop` (Task 2).
- Produces:
  - `parseFeed(xml: string, baseUrl: string): FeedEntry[]`, `class NotAFeedError`, `plainText(html: string, max?: number): string`
  - `feedItems: Collector<{ url: string }, FeedEntry>` where `FeedEntry = { title: string; url: string | null; publishedAt: string | null; author: string | null; summary: string }`
  - `allCollectors(): readonly AnyCollector[]`, `getCollector(id: string, disabled?: ReadonlySet<string>): AnyCollector | undefined`, `columnsOf(c: AnyCollector): readonly string[] | null`
  - `fakeContext(pages)`, `collectAll(iterable)` (test helpers)

- [ ] **Step 1: Add the dependency**

Run: `pnpm add fast-xml-parser@^5.3.6`
Expected: `package.json` lists `fast-xml-parser` under `dependencies`.

- [ ] **Step 2: Write the failing tests**

```ts
// src/server/collectors/testing/fake-context.ts
import type { CollectorContext } from "../collector";

type FakePage = { status?: number; body: string; headers?: Record<string, string> };

/** A CollectorContext that serves canned pages and records every request. */
export function fakeContext(pages: Record<string, FakePage>) {
  const requests: { url: string; accept?: string }[] = [];
  const logs: string[] = [];
  const ctx: CollectorContext = {
    signal: new AbortController().signal,
    log: (message) => {
      logs.push(message);
    },
    async fetch(url, opts) {
      requests.push({ url, accept: opts?.accept });
      const page = pages[url];
      if (!page) throw new Error(`unexpected request ${url}`);
      return {
        url,
        status: page.status ?? 200,
        headers: new Headers(page.headers),
        text: async () => page.body,
        json: async () => JSON.parse(page.body) as unknown,
      };
    },
  };
  return { ctx, requests, logs };
}

export async function collectAll<R>(rows: AsyncIterable<R>): Promise<R[]> {
  const out: R[] = [];
  for await (const row of rows) out.push(row);
  return out;
}
```

```ts
// src/server/collectors/helpers/feed.test.ts
import { describe, expect, it } from "vitest";
import { NotAFeedError, parseFeed, plainText } from "./feed";

const RSS = `<?xml version="1.0"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>Example</title>
    <item>
      <title>First &amp; best</title>
      <link>/posts/1</link>
      <pubDate>Tue, 01 Sep 2026 10:00:00 GMT</pubDate>
      <dc:creator>Ada</dc:creator>
      <description><![CDATA[<p>Hello <b>world</b>&nbsp;today</p>]]></description>
    </item>
    <item>
      <title>Second</title>
      <link>https://example.com/posts/2</link>
      <pubDate>not a date</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Example</title>
  <entry>
    <title type="html">Atom &lt;i&gt;one&lt;/i&gt;</title>
    <link rel="self" href="https://example.com/self/1"/>
    <link rel="alternate" href="https://example.com/a/1"/>
    <updated>2026-09-02T08:00:00Z</updated>
    <author><name>Grace</name></author>
    <summary>Short summary</summary>
  </entry>
</feed>`;

describe("parseFeed", () => {
  it("reads RSS 2.0 items, resolving relative links and stripping HTML", () => {
    const entries = parseFeed(RSS, "https://example.com/feed.xml");
    expect(entries).toEqual([
      {
        title: "First & best",
        url: "https://example.com/posts/1",
        publishedAt: "2026-09-01T10:00:00.000Z",
        author: "Ada",
        summary: "Hello world today",
      },
      {
        title: "Second",
        url: "https://example.com/posts/2",
        publishedAt: null,
        author: null,
        summary: "",
      },
    ]);
  });

  it("reads Atom entries, preferring the alternate link", () => {
    expect(parseFeed(ATOM, "https://example.com/atom")).toEqual([
      {
        title: "Atom one",
        url: "https://example.com/a/1",
        publishedAt: "2026-09-02T08:00:00.000Z",
        author: "Grace",
        summary: "Short summary",
      },
    ]);
  });

  it("returns no entries for an empty channel", () => {
    expect(
      parseFeed("<rss><channel><title>x</title></channel></rss>", "https://e.com/"),
    ).toEqual([]);
  });

  it("rejects an HTML page", () => {
    expect(() =>
      parseFeed("<!doctype html><html><body>Hi</body></html>", "https://e.com/"),
    ).toThrow(NotAFeedError);
  });

  it("rejects declared entities before parsing (entity-expansion bomb)", () => {
    const bomb = `<?xml version="1.0"?>
<!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]>
<rss><channel><item><title>&lol2;</title></item></channel></rss>`;
    const started = Date.now();
    expect(() => parseFeed(bomb, "https://e.com/")).toThrow(NotAFeedError);
    expect(Date.now() - started).toBeLessThan(100);
  });

  it("drops non-web links", () => {
    const rss = `<rss><channel><item><title>x</title><link>javascript:alert(1)</link></item></channel></rss>`;
    expect(parseFeed(rss, "https://e.com/")[0]?.url).toBeNull();
  });
});

describe("plainText", () => {
  it("removes scripts and styles with their content", () => {
    expect(plainText("<style>p{}</style>a<script>x()</script> b")).toBe("a b");
  });

  it("truncates with an ellipsis", () => {
    expect(plainText("abcdef", 4)).toBe("abc…");
  });
});
```

```ts
// src/server/collectors/collectors/feed-items.test.ts
import { describe, expect, it } from "vitest";
import type { CollectorStop } from "../errors";
import { collectAll, fakeContext } from "../testing/fake-context";
import { feedItems } from "./feed-items";

const FEED = `<rss><channel>
  <item><title>One</title><link>https://e.com/1</link></item>
  <item><title>Two</title><link>https://e.com/2</link></item>
</channel></rss>`;

describe("feed-items collector", () => {
  it("asks for a feed and yields one row per item", async () => {
    const { ctx, requests, logs } = fakeContext({
      "https://e.com/feed": { body: FEED },
    });
    const rows = await collectAll(feedItems.run({ url: "https://e.com/feed" }, ctx));
    expect(rows.map((r) => r.title)).toEqual(["One", "Two"]);
    expect(requests).toEqual([
      { url: "https://e.com/feed", accept: expect.stringContaining("application/rss+xml") },
    ]);
    expect(logs).toEqual(["Found 2 items."]);
  });

  it("fails with a plain message when the address is not a feed", async () => {
    const { ctx } = fakeContext({ "https://e.com/": { body: "<html></html>" } });
    await expect(
      collectAll(feedItems.run({ url: "https://e.com/" }, ctx)),
    ).rejects.toMatchObject({
      reason: "error",
      outcome: "failed",
      message: "This address is not an RSS or Atom feed.",
    } satisfies Partial<CollectorStop>);
  });

  it("fails with the status when the feed does not answer 2xx", async () => {
    const { ctx } = fakeContext({ "https://e.com/feed": { status: 404, body: "" } });
    await expect(
      collectAll(feedItems.run({ url: "https://e.com/feed" }, ctx)),
    ).rejects.toThrow("The feed answered with status 404.");
  });

  it("accepts only http and https addresses as input", () => {
    expect(feedItems.inputSchema.safeParse({ url: "ftp://e.com/f" }).success).toBe(false);
    expect(feedItems.inputSchema.safeParse({ url: "https://e.com/f" }).success).toBe(true);
  });
});
```

```ts
// src/server/collectors/catalog.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { allCollectors, columnsOf, getCollector } from "./catalog";

describe("collector catalog", () => {
  const collectors = allCollectors();

  it("has unique kebab-case ids", () => {
    const ids = collectors.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it.each(allCollectors().map((c) => [c.id, c] as const))(
    "%s is complete and consistent",
    (_id, c) => {
      for (const text of [c.title, c.description]) {
        expect(text.en.trim()).not.toBe("");
        expect(text.nl.trim()).not.toBe("");
      }
      expect(c.inputSchema).toBeInstanceOf(z.ZodObject);
      expect(c.itemSchema).toBeInstanceOf(z.ZodObject);
      const inputKeys = Object.keys((c.inputSchema as z.ZodObject).shape).sort();
      expect(Object.keys(c.fieldHints).sort()).toEqual(inputKeys);
      for (const hint of Object.values(c.fieldHints)) {
        expect(hint.label.en.trim()).not.toBe("");
        expect(hint.label.nl.trim()).not.toBe("");
      }
      expect(c.itemSchema.safeParse(c.sampleItem).success).toBe(true);
      expect(() => z.toJSONSchema(c.inputSchema)).not.toThrow();
      expect(c.limits.maxPages).toBeGreaterThan(0);
      expect(c.limits.maxItems).toBeGreaterThan(0);
      expect(c.limits.maxItems).toBeLessThanOrEqual(5_000);
      expect(c.limits.maxDurationMs).toBeLessThanOrEqual(240_000);
      expect(columnsOf(c)).toEqual(Object.keys(c.sampleItem));
    },
  );

  it("hides a switched-off collector", () => {
    expect(getCollector("feed-items")?.id).toBe("feed-items");
    expect(getCollector("feed-items", new Set(["feed-items"]))).toBeUndefined();
    expect(getCollector("nope")).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/collectors`
Expected: FAIL — `./feed`, `./feed-items`, `./catalog` not found.

- [ ] **Step 4: Implement**

```ts
// src/server/collectors/helpers/feed.ts
import { XMLParser } from "fast-xml-parser";

export type FeedEntry = {
  title: string;
  url: string | null;
  publishedAt: string | null;
  author: string | null;
  summary: string;
};

export class NotAFeedError extends Error {
  constructor() {
    super("Not an RSS or Atom feed");
    this.name = "NotAFeedError";
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  parseTagValue: false,
  processEntities: true,
  htmlEntities: false,
  isArray: (name) => ["item", "entry", "link", "author"].includes(name),
});

type Node = Record<string, unknown>;

/** Parse RSS 2.0 or Atom into entries. Throws NotAFeedError otherwise. */
export function parseFeed(xml: string, baseUrl: string): FeedEntry[] {
  // Declared entities can expand exponentially; real feeds never need them.
  if (/<!ENTITY/i.test(xml)) throw new NotAFeedError();
  let doc: Node;
  try {
    doc = parser.parse(xml) as Node;
  } catch {
    throw new NotAFeedError();
  }
  const rss = asNode(doc.rss);
  const channel = rss ? asNode(rss.channel) : null;
  if (channel) return asArray(channel.item).map((i) => rssEntry(asNode(i) ?? {}, baseUrl));
  const feed = asNode(doc.feed);
  if (feed) return asArray(feed.entry).map((e) => atomEntry(asNode(e) ?? {}, baseUrl));
  throw new NotAFeedError();
}

function rssEntry(item: Node, baseUrl: string): FeedEntry {
  return {
    title: plainText(text(item.title) ?? "", 500),
    url: webUrl(text(item.link), baseUrl),
    publishedAt: isoDate(text(item.pubDate) ?? text(item["dc:date"])),
    author: text(item["dc:creator"]) ?? text(item.author),
    summary: plainText(text(item.description) ?? text(item["content:encoded"]) ?? ""),
  };
}

function atomEntry(entry: Node, baseUrl: string): FeedEntry {
  const links = asArray(entry.link).map((l) => asNode(l) ?? {});
  const link =
    links.find((l) => l["@_rel"] === "alternate") ??
    links.find((l) => l["@_rel"] === undefined);
  const author = asNode(asArray(entry.author)[0]);
  return {
    title: plainText(text(entry.title) ?? "", 500),
    url: webUrl(typeof link?.["@_href"] === "string" ? link["@_href"] : null, baseUrl),
    publishedAt: isoDate(text(entry.published) ?? text(entry.updated)),
    author: author ? text(author.name) : null,
    summary: plainText(text(entry.summary) ?? text(entry.content) ?? ""),
  };
}

function asNode(v: unknown): Node | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Node) : null;
}

function asArray(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

function text(v: unknown): string | null {
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "string") return v.trim() || null;
  const node = asNode(v);
  if (node && "#text" in node) return text(node["#text"]);
  return null;
}

function webUrl(raw: string | null, baseUrl: string): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function isoDate(raw: string | null): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** HTML → one line of plain text, capped at `max` characters. */
export function plainText(html: string, max = 1_000): string {
  const stripped = html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        return String.fromCodePoint(parseInt(entity.slice(2), 16));
      }
      if (entity.startsWith("#")) {
        return String.fromCodePoint(parseInt(entity.slice(1), 10));
      }
      return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    });
  const collapsed = stripped.replace(/\s+/g, " ").trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}
```

```ts
// src/server/collectors/collectors/feed-items.ts
import { z } from "zod";

import type { Collector } from "../collector";
import { CollectorStop } from "../errors";
import { type FeedEntry, NotAFeedError, parseFeed } from "../helpers/feed";

const FEED_ACCEPT =
  "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.5";

const inputSchema = z.object({
  url: z.url({ protocol: /^https?$/ }).max(2_048),
});

const itemSchema = z.object({
  title: z.string(),
  url: z.string().nullable(),
  publishedAt: z.string().nullable(),
  author: z.string().nullable(),
  summary: z.string(),
});

export const feedItems: Collector<z.infer<typeof inputSchema>, FeedEntry> = {
  id: "feed-items",
  version: 1,
  author: "platform",
  kind: "feed",
  title: { en: "Feed items", nl: "Feeditems" },
  description: {
    en: "The latest items of an RSS or Atom feed: title, link, date, author and a short summary.",
    nl: "De nieuwste items van een RSS- of Atom-feed: titel, link, datum, auteur en een korte samenvatting.",
  },
  inputSchema,
  itemSchema,
  fieldHints: {
    url: {
      label: { en: "Feed address", nl: "Feedadres" },
      help: {
        en: "The web address of the RSS or Atom feed.",
        nl: "Het webadres van de RSS- of Atom-feed.",
      },
      placeholder: "https://example.com/feed.xml",
    },
  },
  sampleItem: {
    title: "Release notes for March",
    url: "https://example.com/blog/march",
    publishedAt: "2026-03-01T09:00:00.000Z",
    author: "Example Team",
    summary: "What changed this month.",
  },
  limits: { maxPages: 1, maxItems: 1_000, maxDurationMs: 60_000 },
  async *run(input, ctx) {
    const res = await ctx.fetch(input.url, { accept: FEED_ACCEPT });
    if (res.status < 200 || res.status >= 300) {
      throw new CollectorStop(
        "error",
        "failed",
        `The feed answered with status ${res.status}.`,
      );
    }
    let entries: FeedEntry[];
    try {
      entries = parseFeed(await res.text(), res.url);
    } catch (err) {
      if (err instanceof NotAFeedError) {
        throw new CollectorStop(
          "error",
          "failed",
          "This address is not an RSS or Atom feed.",
        );
      }
      throw err;
    }
    ctx.log(`Found ${entries.length} items.`);
    yield* entries;
  },
};
```

```ts
// src/server/collectors/catalog.ts
import { z } from "zod";

import type { AnyCollector } from "./collector";
import { feedItems } from "./collectors/feed-items";

/**
 * Every data collector, as typed data in code (ADR-0040; same approach as
 * the badge catalog, ADR-0039). Adding a collector = one file + one line.
 */
const COLLECTORS: readonly AnyCollector[] = [feedItems];

export function allCollectors(): readonly AnyCollector[] {
  return COLLECTORS;
}

/** The collector with this id, unless it is unknown or switched off. */
export function getCollector(
  id: string,
  disabled: ReadonlySet<string> = new Set(),
): AnyCollector | undefined {
  if (disabled.has(id)) return undefined;
  return COLLECTORS.find((c) => c.id === id);
}

/** Column order for exports, from the collector's row schema. */
export function columnsOf(collector: AnyCollector): readonly string[] | null {
  return collector.itemSchema instanceof z.ZodObject
    ? Object.keys(collector.itemSchema.shape)
    : null;
}
```

In `eslint.config.js`, add this block as the last element of the `tseslint.config(...)` arguments (after the `linterOptions` block):

```js
  {
    // Collectors receive only their input and ctx (ADR-0040).
    files: [
      "src/server/collectors/collectors/**/*.ts",
      "src/server/collectors/helpers/**/*.ts",
    ],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/server/db", "@/server/db/*", "drizzle-orm", "drizzle-orm/*"],
              message: "Collectors get no database access; use input and ctx only (ADR-0040).",
            },
            {
              group: ["@/env", "@/server/net/*"],
              message: "Collectors reach the network only through ctx.fetch (ADR-0040).",
            },
          ],
        },
      ],
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "Use ctx.fetch: it enforces robots.txt, rate limits and budgets (ADR-0040)." },
        { name: "process", message: "Collectors get no environment access (ADR-0040)." },
      ],
    },
  },
```

- [ ] **Step 5: Run tests; prove the lint rule bites**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/collectors`
Expected: PASS.

Prove the boundary: create `src/server/collectors/collectors/lint-probe.ts` containing
`export const probe = () => fetch("https://example.com"); import "@/server/db";`
Run: `pnpm exec eslint src/server/collectors/collectors/lint-probe.ts`
Expected: two errors citing ADR-0040. Then `rm src/server/collectors/collectors/lint-probe.ts`.

Run: `pnpm exec eslint src/server/collectors && pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/data-collectors-core
git status --short          # lint-probe.ts must not appear
git add package.json pnpm-lock.yaml eslint.config.js src/server/collectors/helpers/feed.ts src/server/collectors/helpers/feed.test.ts src/server/collectors/collectors/feed-items.ts src/server/collectors/collectors/feed-items.test.ts src/server/collectors/catalog.ts src/server/collectors/catalog.test.ts src/server/collectors/testing/fake-context.ts
git commit -m "Collectors: feed parser, feed-items collector, typed catalog, boundary lint rule"
```

---

### Task 5: The collector context (protection Proxy)

**Files:**
- Create: `src/server/collectors/context/blocklist.ts`, `context/robots.ts`, `context/site-rate-limit.ts`, `context/collector-context.ts`, `context/live.ts`
- Modify: `package.json` (dependency)
- Test: `context/blocklist.test.ts`, `context/robots.test.ts`, `context/site-rate-limit.test.ts`, `context/collector-context.test.ts`

**Interfaces:**
- Consumes: `CollectorContext`, `CollectorResponse`, `AnyCollector` (Task 2); `CollectorStop` (Task 2); `collectorBlockedDomains` (Task 3); `safeFetch` options (Task 1).
- Produces:
  - `isBlockedHost(host: string, blocked: ReadonlySet<string>): boolean`, `loadBlockedDomains(db: CollectorDb): Promise<Set<string>>`
  - `type RobotsFetch = (url: string) => Promise<{ status: number; body: string }>`; `createRobotsCheck(fetchRobots: RobotsFetch, token: string): (url: string) => Promise<boolean>`
  - `type Sleep = (ms: number, signal: AbortSignal) => Promise<void>`; `abortableSleep`; `interface SlotStore`; `memorySlotStore(now?)`; `redisSlotStore(redis)`; `interface SiteRateLimiter { acquire(host: string, signal: AbortSignal): Promise<void> }`; `createSiteRateLimiter(store, opts?)`
  - `type TransportResponse = { url: string; status: number; headers: Headers; body: Buffer }`; `type Transport = (url: string, opts: { accept?: string; signal: AbortSignal }) => Promise<TransportResponse>`; `interface ContextDeps`; `interface ContextMeter { pagesFetched: number; bytesFetched: number }`; `createCollectorContext(deps): { ctx: CollectorContext; meter: ContextMeter }`; `retryAfterMs(header, now)`
  - `buildLiveContext(args: { db: CollectorDb; collector: AnyCollector; signal: AbortSignal; deadline: number; onLog: (line: string) => void }): Promise<{ ctx: CollectorContext; meter: ContextMeter }>`; `COLLECTOR_USER_AGENT`; `COLLECTOR_ROBOTS_TOKEN`

- [ ] **Step 1: Add the dependency**

Run: `pnpm add robots-parser@^3.0.1`
Expected: listed under `dependencies`; `node_modules/robots-parser/index.d.ts` exists (it ships its own types).

- [ ] **Step 2: Write the failing tests**

```ts
// src/server/collectors/context/blocklist.test.ts
import { describe, expect, it } from "vitest";
import { isBlockedHost } from "./blocklist";

const blocked = new Set(["example.com", "news.site.org"]);

describe("isBlockedHost", () => {
  it.each([
    ["example.com", true],
    ["www.example.com", true],
    ["a.b.example.com", true],
    ["EXAMPLE.com.", true],
    ["notexample.com", false],
    ["example.co", false],
    ["site.org", false],
    ["news.site.org", true],
  ])("%s → %s", (host, expected) => {
    expect(isBlockedHost(host, blocked)).toBe(expected);
  });
});
```

```ts
// src/server/collectors/context/robots.test.ts
import { describe, expect, it, vi } from "vitest";
import { createRobotsCheck } from "./robots";

const TOKEN = "aitcom-collector";

describe("robots check", () => {
  it("applies rules for our token", async () => {
    const fetchRobots = vi.fn().mockResolvedValue({
      status: 200,
      body: "User-agent: aitcom-collector\nDisallow: /private\n\nUser-agent: *\nDisallow: /",
    });
    const allowed = createRobotsCheck(fetchRobots, TOKEN);
    expect(await allowed("https://e.com/public/1")).toBe(true);
    expect(await allowed("https://e.com/private/1")).toBe(false);
  });

  it("fetches robots.txt once per origin", async () => {
    const fetchRobots = vi.fn().mockResolvedValue({ status: 200, body: "" });
    const allowed = createRobotsCheck(fetchRobots, TOKEN);
    await allowed("https://e.com/a");
    await allowed("https://e.com/b");
    await allowed("https://other.com/a");
    expect(fetchRobots.mock.calls.map((c) => c[0])).toEqual([
      "https://e.com/robots.txt",
      "https://other.com/robots.txt",
    ]);
  });

  it("allows everything when robots.txt is missing (4xx)", async () => {
    const allowed = createRobotsCheck(
      vi.fn().mockResolvedValue({ status: 404, body: "" }),
      TOKEN,
    );
    expect(await allowed("https://e.com/x")).toBe(true);
  });

  it.each([
    ["a server error", () => Promise.resolve({ status: 503, body: "" })],
    ["a network error", () => Promise.reject(new Error("boom"))],
  ])("disallows on %s (conservative)", async (_label, impl) => {
    const allowed = createRobotsCheck(vi.fn(impl), TOKEN);
    expect(await allowed("https://e.com/x")).toBe(false);
  });
});
```

```ts
// src/server/collectors/context/site-rate-limit.test.ts
import { describe, expect, it } from "vitest";
import { createSiteRateLimiter, memorySlotStore } from "./site-rate-limit";

function fakeClock() {
  let now = 0;
  return {
    now: () => now,
    sleep: async (ms: number) => {
      now += ms;
    },
  };
}

describe("site rate limiter", () => {
  it("lets the first request through and makes the next one wait a second", async () => {
    const clock = fakeClock();
    const limiter = createSiteRateLimiter(memorySlotStore(clock.now), {
      sleep: clock.sleep,
    });
    const signal = new AbortController().signal;
    await limiter.acquire("e.com", signal);
    expect(clock.now()).toBe(0);
    await limiter.acquire("e.com", signal);
    expect(clock.now()).toBe(1_000);
  });

  it("does not make different sites wait for each other", async () => {
    const clock = fakeClock();
    const limiter = createSiteRateLimiter(memorySlotStore(clock.now), {
      sleep: clock.sleep,
    });
    const signal = new AbortController().signal;
    await limiter.acquire("a.com", signal);
    await limiter.acquire("b.com", signal);
    expect(clock.now()).toBe(0);
  });

  it("treats host names case-insensitively", async () => {
    const clock = fakeClock();
    const limiter = createSiteRateLimiter(memorySlotStore(clock.now), {
      sleep: clock.sleep,
    });
    const signal = new AbortController().signal;
    await limiter.acquire("E.com", signal);
    await limiter.acquire("e.COM", signal);
    expect(clock.now()).toBe(1_000);
  });

  it("gives up when the run is aborted", async () => {
    const limiter = createSiteRateLimiter(memorySlotStore(() => 0), {
      sleep: async () => undefined,
    });
    const controller = new AbortController();
    await limiter.acquire("e.com", controller.signal);
    controller.abort();
    await expect(limiter.acquire("e.com", controller.signal)).rejects.toBeDefined();
  });
});
```

```ts
// src/server/collectors/context/collector-context.test.ts
import { describe, expect, it, vi } from "vitest";

import { CollectorStop } from "../errors";
import {
  type ContextDeps,
  type Transport,
  type TransportResponse,
  createCollectorContext,
  retryAfterMs,
} from "./collector-context";

function reply(
  status: number,
  body = "",
  headers: Record<string, string> = {},
  url = "https://e.com/",
): TransportResponse {
  return { url, status, headers: new Headers(headers), body: Buffer.from(body) };
}

function setup(over: Partial<ContextDeps> & { replies?: TransportResponse[] } = {}) {
  let now = 1_000_000;
  const replies = [...(over.replies ?? [reply(200, "ok")])];
  const transport = vi.fn<Transport>(async (url) => {
    const next = replies.shift();
    if (!next) throw new Error("no more replies");
    return { ...next, url };
  });
  const acquire = vi.fn(async (_host: string, _signal: AbortSignal) => undefined);
  const robots = vi.fn(async (_url: string) => true);
  const controller = new AbortController();
  const deps: ContextDeps = {
    transport,
    isAllowedByRobots: robots,
    rateLimiter: { acquire },
    blockedDomains: new Set(),
    maxPages: 10,
    deadline: now + 60_000,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
    signal: controller.signal,
    onLog: vi.fn(),
    ...over,
  };
  const { ctx, meter } = createCollectorContext(deps);
  return { ctx, meter, transport, acquire, robots, controller, deps, advance: (ms: number) => (now += ms) };
}

async function stopOf(p: Promise<unknown>): Promise<CollectorStop> {
  try {
    await p;
  } catch (err) {
    if (err instanceof CollectorStop) return err;
    throw err;
  }
  throw new Error("expected a CollectorStop");
}

describe("collector context", () => {
  it("fetches through the rate limiter and counts pages and bytes", async () => {
    const t = setup({ replies: [reply(200, "hello")] });
    const res = await t.ctx.fetch("https://e.com/a", { accept: "application/json" });
    expect(await res.text()).toBe("hello");
    expect(t.acquire).toHaveBeenCalledWith("e.com", t.deps.signal);
    expect(t.transport).toHaveBeenCalledWith("https://e.com/a", {
      accept: "application/json",
      signal: t.deps.signal,
    });
    expect(t.meter).toEqual({ pagesFetched: 1, bytesFetched: 5 });
  });

  it("stops at the page limit as a partial success", async () => {
    const t = setup({ maxPages: 1, replies: [reply(200), reply(200)] });
    await t.ctx.fetch("https://e.com/1");
    const stop = await stopOf(t.ctx.fetch("https://e.com/2"));
    expect([stop.reason, stop.outcome]).toEqual(["page_limit", "succeeded"]);
    expect(t.transport).toHaveBeenCalledTimes(1);
  });

  it("stops at the deadline as a partial success", async () => {
    const t = setup();
    t.advance(60_000);
    const stop = await stopOf(t.ctx.fetch("https://e.com/1"));
    expect([stop.reason, stop.outcome]).toEqual(["time_limit", "succeeded"]);
  });

  it("refuses a blocked site and its subdomains without contacting them", async () => {
    const t = setup({ blockedDomains: new Set(["e.com"]) });
    const stop = await stopOf(t.ctx.fetch("https://www.e.com/x"));
    expect([stop.reason, stop.outcome]).toEqual(["blocked_domain", "failed"]);
    expect(t.transport).not.toHaveBeenCalled();
    expect(t.robots).not.toHaveBeenCalled();
  });

  it("refuses a page robots.txt disallows", async () => {
    const t = setup({ isAllowedByRobots: async () => false });
    const stop = await stopOf(t.ctx.fetch("https://e.com/private"));
    expect([stop.reason, stop.outcome]).toEqual(["robots_disallowed", "failed"]);
    expect(t.transport).not.toHaveBeenCalled();
  });

  it("follows a redirect, checking and counting each hop", async () => {
    const t = setup({
      replies: [reply(301, "", { location: "/new" }), reply(200, "moved")],
    });
    const res = await t.ctx.fetch("https://e.com/old");
    expect(res.url).toBe("https://e.com/new");
    expect(t.robots.mock.calls.map((c) => c[0])).toEqual([
      "https://e.com/old",
      "https://e.com/new",
    ]);
    expect(t.meter.pagesFetched).toBe(2);
  });

  it("stops when a redirect leads to a blocked site, never contacting it", async () => {
    const t = setup({
      blockedDomains: new Set(["blocked.org"]),
      replies: [reply(302, "", { location: "https://blocked.org/x" })],
    });
    const stop = await stopOf(t.ctx.fetch("https://e.com/go"));
    expect(stop.reason).toBe("blocked_domain");
    expect(t.transport).toHaveBeenCalledTimes(1);
  });

  it("stops when a redirect leads to a robots-disallowed page", async () => {
    const t = setup({
      isAllowedByRobots: async (url) => !url.includes("/private"),
      replies: [reply(302, "", { location: "/private/x" })],
    });
    const stop = await stopOf(t.ctx.fetch("https://e.com/go"));
    expect(stop.reason).toBe("robots_disallowed");
    expect(t.transport).toHaveBeenCalledTimes(1);
  });

  it("gives up after 5 redirects", async () => {
    const loop = Array.from({ length: 6 }, (_, i) =>
      reply(302, "", { location: `/r${i + 1}` }),
    );
    const t = setup({ replies: loop });
    const stop = await stopOf(t.ctx.fetch("https://e.com/r0"));
    expect([stop.reason, stop.message]).toEqual(["error", "A page redirected too many times."]);
  });

  it("waits as long as Retry-After says, then retries", async () => {
    const t = setup({
      replies: [reply(429, "", { "retry-after": "2" }), reply(200, "ok")],
    });
    const before = t.deps.now();
    const res = await t.ctx.fetch("https://e.com/");
    expect(res.status).toBe(200);
    expect(t.deps.now() - before).toBe(2_000);
    expect(t.meter.pagesFetched).toBe(2);
  });

  it("stops on the third consecutive 429/503 from a site", async () => {
    const t = setup({ replies: [reply(429), reply(503), reply(429)] });
    const stop = await stopOf(t.ctx.fetch("https://e.com/"));
    expect([stop.reason, stop.outcome]).toEqual(["site_refused", "failed"]);
  });

  it("ends as time_limit when Retry-After goes past the deadline", async () => {
    const t = setup({ replies: [reply(503, "", { "retry-after": "3600" })] });
    const stop = await stopOf(t.ctx.fetch("https://e.com/"));
    expect(stop.reason).toBe("time_limit");
  });

  it("turns an abort during a request into time_limit", async () => {
    const t = setup();
    t.transport.mockImplementationOnce(async () => {
      t.controller.abort();
      throw new DOMException("aborted", "AbortError");
    });
    const stop = await stopOf(t.ctx.fetch("https://e.com/"));
    expect(stop.reason).toBe("time_limit");
  });

  it("rejects non-web addresses", async () => {
    const t = setup();
    const stop = await stopOf(t.ctx.fetch("file:///etc/passwd"));
    expect([stop.reason, stop.message]).toEqual([
      "error",
      "Only http and https addresses can be collected.",
    ]);
  });
});

describe("retryAfterMs", () => {
  it("reads seconds and HTTP dates", () => {
    expect(retryAfterMs("5", 0)).toBe(5_000);
    expect(retryAfterMs(new Date(10_000).toUTCString(), 0)).toBe(10_000);
    expect(retryAfterMs(null, 0)).toBeNull();
    expect(retryAfterMs("soon", 0)).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/collectors/context`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement**

```ts
// src/server/collectors/context/blocklist.ts
import { collectorBlockedDomains } from "@/server/db/schema";

import type { CollectorDb } from "../db";

function normalizeHost(host: string): string {
  return host.toLowerCase().replace(/\.$/, "");
}

/** True when the host or any parent domain opted out. */
export function isBlockedHost(host: string, blocked: ReadonlySet<string>): boolean {
  let candidate = normalizeHost(host);
  for (;;) {
    if (blocked.has(candidate)) return true;
    const dot = candidate.indexOf(".");
    if (dot === -1) return false;
    candidate = candidate.slice(dot + 1);
  }
}

export async function loadBlockedDomains(db: CollectorDb): Promise<Set<string>> {
  const rows = await db
    .select({ domain: collectorBlockedDomains.domain })
    .from(collectorBlockedDomains);
  return new Set(rows.map((r) => normalizeHost(r.domain)));
}
```

```ts
// src/server/collectors/context/robots.ts
import robotsParser from "robots-parser";

export type RobotsFetch = (
  url: string,
) => Promise<{ status: number; body: string }>;

/**
 * robots.txt check, cached per origin for one run. Missing robots.txt
 * (4xx) allows everything; a server error or network failure disallows
 * the whole origin for this run (conservative).
 */
export function createRobotsCheck(
  fetchRobots: RobotsFetch,
  token: string,
): (url: string) => Promise<boolean> {
  const cache = new Map<string, Promise<(url: string) => boolean>>();

  async function load(origin: string): Promise<(url: string) => boolean> {
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const { status, body } = await fetchRobots(robotsUrl);
      if (status >= 400 && status < 500) return () => true;
      if (status >= 300) return () => false;
      const robots = robotsParser(robotsUrl, body);
      return (url) => robots.isAllowed(url, token) !== false;
    } catch {
      return () => false;
    }
  }

  return async (url) => {
    const origin = new URL(url).origin;
    let rules = cache.get(origin);
    if (!rules) {
      rules = load(origin);
      cache.set(origin, rules);
    }
    return (await rules)(url);
  };
}
```

```ts
// src/server/collectors/context/site-rate-limit.ts
import type { Redis } from "@upstash/redis";

export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

export const abortableSleep: Sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });

/** Claims a short-lived slot; false while someone else holds it. */
export interface SlotStore {
  trySet(key: string, ttlMs: number): Promise<boolean>;
}

/** Shared across every run and server instance. */
export function redisSlotStore(redis: Redis): SlotStore {
  return {
    async trySet(key, ttlMs) {
      return (await redis.set(key, "1", { nx: true, px: ttlMs })) === "OK";
    },
  };
}

/** Per-instance fallback when Redis is not configured (local development). */
export function memorySlotStore(now: () => number = Date.now): SlotStore {
  const until = new Map<string, number>();
  return {
    async trySet(key, ttlMs) {
      const at = now();
      if ((until.get(key) ?? 0) > at) return false;
      until.set(key, at + ttlMs);
      return true;
    },
  };
}

export interface SiteRateLimiter {
  /** Resolves when this host may receive one more request. */
  acquire(host: string, signal: AbortSignal): Promise<void>;
}

export function createSiteRateLimiter(
  store: SlotStore,
  {
    intervalMs = 1_000,
    pollMs = 250,
    sleep = abortableSleep,
  }: { intervalMs?: number; pollMs?: number; sleep?: Sleep } = {},
): SiteRateLimiter {
  return {
    async acquire(host, signal) {
      const key = `collector:site:${host.toLowerCase()}`;
      for (;;) {
        if (signal.aborted) throw signal.reason;
        if (await store.trySet(key, intervalMs)) return;
        await sleep(pollMs, signal);
      }
    },
  };
}
```

Note on the memory store test: the fake clock's `sleep` advances time by `pollMs` (250 ms) per poll, so the second acquire returns after four polls — exactly 1 000 ms.

```ts
// src/server/collectors/context/collector-context.ts
import type { CollectorContext, CollectorResponse } from "../collector";
import { CollectorStop } from "../errors";
import { isBlockedHost } from "./blocklist";
import type { SiteRateLimiter, Sleep } from "./site-rate-limit";

export type TransportResponse = {
  url: string;
  status: number;
  headers: Headers;
  body: Buffer;
};

/** One HTTP request, no redirect following (the context does that). */
export type Transport = (
  url: string,
  opts: { accept?: string; signal: AbortSignal },
) => Promise<TransportResponse>;

export interface ContextDeps {
  transport: Transport;
  isAllowedByRobots: (url: string) => Promise<boolean>;
  rateLimiter: SiteRateLimiter;
  blockedDomains: ReadonlySet<string>;
  maxPages: number;
  deadline: number;
  now: () => number;
  sleep: Sleep;
  signal: AbortSignal;
  onLog: (line: string) => void;
}

export interface ContextMeter {
  pagesFetched: number;
  bytesFetched: number;
}

const MAX_REDIRECTS = 5;
const MAX_BACKOFFS_PER_HOST = 3;
const DEFAULT_BACKOFF_MS = 5_000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Retry-After as milliseconds: delta-seconds or an HTTP date. */
export function retryAfterMs(header: string | null, now: number): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/**
 * The protection Proxy every collector receives (ADR-0040). Order per hop:
 * blocklist → robots.txt → budget → shared per-site rate limit → request.
 * Redirects are followed here, not in the transport, so every hop passes
 * the same rules. 429/503 are honoured with Retry-After; the third in a row
 * from one host stops the run. Metering happens here, so a collector cannot
 * skip it.
 */
export function createCollectorContext(deps: ContextDeps): {
  ctx: CollectorContext;
  meter: ContextMeter;
} {
  const meter: ContextMeter = { pagesFetched: 0, bytesFetched: 0 };
  const backoffs = new Map<string, number>();

  const timeLimit = () =>
    new CollectorStop("time_limit", "succeeded", "Stopped at the time limit.");

  function checkBudget(): void {
    if (deps.signal.aborted || deps.now() >= deps.deadline) throw timeLimit();
    if (meter.pagesFetched >= deps.maxPages) {
      throw new CollectorStop("page_limit", "succeeded", "Stopped at the page limit.");
    }
  }

  async function fetchHop(url: URL, accept: string | undefined): Promise<TransportResponse> {
    if (isBlockedHost(url.hostname, deps.blockedDomains)) {
      throw new CollectorStop("blocked_domain", "failed", "This site has asked not to be collected.");
    }
    if (!(await deps.isAllowedByRobots(url.href))) {
      throw new CollectorStop(
        "robots_disallowed",
        "failed",
        "This site's robots.txt does not allow collecting this page.",
      );
    }
    for (;;) {
      checkBudget();
      await deps.rateLimiter.acquire(url.hostname, deps.signal);
      const res = await deps.transport(url.href, { accept, signal: deps.signal });
      meter.pagesFetched += 1;
      meter.bytesFetched += res.body.byteLength;
      if (res.status !== 429 && res.status !== 503) {
        backoffs.delete(url.hostname);
        return res;
      }
      const count = (backoffs.get(url.hostname) ?? 0) + 1;
      backoffs.set(url.hostname, count);
      if (count >= MAX_BACKOFFS_PER_HOST) {
        throw new CollectorStop(
          "site_refused",
          "failed",
          "The site asked us to slow down several times, so we stopped.",
        );
      }
      const wait = retryAfterMs(res.headers.get("retry-after"), deps.now()) ?? DEFAULT_BACKOFF_MS;
      if (deps.now() + wait >= deps.deadline) throw timeLimit();
      deps.onLog(`${url.hostname} asked us to wait ${Math.ceil(wait / 1_000)}s.`);
      await deps.sleep(wait, deps.signal);
    }
  }

  const ctx: CollectorContext = {
    signal: deps.signal,
    log: deps.onLog,
    async fetch(rawUrl, opts) {
      try {
        let url = parseWebUrl(rawUrl);
        for (let hop = 0; ; hop++) {
          const res = await fetchHop(url, opts?.accept);
          const location = REDIRECT_STATUSES.has(res.status)
            ? res.headers.get("location")
            : null;
          if (!location) return toCollectorResponse(res);
          if (hop >= MAX_REDIRECTS) {
            throw new CollectorStop("error", "failed", "A page redirected too many times.");
          }
          url = parseWebUrl(new URL(location, url).href);
        }
      } catch (err) {
        if (err instanceof CollectorStop) throw err;
        if (deps.signal.aborted) throw timeLimit();
        throw err;
      }
    },
  };
  return { ctx, meter };
}

function parseWebUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CollectorStop("error", "failed", "A collector produced an invalid web address.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new CollectorStop("error", "failed", "Only http and https addresses can be collected.");
  }
  return url;
}

function toCollectorResponse(res: TransportResponse): CollectorResponse {
  return {
    url: res.url,
    status: res.status,
    headers: res.headers,
    text: async () => res.body.toString("utf8"),
    json: async () => JSON.parse(res.body.toString("utf8")) as unknown,
  };
}
```

```ts
// src/server/collectors/context/live.ts
import { Redis } from "@upstash/redis";

import { env } from "@/env";
import { readBodyCapped, safeFetch } from "@/server/net/safe-fetch";

import type { AnyCollector, CollectorContext } from "../collector";
import type { CollectorDb } from "../db";
import { loadBlockedDomains } from "./blocklist";
import {
  type ContextMeter,
  type Transport,
  createCollectorContext,
} from "./collector-context";
import { type RobotsFetch, createRobotsCheck } from "./robots";
import {
  type SiteRateLimiter,
  abortableSleep,
  createSiteRateLimiter,
  memorySlotStore,
  redisSlotStore,
} from "./site-rate-limit";

export const COLLECTOR_ROBOTS_TOKEN = "aitcom-collector";
export const COLLECTOR_USER_AGENT = `${COLLECTOR_ROBOTS_TOKEN}/1.0 (+https://aitcommunity.org/collectors/about)`;

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_ROBOTS_BYTES = 500 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;
const ROBOTS_TIMEOUT_MS = 10_000;

const liveTransport: Transport = async (url, { accept, signal }) => {
  const { response, url: answeredUrl } = await safeFetch(url, {
    userAgent: COLLECTOR_USER_AGENT,
    timeoutMs: REQUEST_TIMEOUT_MS,
    accept,
    signal,
    allowErrorStatus: true,
    redirects: "return",
  });
  const body = await readBodyCapped(response, MAX_BODY_BYTES);
  return { url: answeredUrl, status: response.status, headers: response.headers, body };
};

function liveRobotsFetch(signal: AbortSignal): RobotsFetch {
  return async (robotsUrl) => {
    const { response } = await safeFetch(robotsUrl, {
      userAgent: COLLECTOR_USER_AGENT,
      timeoutMs: ROBOTS_TIMEOUT_MS,
      accept: "text/plain",
      signal,
      allowErrorStatus: true,
    });
    const body = await readBodyCapped(response, MAX_ROBOTS_BYTES, { truncate: true });
    return { status: response.status, body: body.toString("utf8") };
  };
}

let limiter: SiteRateLimiter | null = null;
function liveSiteRateLimiter(): SiteRateLimiter {
  if (limiter) return limiter;
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    limiter = createSiteRateLimiter(
      redisSlotStore(
        new Redis({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN }),
      ),
    );
  } else {
    console.warn("[collectors] Redis not configured: per-site limit is per instance only");
    limiter = createSiteRateLimiter(memorySlotStore());
  }
  return limiter;
}

/** The real Proxy for one run: live network, shared limiter, current blocklist. */
export async function buildLiveContext(args: {
  db: CollectorDb;
  collector: AnyCollector;
  signal: AbortSignal;
  deadline: number;
  onLog: (line: string) => void;
}): Promise<{ ctx: CollectorContext; meter: ContextMeter }> {
  const blockedDomains = await loadBlockedDomains(args.db);
  return createCollectorContext({
    transport: liveTransport,
    isAllowedByRobots: createRobotsCheck(liveRobotsFetch(args.signal), COLLECTOR_ROBOTS_TOKEN),
    rateLimiter: liveSiteRateLimiter(),
    blockedDomains,
    maxPages: args.collector.limits.maxPages,
    deadline: args.deadline,
    now: Date.now,
    sleep: abortableSleep,
    signal: args.signal,
    onLog: args.onLog,
  });
}
```

- [ ] **Step 5: Run tests, lint, typecheck**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/collectors && pnpm exec eslint src/server/collectors && pnpm typecheck`
Expected: PASS, no lint or type errors.

- [ ] **Step 6: Commit**

```bash
git branch --show-current   # must print feat/data-collectors-core
git add package.json pnpm-lock.yaml src/server/collectors/context/blocklist.ts src/server/collectors/context/blocklist.test.ts src/server/collectors/context/robots.ts src/server/collectors/context/robots.test.ts src/server/collectors/context/site-rate-limit.ts src/server/collectors/context/site-rate-limit.test.ts src/server/collectors/context/collector-context.ts src/server/collectors/context/collector-context.test.ts src/server/collectors/context/live.ts
git commit -m "Collectors: the context Proxy — blocklist, robots.txt, shared per-site limit, per-hop redirects, back-off"
```

---

### Task 6: Quota policy

**Files:**
- Create: `src/server/collectors/quota.ts`, `src/server/collectors/collectors.integration.test.ts`

**Interfaces:**
- Consumes: `collectorRuns` (Task 3), `CollectorDb` (Task 3).
- Produces: `type QuotaLimits = { runsPerDay: number; activePerUser: number; activePlatform: number }`; `DEFAULT_QUOTA: QuotaLimits`; `type QuotaDecision`; `canStartRun(db: CollectorDb, userId: string, now: Date, limits?: QuotaLimits): Promise<QuotaDecision>`.

- [ ] **Step 1: Write the failing tests** (this file grows in Tasks 7 and 9; keep everything that claims or counts runs in it so tests stay sequential)

```ts
// src/server/collectors/collectors.integration.test.ts
// @vitest-environment node
// All collector DB tests that claim or count runs live in this one file:
// vitest runs a file's tests in order, so no other file can claim our runs.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}

describe.skipIf(!isLocalDbConfigured())("collectors [DB integration]", () => {
  type Mods = {
    db: typeof import("@/server/db").db;
    schema: typeof import("@/server/db/schema");
    drizzle: typeof import("drizzle-orm");
    quota: typeof import("./quota");
  };
  let m: Mods;
  const userIds: string[] = [];

  async function makeUser(): Promise<string> {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const id = `it-collector-${suffix}`;
    await m.db.insert(m.schema.user).values({
      id,
      email: `${id}@example.test`,
      name: "IT Collector",
    });
    userIds.push(id);
    return id;
  }

  async function insertRun(
    userId: string,
    over: Partial<typeof import("@/server/db/schema").collectorRuns.$inferInsert> = {},
  ): Promise<string> {
    const [row] = await m.db
      .insert(m.schema.collectorRuns)
      .values({
        userId,
        origin: "web",
        collectorId: "test-collector",
        collectorVersion: 1,
        input: {},
        status: "queued",
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
        ...over,
      })
      .returning({ id: m.schema.collectorRuns.id });
    return row!.id;
  }

  beforeAll(async () => {
    const [{ db }, schema, drizzle, quota] = await Promise.all([
      import("@/server/db"),
      import("@/server/db/schema"),
      import("drizzle-orm"),
      import("./quota"),
    ]);
    m = { db, schema, drizzle, quota };
  }, 120_000);

  beforeEach(async () => {
    // Test DB only (gated above): start every test from no runs at all.
    await m.db.delete(m.schema.collectorRuns).where(m.drizzle.sql`true`);
  });

  afterAll(async () => {
    if (userIds.length) {
      await m.db
        .delete(m.schema.user)
        .where(m.drizzle.inArray(m.schema.user.id, userIds));
    }
  });

  describe("canStartRun", () => {
    const now = new Date("2026-10-03T12:00:00Z");
    const roomy = { runsPerDay: 20, activePerUser: 2, activePlatform: 1_000 };

    it("allows a member with no runs", async () => {
      const userId = await makeUser();
      expect(await m.quota.canStartRun(m.db, userId, now, roomy)).toEqual({ allowed: true });
    });

    it("refuses the 21st run in 24 hours, counting only this member", async () => {
      const userId = await makeUser();
      const other = await makeUser();
      for (let i = 0; i < 20; i++) {
        await insertRun(userId, {
          status: "succeeded",
          createdAt: new Date(now.getTime() - (i + 1) * 60_000),
        });
      }
      await insertRun(other, { status: "succeeded", createdAt: now });
      const decision = await m.quota.canStartRun(m.db, userId, now, roomy);
      expect(decision).toMatchObject({ allowed: false, reason: "daily_limit" });
      expect(await m.quota.canStartRun(m.db, other, now, roomy)).toEqual({ allowed: true });
    });

    it("forgets runs older than 24 hours", async () => {
      const userId = await makeUser();
      for (let i = 0; i < 20; i++) {
        await insertRun(userId, {
          status: "succeeded",
          createdAt: new Date(now.getTime() - 25 * 3_600_000),
        });
      }
      expect(await m.quota.canStartRun(m.db, userId, now, roomy)).toEqual({ allowed: true });
    });

    it("refuses a third active run", async () => {
      const userId = await makeUser();
      await insertRun(userId, { status: "queued", createdAt: now });
      await insertRun(userId, { status: "running", createdAt: now });
      expect(await m.quota.canStartRun(m.db, userId, now, roomy)).toMatchObject({
        allowed: false,
        reason: "active_limit",
      });
    });

    it("refuses when the platform is at its active cap", async () => {
      const userId = await makeUser();
      expect(
        await m.quota.canStartRun(m.db, userId, now, { ...roomy, activePlatform: 0 }),
      ).toMatchObject({ allowed: false, reason: "platform_busy" });
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `<DB test prefix> pnpm vitest run src/server/collectors/collectors.integration.test.ts`
Expected: FAIL — `./quota` not found (not *skipped*).

- [ ] **Step 3: Implement**

```ts
// src/server/collectors/quota.ts
import { and, count, eq, gt, inArray } from "drizzle-orm";

import { collectorRuns } from "@/server/db/schema";

import type { CollectorDb } from "./db";

export type QuotaLimits = {
  runsPerDay: number;
  activePerUser: number;
  activePlatform: number;
};

/** v1 numbers (spec: "Quota policy"); tuned after launch. */
export const DEFAULT_QUOTA: QuotaLimits = {
  runsPerDay: 20,
  activePerUser: 2,
  activePlatform: 10,
};

export type QuotaDecision =
  | { allowed: true }
  | {
      allowed: false;
      reason: "daily_limit" | "active_limit" | "platform_busy";
      message: string;
    };

const DAY_MS = 86_400_000;
const ACTIVE = ["queued", "running"] as const;

/**
 * May this member start one more run? Counted from the database, so it holds
 * across server instances. Agent-started runs count against the owner. Call
 * inside the per-member advisory lock (see `CollectorRuns.startRun`) so two
 * simultaneous starts cannot both pass. Marketplace seam: a plan or credit
 * check slots in here.
 */
export async function canStartRun(
  db: CollectorDb,
  userId: string,
  now: Date,
  limits: QuotaLimits = DEFAULT_QUOTA,
): Promise<QuotaDecision> {
  const since = new Date(now.getTime() - DAY_MS);
  const [recent] = await db
    .select({ n: count() })
    .from(collectorRuns)
    .where(and(eq(collectorRuns.userId, userId), gt(collectorRuns.createdAt, since)));
  if ((recent?.n ?? 0) >= limits.runsPerDay) {
    return {
      allowed: false,
      reason: "daily_limit",
      message: `You can start ${limits.runsPerDay} runs per 24 hours. Try again later.`,
    };
  }
  const [mine] = await db
    .select({ n: count() })
    .from(collectorRuns)
    .where(and(eq(collectorRuns.userId, userId), inArray(collectorRuns.status, [...ACTIVE])));
  if ((mine?.n ?? 0) >= limits.activePerUser) {
    return {
      allowed: false,
      reason: "active_limit",
      message: `You already have ${limits.activePerUser} runs in progress. Wait for one to finish.`,
    };
  }
  const [all] = await db
    .select({ n: count() })
    .from(collectorRuns)
    .where(inArray(collectorRuns.status, [...ACTIVE]));
  if ((all?.n ?? 0) >= limits.activePlatform) {
    return {
      allowed: false,
      reason: "platform_busy",
      message: "Data collectors are busy right now. Try again in a few minutes.",
    };
  }
  return { allowed: true };
}
```

- [ ] **Step 4: Run tests**

Run: `<DB test prefix> pnpm vitest run src/server/collectors/collectors.integration.test.ts`
Expected: PASS (5 tests executed).

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/data-collectors-core
git add src/server/collectors/quota.ts src/server/collectors/collectors.integration.test.ts
git commit -m "Collectors: quota policy counted from the database"
```

---

### Task 7: Executor — claim with a lease, run, store, finish

**Files:**
- Create: `src/server/collectors/executor.ts`
- Modify: `src/server/collectors/collectors.integration.test.ts` (add a `describe("executor")` block inside the outer describe)

**Interfaces:**
- Consumes: `AnyCollector`, `CollectorContext` (Task 2); `CollectorStop`, `userMessageFor`, `assertTransition`, `StopReason` (Task 2); tables (Task 3); `ContextMeter` (Task 5).
- Produces:
  - constants `TICK_BUDGET_MS = 240_000`, `LEASE_MS = 300_000`, `MAX_ATTEMPTS = 2`, `MAX_ITEMS_PER_RUN = 5_000`
  - `type CollectorRunRow = typeof collectorRuns.$inferSelect`
  - `interface ExecutorDeps { db: typeof appDb; getCollector(id: string): AnyCollector | undefined; buildContext(args: { collector: AnyCollector; signal: AbortSignal; deadline: number; onLog: (line: string) => void }): Promise<{ ctx: CollectorContext; meter: ContextMeter }>; now(): number }`
  - `claimNextRun(db: typeof appDb, now: Date): Promise<CollectorRunRow | null>`
  - `executeRun(deps: ExecutorDeps, run: CollectorRunRow, tickDeadline: number): Promise<{ status: "succeeded" | "failed"; stopReason: StopReason }>`
  - `runWorkerTick(deps: ExecutorDeps): Promise<{ executed: number }>`

- [ ] **Step 1: Write the failing tests**

Add to the `Mods` type and `beforeAll` imports: `executor: typeof import("./executor")` (import `"./executor"`), and `errors: typeof import("./errors")` (import `"./errors"`). Then add, inside the outer describe:

```ts
  describe("executor", () => {
    type Row = { n: number; title?: unknown };

    function testCollector(
      rows: (ctx: import("./collector").CollectorContext) => AsyncIterable<Row>,
      limits = { maxPages: 5, maxItems: 100, maxDurationMs: 60_000 },
    ): import("./collector").AnyCollector {
      return {
        id: "test-collector",
        version: 3,
        author: "platform",
        kind: "api",
        title: { en: "Test", nl: "Test" },
        description: { en: "Test", nl: "Test" },
        inputSchema: z.object({}),
        itemSchema: z.object({ n: z.number() }),
        fieldHints: {},
        sampleItem: { n: 1 },
        limits,
        run: (_input, ctx) => rows(ctx),
      };
    }

    function deps(collector: import("./collector").AnyCollector | undefined) {
      const meter = { pagesFetched: 4, bytesFetched: 1234 };
      return {
        db: m.db,
        getCollector: (id: string) => (collector && id === collector.id ? collector : undefined),
        buildContext: async ({ signal, onLog }: { signal: AbortSignal; onLog: (l: string) => void }) => ({
          ctx: {
            signal,
            log: onLog,
            fetch: async () => {
              throw new Error("no network in tests");
            },
          },
          meter,
        }),
        now: Date.now,
      };
    }

    async function runRow(id: string) {
      const [row] = await m.db
        .select()
        .from(m.schema.collectorRuns)
        .where(m.drizzle.eq(m.schema.collectorRuns.id, id));
      return row!;
    }

    async function items(id: string) {
      return m.db
        .select()
        .from(m.schema.collectorItems)
        .where(m.drizzle.eq(m.schema.collectorItems.runId, id))
        .orderBy(m.schema.collectorItems.seq);
    }

    it("claims the oldest queued run and leases it", async () => {
      const userId = await makeUser();
      const older = await insertRun(userId, { createdAt: new Date(Date.now() - 60_000) });
      await insertRun(userId);
      const now = new Date();
      const claimed = await m.executor.claimNextRun(m.db, now);
      expect(claimed?.id).toBe(older);
      expect(claimed?.status).toBe("running");
      expect(claimed?.attempts).toBe(1);
      expect(claimed?.leaseUntil?.getTime()).toBe(now.getTime() + m.executor.LEASE_MS);
    });

    it("never hands the same run to two concurrent workers", async () => {
      const userId = await makeUser();
      await insertRun(userId);
      await insertRun(userId);
      const now = new Date();
      const [a, b] = await Promise.all([
        m.executor.claimNextRun(m.db, now),
        m.executor.claimNextRun(m.db, now),
      ]);
      expect(a && b).toBeTruthy();
      expect(a!.id).not.toBe(b!.id);
    });

    it("re-claims a run whose lease expired, but not a live one", async () => {
      const userId = await makeUser();
      const now = new Date();
      await insertRun(userId, { status: "running", attempts: 1, leaseUntil: new Date(now.getTime() + 60_000) });
      const lost = await insertRun(userId, { status: "running", attempts: 1, leaseUntil: new Date(now.getTime() - 1) });
      const claimed = await m.executor.claimNextRun(m.db, now);
      expect(claimed?.id).toBe(lost);
      expect(claimed?.attempts).toBe(2);
      expect(await m.executor.claimNextRun(m.db, now)).toBeNull();
    });

    it("stores valid rows in order, counts invalid ones, and finishes", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(async function* (ctx) {
        ctx.log("starting");
        yield { n: 1 };
        yield { n: "not a number" } as unknown as Row;
        yield { n: 2 };
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      const result = await m.executor.executeRun(deps(collector), run!, Date.now() + 60_000);
      expect(result).toEqual({ status: "succeeded", stopReason: "complete" });
      expect((await items(id)).map((i) => [i.seq, i.data])).toEqual([
        [0, { n: 1 }],
        [1, { n: 2 }],
      ]);
      const row = await runRow(id);
      expect(row).toMatchObject({
        status: "succeeded",
        stopReason: "complete",
        itemCount: 2,
        invalidItemCount: 1,
        pagesFetched: 4,
        bytesFetched: 1234,
        log: ["starting"],
        error: null,
        leaseUntil: null,
      });
      expect(row.finishedAt).not.toBeNull();
      expect(row.durationMs).not.toBeNull();
    });

    it("flushes in batches and stops at the item limit", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(
        async function* () {
          for (let n = 0; n < 1_000; n++) yield { n };
        },
        { maxPages: 1, maxItems: 250, maxDurationMs: 60_000 },
      );
      const run = await m.executor.claimNextRun(m.db, new Date());
      const result = await m.executor.executeRun(deps(collector), run!, Date.now() + 60_000);
      expect(result.stopReason).toBe("item_limit");
      expect(await items(id)).toHaveLength(250);
      expect((await runRow(id)).itemCount).toBe(250);
    });

    it("keeps rows collected before a site refused, and records the reason", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(async function* () {
        yield { n: 1 };
        throw new m.errors.CollectorStop("robots_disallowed", "failed", "Not allowed here.");
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      await m.executor.executeRun(deps(collector), run!, Date.now() + 60_000);
      expect(await runRow(id)).toMatchObject({
        status: "failed",
        stopReason: "robots_disallowed",
        error: "Not allowed here.",
        itemCount: 1,
      });
    });

    it("hides an unexpected error's text from the member", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(async function* () {
        throw new Error("password=hunter2 at db.internal");
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      await m.executor.executeRun(deps(collector), run!, Date.now() + 60_000);
      const row = await runRow(id);
      expect(row).toMatchObject({ status: "failed", stopReason: "error" });
      expect(row.error).toBe("Something went wrong while collecting. Try again later.");
    });

    it("ends as time_limit when the tick deadline passes mid-run", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const collector = testCollector(async function* () {
        for (let n = 0; n < 100; n++) {
          await new Promise((r) => setTimeout(r, 20));
          yield { n };
        }
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      const result = await m.executor.executeRun(deps(collector), run!, Date.now() + 100);
      expect(result).toEqual({ status: "succeeded", stopReason: "time_limit" });
      const stored = (await runRow(id)).itemCount;
      expect(stored).toBeGreaterThan(0);
      expect(stored).toBeLessThan(100);
    });

    it("wipes an earlier attempt's rows before re-running", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId, {
        status: "running",
        attempts: 1,
        leaseUntil: new Date(Date.now() - 1),
      });
      await m.db.insert(m.schema.collectorItems).values([
        { runId: id, seq: 0, data: { n: 99 } },
        { runId: id, seq: 1, data: { n: 98 } },
      ]);
      const collector = testCollector(async function* () {
        yield { n: 1 };
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      await m.executor.executeRun(deps(collector), run!, Date.now() + 60_000);
      expect((await items(id)).map((i) => i.data)).toEqual([{ n: 1 }]);
    });

    it("gives up as worker_lost on the third claim", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId, {
        status: "running",
        attempts: 2,
        leaseUntil: new Date(Date.now() - 1),
      });
      const collector = testCollector(async function* () {
        yield { n: 1 };
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      const result = await m.executor.executeRun(deps(collector), run!, Date.now() + 60_000);
      expect(result).toEqual({ status: "failed", stopReason: "worker_lost" });
      expect(await items(id)).toHaveLength(0);
    });

    it("fails a run whose collector is gone or switched off", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId);
      const run = await m.executor.claimNextRun(m.db, new Date());
      await m.executor.executeRun(deps(undefined), run!, Date.now() + 60_000);
      expect(await runRow(id)).toMatchObject({
        status: "failed",
        stopReason: "error",
        error: "This collector is not available any more.",
      });
    });

    it("records the collector version that actually ran", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId, { collectorVersion: 1 });
      const collector = testCollector(async function* () {
        yield { n: 1 };
      });
      const run = await m.executor.claimNextRun(m.db, new Date());
      await m.executor.executeRun(deps(collector), run!, Date.now() + 60_000);
      expect((await runRow(id)).collectorVersion).toBe(3);
    });

    it("a worker tick drains the queue", async () => {
      const userId = await makeUser();
      await insertRun(userId);
      await insertRun(userId);
      const collector = testCollector(async function* () {
        yield { n: 1 };
      });
      expect(await m.executor.runWorkerTick(deps(collector))).toEqual({ executed: 2 });
      expect(await m.executor.claimNextRun(m.db, new Date())).toBeNull();
    });
  });
```

Add `import { z } from "zod";` at the top of the test file (static imports are fine; zod has no database side effects).

- [ ] **Step 2: Run to verify failure**

Run: `<DB test prefix> pnpm vitest run src/server/collectors/collectors.integration.test.ts`
Expected: FAIL — `./executor` not found.

- [ ] **Step 3: Implement**

```ts
// src/server/collectors/executor.ts
import { and, asc, eq, lt, or, sql } from "drizzle-orm";

import type { db as appDb } from "@/server/db";
import { collectorItems, collectorRuns } from "@/server/db/schema";

import type { AnyCollector, CollectorContext } from "./collector";
import type { ContextMeter } from "./context/collector-context";
import { CollectorStop, userMessageFor } from "./errors";
import { type StopReason, assertTransition } from "./run-status";

export const TICK_BUDGET_MS = 240_000;
export const LEASE_MS = 300_000;
export const MAX_ATTEMPTS = 2;
export const MAX_ITEMS_PER_RUN = 5_000;
const FLUSH_EVERY = 100;
const MAX_LOG_LINES = 50;
const MAX_LOG_LINE = 300;
/** A tick only starts another run while this much of it has passed. */
const START_NEW_RUN_WITHIN_MS = 20_000;

export type CollectorRunRow = typeof collectorRuns.$inferSelect;

export interface ExecutorDeps {
  db: typeof appDb;
  getCollector(id: string): AnyCollector | undefined;
  buildContext(args: {
    collector: AnyCollector;
    signal: AbortSignal;
    deadline: number;
    onLog: (line: string) => void;
  }): Promise<{ ctx: CollectorContext; meter: ContextMeter }>;
  now(): number;
}

type Outcome = {
  status: "succeeded" | "failed";
  stopReason: StopReason;
  error: string | null;
};

/**
 * Take the oldest queued run, or a running one whose lease expired (its
 * worker died). SKIP LOCKED lets concurrent workers each take a different
 * run. Each claim counts as an attempt.
 */
export async function claimNextRun(
  db: typeof appDb,
  now: Date,
): Promise<CollectorRunRow | null> {
  return db.transaction(async (tx) => {
    const [next] = await tx
      .select({ id: collectorRuns.id })
      .from(collectorRuns)
      .where(
        or(
          eq(collectorRuns.status, "queued"),
          and(eq(collectorRuns.status, "running"), lt(collectorRuns.leaseUntil, now)),
        ),
      )
      .orderBy(asc(collectorRuns.createdAt))
      .limit(1)
      .for("update", { skipLocked: true });
    if (!next) return null;
    const [claimed] = await tx
      .update(collectorRuns)
      .set({
        status: "running",
        leaseUntil: new Date(now.getTime() + LEASE_MS),
        startedAt: now,
        attempts: sql`${collectorRuns.attempts} + 1`,
      })
      .where(eq(collectorRuns.id, next.id))
      .returning();
    return claimed ?? null;
  });
}

function createRunLog() {
  const lines: string[] = [];
  return {
    add(line: string) {
      lines.push(line.slice(0, MAX_LOG_LINE));
      if (lines.length > MAX_LOG_LINES) lines.shift();
    },
    lines: () => [...lines],
  };
}

/**
 * Run one claimed Command: resolve the Strategy, give it the Proxy, iterate
 * its rows, validate and store them in batches, then record the outcome.
 * Rows from an earlier attempt are removed first, so a re-run never
 * duplicates. Rows gathered before a stop or failure are kept.
 */
export async function executeRun(
  deps: ExecutorDeps,
  run: CollectorRunRow,
  tickDeadline: number,
): Promise<{ status: "succeeded" | "failed"; stopReason: StopReason }> {
  const startedAt = deps.now();
  const log = createRunLog();

  const finish = async (outcome: Outcome, version?: number) => {
    assertTransition("running", outcome.status);
    await deps.db
      .update(collectorRuns)
      .set({
        status: outcome.status,
        stopReason: outcome.stopReason,
        error: outcome.error,
        durationMs: deps.now() - startedAt,
        finishedAt: new Date(deps.now()),
        leaseUntil: null,
        log: log.lines(),
        ...(version === undefined ? {} : { collectorVersion: version }),
      })
      .where(and(eq(collectorRuns.id, run.id), eq(collectorRuns.status, "running")));
    return { status: outcome.status, stopReason: outcome.stopReason };
  };

  if (run.attempts > MAX_ATTEMPTS) {
    await deps.db.delete(collectorItems).where(eq(collectorItems.runId, run.id));
    return finish({
      status: "failed",
      stopReason: "worker_lost",
      error: "The run was interrupted twice, so it was stopped.",
    });
  }
  await deps.db.delete(collectorItems).where(eq(collectorItems.runId, run.id));

  const collector = deps.getCollector(run.collectorId);
  if (!collector) {
    return finish({
      status: "failed",
      stopReason: "error",
      error: "This collector is not available any more.",
    });
  }
  const input = collector.inputSchema.safeParse(run.input);
  if (!input.success) {
    return finish(
      {
        status: "failed",
        stopReason: "error",
        error: "The saved input is no longer valid for this collector.",
      },
      collector.version,
    );
  }

  const deadline = Math.min(startedAt + collector.limits.maxDurationMs, tickDeadline);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, deadline - startedAt));
  const maxItems = Math.min(collector.limits.maxItems, MAX_ITEMS_PER_RUN);
  let meter: ContextMeter = { pagesFetched: 0, bytesFetched: 0 };
  let seq = 0;
  let invalid = 0;
  let buffer: (typeof collectorItems.$inferInsert)[] = [];

  const flush = async () => {
    if (buffer.length) {
      await deps.db.insert(collectorItems).values(buffer);
      buffer = [];
    }
    await deps.db
      .update(collectorRuns)
      .set({
        itemCount: seq,
        invalidItemCount: invalid,
        pagesFetched: meter.pagesFetched,
        bytesFetched: meter.bytesFetched,
        log: log.lines(),
        leaseUntil: new Date(deps.now() + LEASE_MS),
      })
      .where(eq(collectorRuns.id, run.id));
  };

  let outcome: Outcome = { status: "succeeded", stopReason: "complete", error: null };
  try {
    const built = await deps.buildContext({
      collector,
      signal: controller.signal,
      deadline,
      onLog: log.add,
    });
    meter = built.meter;
    for await (const raw of collector.run(input.data, built.ctx)) {
      const row = collector.itemSchema.safeParse(raw);
      if (row.success) {
        buffer.push({ runId: run.id, seq, data: row.data as Record<string, unknown> });
        seq += 1;
        if (buffer.length >= FLUSH_EVERY) await flush();
      } else {
        invalid += 1;
      }
      if (seq >= maxItems) {
        outcome = { status: "succeeded", stopReason: "item_limit", error: null };
        break;
      }
      if (controller.signal.aborted) {
        outcome = { status: "succeeded", stopReason: "time_limit", error: null };
        break;
      }
    }
  } catch (err) {
    if (err instanceof CollectorStop) {
      outcome = {
        status: err.outcome,
        stopReason: err.reason,
        error: err.outcome === "failed" ? err.message : null,
      };
    } else {
      console.error(`[collectors] run ${run.id} failed`, err);
      outcome = { status: "failed", stopReason: "error", error: userMessageFor(err) };
    }
  } finally {
    clearTimeout(timer);
  }
  await flush();
  return finish(outcome, collector.version);
}

/** One worker invocation: drain queued runs within the tick budget. */
export async function runWorkerTick(deps: ExecutorDeps): Promise<{ executed: number }> {
  const tickStart = deps.now();
  const tickDeadline = tickStart + TICK_BUDGET_MS;
  let executed = 0;
  while (deps.now() - tickStart < START_NEW_RUN_WITHIN_MS) {
    const run = await claimNextRun(deps.db, new Date(deps.now()));
    if (!run) break;
    await executeRun(deps, run, tickDeadline);
    executed += 1;
  }
  return { executed };
}
```

- [ ] **Step 4: Run all collector tests**

Run: `<DB test prefix> pnpm vitest run src/server/collectors`
Expected: PASS; the integration suite reports its tests executed, not skipped.

- [ ] **Step 5: Lint, typecheck, commit**

Run: `pnpm exec eslint src/server/collectors && pnpm typecheck`

```bash
git branch --show-current   # must print feat/data-collectors-core
git add src/server/collectors/executor.ts src/server/collectors/collectors.integration.test.ts
git commit -m "Collectors: executor with leased claims, batched rows, honest stop reasons"
```

---

### Task 8: Export formats (CSV and JSON)

**Files:**
- Create: `src/server/collectors/export/formats.ts`
- Test: `src/server/collectors/export/formats.test.ts`

**Interfaces:**
- Produces: `interface ExportFormat { extension: string; contentType: string; write(rows: AsyncIterable<Record<string, unknown>>, columns: readonly string[] | null): AsyncIterable<string> }`; `EXPORT_FORMATS: Record<"csv" | "json", ExportFormat>`; `type ExportFormatId = keyof typeof EXPORT_FORMATS`; `csvCell(value: unknown): string`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/server/collectors/export/formats.test.ts
import { describe, expect, it } from "vitest";
import { EXPORT_FORMATS, csvCell } from "./formats";

async function* rows(...items: Record<string, unknown>[]) {
  yield* items;
}
async function text(chunks: AsyncIterable<string>) {
  let out = "";
  for await (const c of chunks) out += c;
  return out;
}

describe("csvCell", () => {
  it.each([
    [null, ""],
    [undefined, ""],
    [42, "42"],
    [true, "true"],
    ["plain", "plain"],
    ['say "hi", ok', '"say ""hi"", ok"'],
    ["line\nbreak", '"line\nbreak"'],
    [{ a: 1 }, '"{""a"":1}"'],
  ])("%j → %s", (value, expected) => {
    expect(csvCell(value)).toBe(expected);
  });

  it.each(["=SUM(A1)", "+1", "-1", "@cmd", "\tx", "\rx"])(
    "neutralises spreadsheet formulas: %j",
    (value) => {
      expect(csvCell(value).replace(/^"/, "").startsWith("'")).toBe(true);
    },
  );
});

describe("CSV export", () => {
  it("writes a header from the columns and one line per row", async () => {
    const out = await text(
      EXPORT_FORMATS.csv.write(rows({ b: 2, a: 1 }, { a: 3 }), ["a", "b"]),
    );
    expect(out).toBe("a,b\r\n1,2\r\n3,\r\n");
  });

  it("takes columns from the first row when none are given", async () => {
    const out = await text(EXPORT_FORMATS.csv.write(rows({ x: 1 }), null));
    expect(out).toBe("x\r\n1\r\n");
  });

  it("writes only a header for an empty dataset", async () => {
    expect(await text(EXPORT_FORMATS.csv.write(rows(), ["a"]))).toBe("a\r\n");
  });
});

describe("JSON export", () => {
  it("writes a valid JSON array", async () => {
    const out = await text(EXPORT_FORMATS.json.write(rows({ a: 1 }, { a: 2 }), null));
    expect(JSON.parse(out)).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("writes [] for an empty dataset", async () => {
    expect(JSON.parse(await text(EXPORT_FORMATS.json.write(rows(), null)))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/collectors/export`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/server/collectors/export/formats.ts
/**
 * Dataset export formats (Strategy): one formatter per format, all
 * streaming, so a new format is one more entry.
 */
export interface ExportFormat {
  extension: string;
  contentType: string;
  write(
    rows: AsyncIterable<Record<string, unknown>>,
    columns: readonly string[] | null,
  ): AsyncIterable<string>;
}

const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell: formula-safe (OWASP CSV injection) and RFC 4180 quoted. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

```

Continue the same file:

```ts
const csv: ExportFormat = {
  extension: "csv",
  contentType: "text/csv; charset=utf-8",
  async *write(rows, columns) {
    let header: readonly string[] | null = columns;
    if (header) yield `${header.map(csvCell).join(",")}\r\n`;
    for await (const row of rows) {
      if (!header) {
        header = Object.keys(row);
        yield `${header.map(csvCell).join(",")}\r\n`;
      }
      yield `${header.map((c) => csvCell(row[c])).join(",")}\r\n`;
    }
  },
};

const json: ExportFormat = {
  extension: "json",
  contentType: "application/json; charset=utf-8",
  async *write(rows) {
    yield "[";
    let first = true;
    for await (const row of rows) {
      yield `${first ? "\n" : ",\n"}${JSON.stringify(row)}`;
      first = false;
    }
    yield first ? "]" : "\n]";
  },
};

export const EXPORT_FORMATS = { csv, json } satisfies Record<string, ExportFormat>;
export type ExportFormatId = keyof typeof EXPORT_FORMATS;
```


- [ ] **Step 4: Run tests**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/collectors/export`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/data-collectors-core
git add src/server/collectors/export/formats.ts src/server/collectors/export/formats.test.ts
git commit -m "Collectors: streaming CSV (formula-safe) and JSON export formats"
```

---

### Task 9: `CollectorRuns` facade

**Files:**
- Create: `src/server/collectors/runs.ts`, `src/server/collectors/kick.ts`, `src/server/collectors/live.ts`
- Modify: `src/server/collectors/collectors.integration.test.ts` (add `describe("CollectorRuns")`)

**Interfaces:**
- Consumes: catalog (`allCollectors`, `columnsOf`), `canStartRun`/`QuotaLimits`/`DEFAULT_QUOTA`, `EXPORT_FORMATS`/`ExportFormatId`, `ExecutorDeps`, `buildLiveContext`, `collectorsEnabled`, `disabledCollectorIds`, tables.
- Produces:
  - `interface CollectorCatalogPort { all(): readonly AnyCollector[]; get(id: string): AnyCollector | undefined }`
  - `interface CollectorRunsDeps { db: typeof appDb; enabled(): boolean; catalog: CollectorCatalogPort; kick(): void; now(): Date; quota?: QuotaLimits }`
  - `type StartRunResult = { ok: true; runId: string } | { ok: false; reason: "disabled" | "unknown_collector" | "invalid_input" | "quota"; message: string; fieldErrors?: Record<string, string[]> }`
  - `type RunView`, `type CollectorSummary`
  - `createCollectorRuns(deps)` returning `{ listCollectors(locale: "en" | "nl"): CollectorSummary[]; startRun(args: { userId: string; agentId?: string | null; origin: "web" | "mcp"; collectorId: string; input: unknown }): Promise<StartRunResult>; getRun(userId: string, runId: string): Promise<RunView | null>; listRuns(userId: string, opts?: { cursor?: string; limit?: number }): Promise<{ runs: RunView[]; nextCursor: string | null }>; listItems(userId: string, runId: string, opts?: { afterSeq?: number; limit?: number }): Promise<{ items: Record<string, unknown>[]; nextSeq: number | null } | null>; exportRun(userId: string, runId: string, format: ExportFormatId): Promise<{ filename: string; contentType: string; body: AsyncIterable<string> } | null> }`
  - `kickCollectorWorker(): void`
  - `liveCollectorRuns()`, `liveExecutorDeps(): ExecutorDeps`

- [ ] **Step 1: Write the failing tests**

Add `runs: typeof import("./runs")` to `Mods` (import `"./runs"` in `beforeAll`). Then add inside the outer describe:

```ts
  describe("CollectorRuns", () => {
    function facade(over: Partial<import("./runs").CollectorRunsDeps> = {}) {
      const kicks: number[] = [];
      const collector = getCollector("feed-items")!;
      const runs = m.runs.createCollectorRuns({
        db: m.db,
        enabled: () => true,
        catalog: { all: () => [collector], get: (id) => (id === collector.id ? collector : undefined) },
        kick: () => kicks.push(1),
        now: () => new Date("2026-10-03T12:00:00Z"),
        quota: { runsPerDay: 20, activePerUser: 2, activePlatform: 1_000 },
        ...over,
      });
      return { runs, kicks };
    }
    const feedInput = { url: "https://example.com/feed.xml" };

    it("refuses everything while the feature is off", async () => {
      const userId = await makeUser();
      const { runs, kicks } = facade({ enabled: () => false });
      expect(
        await runs.startRun({ userId, origin: "web", collectorId: "feed-items", input: feedInput }),
      ).toMatchObject({ ok: false, reason: "disabled" });
      expect(kicks).toHaveLength(0);
    });

    it("refuses an unknown collector and invalid input, storing nothing", async () => {
      const userId = await makeUser();
      const { runs } = facade();
      expect(
        await runs.startRun({ userId, origin: "web", collectorId: "nope", input: {} }),
      ).toMatchObject({ ok: false, reason: "unknown_collector" });
      const invalid = await runs.startRun({
        userId,
        origin: "web",
        collectorId: "feed-items",
        input: { url: "ftp://x" },
      });
      expect(invalid).toMatchObject({ ok: false, reason: "invalid_input" });
      expect(invalid.ok === false && invalid.fieldErrors?.url?.length).toBeTruthy();
      expect((await runs.listRuns(userId)).runs).toHaveLength(0);
    });

    it("queues a run with its version, origin, agent and expiry, then kicks the worker", async () => {
      const userId = await makeUser();
      const { runs, kicks } = facade();
      const result = await runs.startRun({
        userId,
        agentId: "agent-1",
        origin: "mcp",
        collectorId: "feed-items",
        input: feedInput,
      });
      expect(result.ok).toBe(true);
      const view = await runs.getRun(userId, (result as { runId: string }).runId);
      expect(view).toMatchObject({
        collectorId: "feed-items",
        collectorVersion: 1,
        origin: "mcp",
        agentId: "agent-1",
        status: "queued",
        input: feedInput,
        expiresAt: "2026-11-02T12:00:00.000Z",
      });
      expect(kicks).toHaveLength(1);
    });

    it("never lets simultaneous starts pass the active limit", async () => {
      const userId = await makeUser();
      const { runs } = facade();
      const results = await Promise.all(
        Array.from({ length: 4 }, () =>
          runs.startRun({ userId, origin: "web", collectorId: "feed-items", input: feedInput }),
        ),
      );
      expect(results.filter((r) => r.ok)).toHaveLength(2);
      expect(results.filter((r) => !r.ok && r.reason === "quota")).toHaveLength(2);
    });

    it("shows a run only to its owner", async () => {
      const owner = await makeUser();
      const other = await makeUser();
      const id = await insertRun(owner, { collectorId: "feed-items" });
      const { runs } = facade();
      expect(await runs.getRun(owner, id)).not.toBeNull();
      expect(await runs.getRun(other, id)).toBeNull();
      expect(await runs.listItems(other, id)).toBeNull();
      expect(await runs.exportRun(other, id, "csv")).toBeNull();
    });

    it("lists runs newest first with a working cursor", async () => {
      const userId = await makeUser();
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        ids.push(await insertRun(userId, { createdAt: new Date(Date.UTC(2026, 9, 1, i)) }));
      }
      const { runs } = facade();
      const page1 = await runs.listRuns(userId, { limit: 2 });
      expect(page1.runs.map((r) => r.id)).toEqual([ids[2], ids[1]]);
      const page2 = await runs.listRuns(userId, { limit: 2, cursor: page1.nextCursor! });
      expect(page2.runs.map((r) => r.id)).toEqual([ids[0]]);
      expect(page2.nextCursor).toBeNull();
    });

    it("pages items by seq and exports them", async () => {
      const userId = await makeUser();
      const id = await insertRun(userId, { collectorId: "feed-items", status: "succeeded" });
      const row = (n: number) => ({
        title: `T${n}`,
        url: null,
        publishedAt: null,
        author: null,
        summary: n === 1 ? "=HYPERLINK()" : "",
      });
      await m.db.insert(m.schema.collectorItems).values(
        [0, 1, 2].map((seq) => ({ runId: id, seq, data: row(seq) })),
      );
      const { runs } = facade();
      const first = await runs.listItems(userId, id, { limit: 2 });
      expect(first?.items.map((i) => i.title)).toEqual(["T0", "T1"]);
      const second = await runs.listItems(userId, id, { afterSeq: first!.nextSeq!, limit: 2 });
      expect(second).toEqual({ items: [row(2)], nextSeq: null });

      const csv = await runs.exportRun(userId, id, "csv");
      let out = "";
      for await (const chunk of csv!.body) out += chunk;
      expect(out.split("\r\n")[0]).toBe("title,url,publishedAt,author,summary");
      expect(out).toContain("'=HYPERLINK()");
      expect(csv!.filename).toMatch(/^feed-items-[0-9a-f]{8}\.csv$/);
      expect(csv!.contentType).toBe("text/csv; charset=utf-8");
    });

    it("describes collectors in the member's language with a JSON input schema", () => {
      const { runs } = facade();
      const [summary] = runs.listCollectors("nl");
      expect(summary).toMatchObject({
        id: "feed-items",
        kind: "feed",
        title: "Feeditems",
        fields: [{ name: "url", label: "Feedadres" }],
      });
      expect(summary!.inputJsonSchema).toMatchObject({ type: "object" });
    });
  });
```

Add `import { getCollector } from "./catalog";` at the top of the test file (the catalog has no database side effects).

- [ ] **Step 2: Run to verify failure**

Run: `<DB test prefix> pnpm vitest run src/server/collectors/collectors.integration.test.ts`
Expected: FAIL — `./runs` not found.

- [ ] **Step 3: Implement**

```ts
// src/server/collectors/runs.ts
import { and, asc, desc, eq, gt, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { db as appDb } from "@/server/db";
import { collectorItems, collectorRuns } from "@/server/db/schema";

import { allCollectors, columnsOf } from "./catalog";
import type { AnyCollector, FieldHint } from "./collector";
import { EXPORT_FORMATS, type ExportFormatId } from "./export/formats";
import { DEFAULT_QUOTA, type QuotaLimits, canStartRun } from "./quota";
import type { RunStatus, StopReason } from "./run-status";

const RETENTION_MS = 30 * 86_400_000;
const EXPORT_PAGE = 500;

export interface CollectorCatalogPort {
  all(): readonly AnyCollector[];
  get(id: string): AnyCollector | undefined;
}

export interface CollectorRunsDeps {
  db: typeof appDb;
  enabled(): boolean;
  catalog: CollectorCatalogPort;
  /** Best-effort wake of the worker; the per-minute cron is the guarantee. */
  kick(): void;
  now(): Date;
  quota?: QuotaLimits;
}

export type StartRunResult =
  | { ok: true; runId: string }
  | {
      ok: false;
      reason: "disabled" | "unknown_collector" | "invalid_input" | "quota";
      message: string;
      fieldErrors?: Record<string, string[]>;
    };

export type RunView = {
  id: string;
  collectorId: string;
  collectorVersion: number;
  origin: "web" | "mcp";
  agentId: string | null;
  status: RunStatus;
  stopReason: StopReason | null;
  input: unknown;
  pagesFetched: number;
  bytesFetched: number;
  itemCount: number;
  invalidItemCount: number;
  durationMs: number | null;
  error: string | null;
  log: string[];
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  expiresAt: string;
};

export type CollectorSummary = {
  id: string;
  kind: AnyCollector["kind"];
  title: string;
  description: string;
  fields: { name: string; label: string; help: string | null; placeholder: string | null }[];
  inputJsonSchema: unknown;
  sampleItem: Record<string, unknown>;
  limits: AnyCollector["limits"];
};

type RunRow = typeof collectorRuns.$inferSelect;

function toView(row: RunRow): RunView {
  return {
    id: row.id,
    collectorId: row.collectorId,
    collectorVersion: row.collectorVersion,
    origin: row.origin,
    agentId: row.agentId,
    status: row.status,
    stopReason: row.stopReason,
    input: row.input,
    pagesFetched: row.pagesFetched,
    bytesFetched: row.bytesFetched,
    itemCount: row.itemCount,
    invalidItemCount: row.invalidItemCount,
    durationMs: row.durationMs,
    error: row.error,
    log: row.log,
    createdAt: row.createdAt.toISOString(),
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    expiresAt: row.expiresAt.toISOString(),
  };
}

function encodeCursor(row: RunRow): string {
  return `${row.createdAt.toISOString()}_${row.id}`;
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  const at = cursor.indexOf("_");
  if (at === -1) return null;
  const createdAt = new Date(cursor.slice(0, at));
  return Number.isNaN(createdAt.getTime()) ? null : { createdAt, id: cursor.slice(at + 1) };
}

/**
 * The one entry point for data collectors (Facade). The web UI (tRPC) and
 * the member's agent (MCP) both call this, so they cannot behave differently.
 * Every read is scoped to the owner; another member's run is "not found".
 */
export function createCollectorRuns(deps: CollectorRunsDeps) {
  const { db } = deps;
  const quota = deps.quota ?? DEFAULT_QUOTA;

  async function ownedRun(userId: string, runId: string): Promise<RunRow | null> {
    const [row] = await db
      .select()
      .from(collectorRuns)
      .where(and(eq(collectorRuns.id, runId), eq(collectorRuns.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async function* iterateItems(runId: string): AsyncIterable<Record<string, unknown>> {
    let after = -1;
    for (;;) {
      const page = await db
        .select({ seq: collectorItems.seq, data: collectorItems.data })
        .from(collectorItems)
        .where(and(eq(collectorItems.runId, runId), gt(collectorItems.seq, after)))
        .orderBy(asc(collectorItems.seq))
        .limit(EXPORT_PAGE);
      for (const item of page) yield item.data;
      if (page.length < EXPORT_PAGE) return;
      after = page[page.length - 1]!.seq;
    }
  }

  return {
    listCollectors(locale: "en" | "nl"): CollectorSummary[] {
      return deps.catalog.all().map((c) => ({
        id: c.id,
        kind: c.kind,
        title: c.title[locale],
        description: c.description[locale],
        fields: Object.entries(
          c.fieldHints as Record<string, FieldHint>,
        ).map(([name, hint]) => ({
          name,
          label: hint.label[locale],
          help: hint.help?.[locale] ?? null,
          placeholder: hint.placeholder ?? null,
        })),
        inputJsonSchema: z.toJSONSchema(c.inputSchema),
        sampleItem: c.sampleItem,
        limits: c.limits,
      }));
    },

    async startRun(args: {
      userId: string;
      agentId?: string | null;
      origin: "web" | "mcp";
      collectorId: string;
      input: unknown;
    }): Promise<StartRunResult> {
      if (!deps.enabled()) {
        return { ok: false, reason: "disabled", message: "Data collectors are not available." };
      }
      const collector = deps.catalog.get(args.collectorId);
      if (!collector) {
        return { ok: false, reason: "unknown_collector", message: "This collector does not exist." };
      }
      const parsed = collector.inputSchema.safeParse(args.input);
      if (!parsed.success) {
        return {
          ok: false,
          reason: "invalid_input",
          message: "Some fields need attention.",
          fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
        };
      }
      const now = deps.now();
      const result = await db.transaction(async (tx): Promise<StartRunResult> => {
        // Serialise starts per member so two at once cannot both pass the quota.
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${`collector-quota:${args.userId}`}))`,
        );
        const decision = await canStartRun(tx, args.userId, now, quota);
        if (!decision.allowed) {
          return { ok: false, reason: "quota", message: decision.message };
        }
        const [row] = await tx
          .insert(collectorRuns)
          .values({
            userId: args.userId,
            agentId: args.agentId ?? null,
            origin: args.origin,
            collectorId: collector.id,
            collectorVersion: collector.version,
            input: parsed.data,
            status: "queued",
            createdAt: now,
            expiresAt: new Date(now.getTime() + RETENTION_MS),
          })
          .returning({ id: collectorRuns.id });
        return { ok: true, runId: row!.id };
      });
      if (result.ok) deps.kick();
      return result;
    },

    async getRun(userId: string, runId: string): Promise<RunView | null> {
      const row = await ownedRun(userId, runId);
      return row ? toView(row) : null;
    },

    async listRuns(
      userId: string,
      opts: { cursor?: string; limit?: number } = {},
    ): Promise<{ runs: RunView[]; nextCursor: string | null }> {
      const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
      const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;
      const rows = await db
        .select()
        .from(collectorRuns)
        .where(
          and(
            eq(collectorRuns.userId, userId),
            cursor
              ? or(
                  lt(collectorRuns.createdAt, cursor.createdAt),
                  and(eq(collectorRuns.createdAt, cursor.createdAt), lt(collectorRuns.id, cursor.id)),
                )
              : undefined,
          ),
        )
        .orderBy(desc(collectorRuns.createdAt), desc(collectorRuns.id))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      return {
        runs: page.map(toView),
        nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]!) : null,
      };
    },

    async listItems(
      userId: string,
      runId: string,
      opts: { afterSeq?: number; limit?: number } = {},
    ): Promise<{ items: Record<string, unknown>[]; nextSeq: number | null } | null> {
      if (!(await ownedRun(userId, runId))) return null;
      const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
      const rows = await db
        .select({ seq: collectorItems.seq, data: collectorItems.data })
        .from(collectorItems)
        .where(and(eq(collectorItems.runId, runId), gt(collectorItems.seq, opts.afterSeq ?? -1)))
        .orderBy(asc(collectorItems.seq))
        .limit(limit + 1);
      const page = rows.slice(0, limit);
      return {
        items: page.map((r) => r.data),
        nextSeq: rows.length > limit ? page[page.length - 1]!.seq : null,
      };
    },

    async exportRun(
      userId: string,
      runId: string,
      format: ExportFormatId,
    ): Promise<{ filename: string; contentType: string; body: AsyncIterable<string> } | null> {
      const run = await ownedRun(userId, runId);
      if (!run) return null;
      // Export still works if the collector was switched off since.
      const collector = allCollectors().find((c) => c.id === run.collectorId);
      const formatter = EXPORT_FORMATS[format];
      return {
        filename: `${run.collectorId}-${run.id.slice(0, 8)}.${formatter.extension}`,
        contentType: formatter.contentType,
        body: formatter.write(iterateItems(run.id), collector ? columnsOf(collector) : null),
      };
    },
  };
}

export type CollectorRuns = ReturnType<typeof createCollectorRuns>;
```

Note: run ids are UUIDs, so `run.id.slice(0, 8)` is 8 hex characters, as the test expects.

```ts
// src/server/collectors/kick.ts
import { after } from "next/server";

import { env } from "@/env";

function workerUrl(): string | null {
  const base = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : env.NEXT_PUBLIC_APP_URL;
  return base ? `${base}/api/cron/collector-worker` : null;
}

/**
 * Wake the worker right after a run is queued, after the response is sent.
 * Best effort: the worker answers 202 at once and works in its own after(),
 * so this short timeout never cuts a run. The per-minute cron is the
 * guarantee (same shape as server/agent/dispatch-immediate.ts).
 */
export function kickCollectorWorker(): void {
  const secret = process.env.CRON_SECRET;
  const url = workerUrl();
  if (!secret || !url) return;
  after(async () => {
    try {
      await fetch(url, {
        method: "POST",
        headers: { authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(2_000),
      });
    } catch {
      // The cron picks the run up within a minute.
    }
  });
}
```

```ts
// src/server/collectors/live.ts
import { db } from "@/server/db";

import { allCollectors, getCollector } from "./catalog";
import { buildLiveContext } from "./context/live";
import type { ExecutorDeps } from "./executor";
import { collectorsEnabled, disabledCollectorIds } from "./flags";
import { kickCollectorWorker } from "./kick";
import { createCollectorRuns } from "./runs";

/** Composition root: the real facade (for tRPC in slice 2, MCP in slice 4). */
export function liveCollectorRuns() {
  return createCollectorRuns({
    db,
    enabled: collectorsEnabled,
    catalog: {
      all: () => {
        const disabled = disabledCollectorIds();
        return allCollectors().filter((c) => !disabled.has(c.id));
      },
      get: (id) => getCollector(id, disabledCollectorIds()),
    },
    kick: kickCollectorWorker,
    now: () => new Date(),
  });
}

/** Composition root: the real executor dependencies for the worker route. */
export function liveExecutorDeps(): ExecutorDeps {
  return {
    db,
    getCollector: (id) => getCollector(id, disabledCollectorIds()),
    buildContext: (args) => buildLiveContext({ db, ...args }),
    now: Date.now,
  };
}
```

- [ ] **Step 4: Run tests**

Run: `<DB test prefix> pnpm vitest run src/server/collectors`
Expected: PASS, integration suite executed.

- [ ] **Step 5: Lint, typecheck, commit**

Run: `pnpm exec eslint src/server/collectors && pnpm typecheck`

```bash
git branch --show-current   # must print feat/data-collectors-core
git add src/server/collectors/runs.ts src/server/collectors/kick.ts src/server/collectors/live.ts src/server/collectors/collectors.integration.test.ts
git commit -m "Collectors: CollectorRuns facade with owner scoping, race-safe quota, export"
```

---

### Task 10: Worker route, cron, and full verification

**Files:**
- Create: `src/app/api/cron/collector-worker/route.ts`, `src/app/api/cron/collector-worker/route.test.ts`
- Modify: `vercel.json`

**Interfaces:**
- Consumes: `runWorkerTick` (Task 7), `liveExecutorDeps` (Task 9), `collectorsEnabled` (Task 3).
- Produces: `GET` (Vercel cron, runs the tick and answers with its result) and `POST` (kick: answers 202, runs the tick in `after()`).

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/api/cron/collector-worker/route.test.ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runWorkerTick = vi.fn();
const collectorsEnabled = vi.fn();
const afterCallbacks: (() => Promise<void>)[] = [];

vi.mock("@/server/collectors/executor", () => ({ runWorkerTick }));
vi.mock("@/server/collectors/live", () => ({ liveExecutorDeps: () => ({}) }));
vi.mock("@/server/collectors/flags", () => ({ collectorsEnabled }));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => Promise<void>) => {
    afterCallbacks.push(cb);
  },
}));

import { GET, POST } from "./route";

function req(method: string, auth?: string) {
  return new Request("https://x.test/api/cron/collector-worker", {
    method,
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  afterCallbacks.length = 0;
  vi.stubEnv("CRON_SECRET", "s3cret");
  collectorsEnabled.mockReturnValue(true);
  runWorkerTick.mockResolvedValue({ executed: 2 });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("collector worker route", () => {
  it("refuses a missing or wrong secret", async () => {
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await GET(req("GET", "Bearer nope"))).status).toBe(401);
    expect(runWorkerTick).not.toHaveBeenCalled();
  });

  it("refuses everyone when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await GET(req("GET", "Bearer "))).status).toBe(401);
    expect((await GET(req("GET", "Bearer undefined"))).status).toBe(401);
    expect((await POST(req("POST", "Bearer undefined"))).status).toBe(401);
  });

  it("does nothing while the feature is off", async () => {
    collectorsEnabled.mockReturnValue(false);
    const res = await GET(req("GET", "Bearer s3cret"));
    expect(await res.json()).toMatchObject({ skipped: "collectors off" });
    expect(runWorkerTick).not.toHaveBeenCalled();
  });

  it("GET runs a tick and reports it", async () => {
    const res = await GET(req("GET", "Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ success: true, executed: 2 });
  });

  it("GET reports a failed tick as 500", async () => {
    runWorkerTick.mockRejectedValue(new Error("db down"));
    expect((await GET(req("GET", "Bearer s3cret"))).status).toBe(500);
  });

  it("POST answers at once and runs the tick after the response", async () => {
    const res = await POST(req("POST", "Bearer s3cret"));
    expect(res.status).toBe(202);
    expect(runWorkerTick).not.toHaveBeenCalled();
    await afterCallbacks[0]!();
    expect(runWorkerTick).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/app/api/cron/collector-worker`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Implement**

```ts
// src/app/api/cron/collector-worker/route.ts
import { NextResponse, after } from "next/server";

import { runWorkerTick } from "@/server/collectors/executor";
import { collectorsEnabled } from "@/server/collectors/flags";
import { liveExecutorDeps } from "@/server/collectors/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Only callers holding CRON_SECRET; an unset secret refuses everyone. */
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}

/**
 * Data-collector worker (ADR-0040). The Vercel cron calls GET every minute
 * and is the guarantee that queued runs execute; GET waits for the tick.
 * POST is the best-effort kick sent right after a run is queued: it answers
 * 202 at once and works in after(), so the kicker's short timeout never
 * cancels a run.
 */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!collectorsEnabled()) {
    return NextResponse.json({ skipped: "collectors off" });
  }
  try {
    const result = await runWorkerTick(liveExecutorDeps());
    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[collector-worker] tick failed", err);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!collectorsEnabled()) {
    return NextResponse.json({ skipped: "collectors off" });
  }
  after(async () => {
    try {
      await runWorkerTick(liveExecutorDeps());
    } catch (err) {
      console.error("[collector-worker] kicked tick failed", err);
    }
  });
  return NextResponse.json({ accepted: true }, { status: 202 });
}
```

In `vercel.json`, add to the `crons` array after the `webhook-dispatch` entry:

```json
    {
      "path": "/api/cron/collector-worker",
      "schedule": "* * * * *"
    },
```

- [ ] **Step 4: Run the route tests**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/app/api/cron/collector-worker`
Expected: PASS.

- [ ] **Step 5: Commit, then verify the whole branch**

```bash
git branch --show-current   # must print feat/data-collectors-core
git add src/app/api/cron/collector-worker/route.ts src/app/api/cron/collector-worker/route.test.ts vercel.json
git commit -m "Collectors: worker route (cron + kick) behind the feature flag"
```

Then, on the committed tree:

Run: `git status --short`
Expected: empty.

Run: `pnpm check`
Expected: lint and typecheck pass.

Run: `SKIP_ENV_VALIDATION=1 pnpm test`
Expected: the full suite passes (DB suites skip without `RUN_DB_TESTS`).

Run: `<DB test prefix> pnpm vitest run src/server/collectors src/migrations/collector-runs.integration.test.ts`
Expected: PASS with the integration suites executed, not skipped.

Run (CI parity, Node 20): `SKIP_ENV_VALIDATION=true npx -y -p node@20 node node_modules/vitest/vitest.mjs run src/server/collectors src/server/net src/app/api/cron/collector-worker`
Expected: PASS.

Report any failure with its output; do not push on red.

---

## Spec coverage (self-review)

| Spec section | Task |
|---|---|
| Collector (Strategy) interface, boundary enforcement | 2, 4 |
| CollectorContext (Proxy): budget, blocklist, robots, per-site limit, safeFetch, body cap, back-off, metering | 1, 5 |
| `safeFetch` extension (accept, error status) + redirect-return | 1 |
| Catalog, per-collector disable, EN/NL completeness | 4 |
| RunExecutor: claim/lease, attempts, batching, time budget, errors | 7 |
| Run lifecycle + stop reasons | 2, 7 |
| CollectorRuns facade, owner scoping, kick | 9 |
| Quota (DB-counted, race-safe) | 6, 9 |
| Export (CSV formula-safe, JSON) | 8, 9 |
| Data model (3 tables, indexes, checks) | 3 |
| Feature flag | 3, 9, 10 |
| `feed-items` collector | 4 |
| Worker route + cron | 10 |
| Slices 2–5 (UI incl. about page, more collectors, MCP, retention + blocklist admin) | out of this plan |
