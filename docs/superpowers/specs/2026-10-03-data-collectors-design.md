# Data collectors — design

**Status:** proposed
**Date:** 2026-10-03
**Decision record:** [ADR-0040](../../adr/0040-data-collectors-are-built-in-strategies-run-from-a-queued-command.md)

## Goal

Members can collect structured data from the web for their own research —
"all repositories of this GitHub org", "the last 200 items of this feed",
"the speaker list on this conference page" — without writing code or running
anything themselves. They pick a **data collector**, fill a short form, and get
a table they can view and download. Their own agent can do the same through MCP.

This is deliberately a small core. What makes it ours, and different from a
general scraping platform:

- **Reviewed collectors only.** Every collector is code in this repository that
  passed review. No member-supplied code runs on our infrastructure in v1.
- **A polite visitor by construction.** robots.txt, a shared per-site rate
  limit, honest identification and a public opt-out are enforced in one place
  that collectors cannot bypass.
- **Raw data in, member's agent does the thinking.** We fetch and structure;
  analysis belongs to the member or their own agent, consistent with the
  platform's agent-boundary principle (ADR-0017, ADR-0023).
- **Built for the next change.** The structure leaves named seams for paid
  usage, commissioned collectors, an isolated runner and longer runs, so each
  arrives as an addition rather than a rewrite.

## Scope

**In v1**

- Collector catalog in code with three collectors:
  - `github-org-repos` — repositories of a GitHub organisation (public REST API).
  - `feed-items` — items of an RSS or Atom feed.
  - `page-list` — a generic list-page collector: URL + CSS selectors for the
    item, its fields, and an optional next-page link.
- Queued runs executed by a worker; results stored as a dataset of rows.
- Member UI in the dashboard: collector list, start-run form, run page with
  preview and CSV/JSON download, run history.
- MCP tools for the member's agent under a new `collect` scope.
- Safety: https only, SSRF guard, robots.txt, shared per-site rate limit,
  budgets, quota, domain blocklist, feature flag, per-collector disable.
- Public page for site owners explaining our visitor and how to opt out.
- 30-day retention.

**Out of v1 (each has a named seam, see "Extension seams")**

- JavaScript-rendered sites (headless browser).
- Pages behind a login; user-supplied cookies or headers.
- Member-written collector code (requires an isolated runner).
- Runs longer than one worker invocation (~4 minutes).
- Sharing datasets with a community or the feed.
- Payments, credits, plans; commissioned collectors.
- Migrating the existing fetchers (`server/startups/scan-jobs.ts`,
  `server/events/discovery/`, `server/events/import-from-url.ts`) onto this
  core. They are a good fit later and a useful test of the core's generality,
  but moving them is not required to ship.

## Architecture

```
 Web UI (tRPC)        MCP tools (collect scope)
        \                 /
         \               /
       CollectorRuns  (Facade — application service)
        |        |          \
  canStartRun  catalog     collector_run / collector_item  (storage)
  (quota        (Client:          ^
   policy)       picks a          |
                 Strategy)        |
                                  |
   Worker route ──> RunExecutor (Context) ──> Collector.run(input, ctx)  (Strategy)
   (cron + kick)        |                          |  yields rows (Iterator)
                        |                          v
                        └──── saves rows ◄── CollectorContext  (Protection Proxy)
                                                   |
                                     robots · per-site limit · budgets ·
                                     blocklist · safeFetch · readBodyCapped
```

### Pattern map

Checked against the refactoring.guru catalog. Each pattern is used where its
stated intent matches the problem; two tempting patterns are rejected on the
catalog's own guidance.

| Unit | Pattern | Role and reason |
|---|---|---|
| `Collector` interface and each collector | **Strategy** | A family of interchangeable algorithms behind one interface. `RunExecutor` is the *Context*: it knows only the interface. Adding a collector adds a *ConcreteStrategy*; nothing else changes. |
| Collector catalog | — (the Strategy *Client*) | A typed list in code that resolves `collectorId` → strategy, same approach as the badge catalog (ADR-0039). Not presented as a pattern. |
| `collector_run` row | **Command** | A request turned into a stand-alone object holding everything needed to execute it, so it can be queued, scheduled, and executed elsewhere. The worker, and any future runner, consumes the stored command. |
| `CollectorContext` | **Proxy** (protection) | Same interface as a fetch; enforces access rules before delegating. Chosen over Decorator because the composition must be controlled by the platform, not by the client — a collector must not be able to omit a safety layer. |
| `Collector.run()` as an async generator | **Iterator** | Rows are traversed without exposing pagination, cursors or feed pages. The executor loops and saves in batches. |
| `CollectorRuns` service | **Facade** | One simple entry point used by both tRPC and MCP, so the two surfaces cannot diverge. |
| Export formatters (CSV, JSON) | **Strategy** | One formatter per format; a new format is one more formatter. |

**Rejected:**

- **State** for the run lifecycle. Four states with few transitions; the
  catalog notes the pattern "can be overkill if a state machine has only a few
  states or rarely changes". A transition table with one guard function is the
  right size. Revisit if pause/resume/retry states appear.
- **Template Method** for shared pagination/parsing. It relies on inheritance
  and grows hard to maintain as steps accumulate. Shared behaviour is provided
  as composable helpers (`paginate`, `selectAll`, `parseFeed`) that collectors
  call — composition, consistent with Strategy.

### Module layout

```
src/server/collectors/
  collector.ts            Collector interface, CollectorContext type, limits types
  catalog.ts              typed catalog: id → Collector (Client)
  collectors/
    github-org-repos.ts
    feed-items.ts
    page-list.ts
  helpers/                composable helpers used by collectors (no base class)
    paginate.ts
    html.ts               CSS-selector extraction
    feed.ts               RSS/Atom parsing
  context/                the Proxy and its rules
    collector-context.ts  builds the ctx a collector receives
    robots.ts             robots.txt fetch + check, cached per run
    site-rate-limit.ts    shared per-site limit (Upstash Redis)
    blocklist.ts          opted-out domains
  run-status.ts           transition table + guard
  executor.ts             RunExecutor (Context of the Strategy)
  runs.ts                 CollectorRuns facade
  quota.ts                canStartRun(user) policy
  export/
    csv.ts                formula-injection-safe CSV
    json.ts
src/app/api/cron/collector-worker/route.ts
src/app/api/mcp/collector-tools.ts
src/server/api/routers/collectors.ts
src/app/[locale]/dashboard/(member)/collectors/...
src/app/[locale]/collectors/about/page.tsx
```

## Units

### Collector (Strategy)

```ts
interface Collector<I, R> {
  id: string;                    // stable, e.g. "github-org-repos"
  version: number;               // bumped on behaviour change
  author: "platform";            // marketplace seam; widened later
  kind: "api" | "feed" | "page";
  title: LocalizedText;          // EN + NL
  description: LocalizedText;
  inputSchema: z.ZodType<I>;     // validated before a run is stored
  itemSchema: z.ZodType<R>;      // every yielded row is validated
  fieldHints: FieldHints<I>;     // labels, help text, placeholders for the form
  sampleItem: R;                 // shown in the catalog
  limits: { maxPages: number; maxItems: number; maxDurationMs: number };
  run(input: I, ctx: CollectorContext): AsyncIterable<R>;
}
```

- A collector receives **only** `input` and `ctx`. No database handle, no
  environment, no raw `fetch`. Enforced by convention plus an ESLint
  `no-restricted-imports` / `no-restricted-globals` rule scoped to
  `src/server/collectors/collectors/**` and `helpers/**`.
- Input and item schemas are converted to JSON Schema with Zod 4's
  `z.toJSONSchema` for the MCP tool description and the generated form.
- Every catalog entry must have EN and NL text; a unit test enforces it, like
  the badge catalog.

### CollectorContext (Proxy)

```ts
interface CollectorContext {
  fetch(url: string, opts?: { accept?: string }): Promise<CollectorResponse>;
  log(message: string): void;    // capped, user-visible
  signal: AbortSignal;           // aborts on time budget or cancellation
}
interface CollectorResponse {
  url: string; status: number; headers: Headers;
  text(): Promise<string>; json(): Promise<unknown>;
}
```

**Collectors are https-only.** Input schemas accept only `https` addresses and
the context refuses any other scheme ("Only https addresses can be
collected."), since the SSRF guard in `safeFetch` refuses plain `http` anyway.

Every request hop runs these checks in order, then delegates. **Redirects
are followed by the context, not by `safeFetch`**, so a redirect into an
opted-out site or a robots-disallowed path is caught before it is requested
(max 5 hops, each counted as a page):

1. **Run budget.** Page count < `maxPages`, time left, signal not aborted.
2. **Blocklist.** Host is not on the opted-out list.
3. **robots.txt.** Fetched once per origin per run (through `safeFetch`),
   cached for the run, checked for our user agent. The robots.txt request
   obeys the same rules as a page: it is made only after the run budget check
   (a run that has spent its budget never fetches robots.txt for a new site);
   it takes the shared per-site rate-limit slot for its host; it follows
   redirects itself (max 5 hops) and never contacts an opted-out site on any
   hop (such a redirect counts as disallowed); its bytes are added to
   `bytes_fetched` (not to `pages_fetched`). Outcomes: rules (2xx) decide per
   page; a missing robots.txt (4xx) allows everything; anything else (5xx, a
   redirect left after 5 hops, timeout, network error, SSRF guard refusal)
   ends the run `failed` with `stop_reason = 'robots_unreachable'` — we do not
   guess either way.
4. **Shared per-site rate limit.** At most 1 request per second per host
   **across all runs and instances**, via Upstash Redis (already used in
   `server/inbox/publish.ts`). The context waits for its slot rather than
   failing.
5. **`safeFetch`** with the SSRF guard on every redirect hop; body read through
   `readBodyCapped` (5 MB per response).
6. **Back-off.** On 429/503, honour `Retry-After` (capped by remaining
   budget); after 3 consecutive back-offs on a host the run stops with
   `stop_reason = 'site_refused'`.

Counters (`pages_fetched`, `bytes_fetched`) are incremented here, so metering
cannot be skipped by a collector. robots.txt bytes count; robots.txt requests
are not pages.

**Required change to `src/server/net/safe-fetch.ts`** (extend, not fork):

- an optional `accept` header (today it is fixed to HTML/image types);
- an option to return non-2xx responses to the caller instead of throwing, so
  the context can see 429/503 and robots.txt 404;
- `redirects: "return"`, handing a 3xx back so the context can apply its
  per-hop rules;
- an optional `signal`, so the run's time budget aborts an in-flight request.

Existing callers keep the current default behaviour.

User agent: `aitcom-collector/1.0 (+https://<site>/collectors/about)`.

### Collector catalog (Client)

`catalog.ts` exports a readonly map of collectors and `getCollector(id)`.
Each collector can be disabled through `COLLECTORS_DISABLED` (comma-separated
ids) without a deploy of code changes.

### RunExecutor (Context)

```
claim run (lease) → resolve collector by id (the version that actually ran
is written back to the run) → re-validate input
→ build ctx → for await (row of collector.run(input, ctx)):
     validate row against itemSchema (invalid rows are counted and skipped)
     buffer; flush every 100 rows (collector_item insert + counters update)
     stop at maxItems
→ finish: status succeeded|failed, stop_reason, finished_at
```

- **Claiming** uses one atomic statement:
  `UPDATE … SET status='running', lease_until=now()+5min, started_at=now()
   WHERE id = (SELECT id FROM app.collector_run WHERE status='queued'
   OR (status='running' AND lease_until < now())
   ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`.
  An expired lease means the worker died; the run is re-claimed. Rows and the
  item counters (`item_count`, `invalid_item_count`) from the earlier attempt
  are reset before re-running (a run's dataset is all-or-nothing per attempt;
  resumable runs are a later seam). `pages_fetched` and `bytes_fetched` are
  **cumulative across attempts**: they measure real traffic, which an
  interrupted attempt still caused.
- **Fencing.** Every write matches on `attempts`, so a worker whose lease
  expired and whose run was re-claimed writes nothing. A worker that is
  already fenced out when it starts returns without running the collector, so
  it never contacts a site.
- **Attempts** are counted; after 2 failed attempts the run is `failed` with
  `stop_reason = 'worker_lost'`.
- **Time budget.** The worker route has `maxDuration = 300`; a run's effective
  budget is `min(collector.limits.maxDurationMs, 240_000)`. Exceeding it ends
  the run as `succeeded` with `stop_reason = 'time_limit'` (partial, honest).
- **Errors.** A thrown error inside a collector ends the run `failed` with a
  user-safe message mapped from known error kinds; the raw error goes to the
  server log only. The stored message is cut to 500 characters (the column
  size).

### Run lifecycle (`run-status.ts`)

| From | To | When |
|---|---|---|
| — | `queued` | `startRun` accepted |
| `queued` | `running` | worker claims |
| `running` | `running` | lease expired, re-claimed (attempt + 1) |
| `running` | `succeeded` | iterator ended, or a budget stopped it |
| `running` | `failed` | error, site refused, or attempts exhausted |

`assertTransition(from, to)` is the only way status changes.

`stop_reason`: `complete | page_limit | item_limit | time_limit |
site_refused | robots_disallowed | robots_unreachable | blocked_domain |
error | worker_lost`.

### CollectorRuns (Facade)

```ts
listCollectors(locale)
startRun({ userId, agentId?, origin, collectorId, input })  // → runId
getRun({ userId, runId })
listRuns({ userId, cursor })
listItems({ userId, runId, cursor, limit })                 // paged by seq
exportRun({ userId, runId, format: "csv" | "json" })        // streamed
```

- Every read is scoped to `user_id`; another member's run id returns
  not-found, never forbidden (no existence leak).
- `startRun`: feature flag on → collector exists and is enabled → input parses
  → inside one transaction holding a per-member advisory lock,
  `canStartRun` allows → insert `queued` row → kick the worker. The lock stops
  two simultaneous starts (a double click, or a member and their agent) from
  both passing the quota.
- **Kick:** inside `after()`, a fire-and-forget authenticated POST to the worker
  route (2-second timeout, errors swallowed). The per-minute cron is the
  guarantee; the kick only cuts latency. Same shape as
  `server/agent/dispatch-immediate.ts`. A kick that throws is logged and never
  turns a committed start into an error. Target: the production domain in
  production, else the deployment URL, else `NEXT_PUBLIC_APP_URL`.

### Quota policy (`quota.ts`)

`canStartRun(user): { allowed: true } | { allowed: false; reason; retryAt? }`

v1 rules, counted from the database (authoritative across instances; the
in-memory `createPerUserLimit` is per-instance and not suitable for a daily
quota):

- at most **20 runs per rolling 24 hours** per user (agent runs count against
  the owner);
- at most **2 active** (`queued` or `running`) runs per user;
- at most **10 active runs** platform-wide.

Numbers are constants in `quota.ts`, tuned after launch. A `daily_limit`
refusal carries `retryAt`: when the run that leaves the 24-hour window first
(the oldest one, when the member is exactly at the limit) is 24 hours old.
The facade passes it on as an ISO 8601 string. Other refusals have none.

### Export (Strategy)

- `csv`: header from the item schema's keys; nested values JSON-encoded; any
  cell starting with `=`, `+`, `-`, `@`, tab or carriage return is prefixed
  with `'` (spreadsheet formula injection).
- `json`: an array of row objects.
- Both stream from `collector_item` ordered by `seq`.

## Data model

New tables in the `app` schema, via a hand-written Payload migration
(`src/migrations/<yyyymmdd><letter>_collector_runs.ts`, dated when written) and matching Drizzle
definitions in `src/server/db/schema.ts`. Not Payload collections: item volume
is high and nothing needs the admin UI.

**`app.collector_run`**

| Column | Type | Notes |
|---|---|---|
| `id` | varchar(255) PK | |
| `user_id` | varchar(255) NOT NULL → `app.user` ON DELETE CASCADE | owner |
| `agent_id` | varchar(255) NULL | set when started through MCP |
| `origin` | varchar(16) NOT NULL | `web` \| `mcp` |
| `collector_id` | varchar(64) NOT NULL | catalog id |
| `collector_version` | integer NOT NULL | |
| `input` | jsonb NOT NULL | validated input |
| `status` | varchar(16) NOT NULL | `queued` \| `running` \| `succeeded` \| `failed` |
| `stop_reason` | varchar(32) NULL | set on finish |
| `attempts` | integer NOT NULL DEFAULT 0 | |
| `lease_until` | timestamptz NULL | worker lease |
| `pages_fetched` | integer NOT NULL DEFAULT 0 | metering |
| `bytes_fetched` | bigint NOT NULL DEFAULT 0 | metering |
| `item_count` | integer NOT NULL DEFAULT 0 | |
| `invalid_item_count` | integer NOT NULL DEFAULT 0 | rows rejected by item schema |
| `duration_ms` | integer NULL | |
| `error` | varchar(500) NULL | user-safe message |
| `log` | jsonb NOT NULL DEFAULT '[]' | last 50 lines |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |
| `started_at`, `finished_at` | timestamptz NULL | |
| `expires_at` | timestamptz NOT NULL | created_at + 30 days |

Indexes: `(user_id, created_at DESC)` for history and quota;
`(status, created_at)` for claiming; `(expires_at)` for cleanup.

**`app.collector_item`**

| Column | Type | Notes |
|---|---|---|
| `run_id` | varchar(255) NOT NULL → `collector_run` ON DELETE CASCADE | |
| `seq` | integer NOT NULL | 0-based order |
| `data` | jsonb NOT NULL | validated row |

Primary key `(run_id, seq)`. Hard cap: 5,000 rows per run (also bounded by
each collector's `maxItems`).

**`app.collector_blocked_domain`**

| Column | Type | Notes |
|---|---|---|
| `domain` | varchar(255) PK | registrable domain, lower-case |
| `reason` | varchar(200) NOT NULL | |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

A blocked domain also blocks its subdomains. Managed by Hub operators (a small
tRPC procedure guarded by `requireHubOperator`; no public form in v1 — the
about page gives an email address).

**Retention.** The existing `video-uploads-cleanup`-style daily cron gets a
sibling, `collector-runs-cleanup`, deleting runs past `expires_at` (items
cascade).

## Collectors in v1

**`github-org-repos`** (`api`). Input: `org` (GitHub login), optional
`includeForks`. Uses the public REST API, paginated via the `Link` header;
uses `GITHUB_TOKEN` when set (as `server/awesome-ai-oss/refresh-stars.ts` does), otherwise
unauthenticated (60 requests/hour — `maxPages` set accordingly). Row: name,
url, description, language, stars, forks, topics, pushedAt, archived.

**`feed-items`** (`feed`). Input: feed URL (https only). Accepts RSS 2.0 and
Atom.
Row: title, url, publishedAt, author, summary (plain text, HTML stripped).
One page only (`maxPages = 1`).

**`page-list`** (`page`). Input: `url`, `itemSelector`, `fields` (1–20 of
`{ name, selector, attribute? }`), optional `nextPageSelector`,
`maxPages` (≤ 20). Selectors are validated for length (≤ 200 chars) and parsed
before the run is stored; they are data, never code. Row: an object with the
requested field names, values as trimmed text or the requested attribute,
relative URLs resolved against the page URL.

New dependencies (final choice in the implementation plan, smallest
maintained option):

- an HTML parser with CSS selectors (e.g. `cheerio` or `node-html-parser`);
- an XML/feed parser (e.g. `fast-xml-parser`);
- a robots.txt parser (e.g. `robots-parser`).

## Surfaces

### Member UI

A member-only tab in the dashboard (`/dashboard/collectors`, hard-gated like
the other dashboard pages). User-facing name: **Data collector**.

1. **Collectors** — a quiet list (not a card grid): title, one-line
   description, kind as a neutral badge, sample row on expand.
2. **Start a run** — form generated from `inputSchema` + `fieldHints`
   (one generic renderer; adding a collector needs no UI code). First use shows
   a short acceptable-use note (own research, respect site terms, avoid
   personal data) that the member acknowledges once. **Start run** is the one
   Signal Orange action.
3. **Run page** — status with icon + label (semantic tokens), counts, stop
   reason in plain words ("Stopped after 20 pages — the page limit"), a paged
   table preview, **Download CSV** / **Download JSON**, collapsible log. Polls
   every 3 seconds while `queued`/`running`, then stops.
4. **My runs** — history with status, row count, expiry as `<RelativeTime>`.

All data views implement the three data states (`<Skeleton>`,
`<ErrorState onRetry>`, `<EmptyState>`); empty history teaches the next action.
EN + NL strings.

### Public page for site owners

`/collectors/about`: what the visitor is, that it respects robots.txt and a
1-request-per-second limit, the exact user-agent string, how to block it with
robots.txt, and an email address for opt-out (added to the blocklist).

### MCP tools (`src/app/api/mcp/collector-tools.ts`)

New scope **`collect`**, granted like the existing scopes and listed in the
tool catalog. Tools call the `CollectorRuns` facade with `ownerId` as the user
and `agentId` set:

- `list-collectors` — ids, descriptions, input JSON Schemas.
- `start-collector-run` — `{ collectorId, input }` → `{ runId }`.
- `get-collector-run` — status, counts, stop reason, error.
- `get-collector-items` — `{ runId, cursor?, limit ≤ 200 }` → rows + next cursor.

Run activity is visible only to the owner; no events are emitted to other
agents.

## Feature flag and kill switches

- `FEATURE_COLLECTORS` (server) and `NEXT_PUBLIC_FEATURE_COLLECTORS` (UI) —
  off by default. When off: tab hidden, `startRun` refused, worker no-ops, MCP
  tools return a clear "not available" error. Deleted once the feature is final.
- `COLLECTORS_DISABLED` — per-collector disable.
- `collector_blocked_domain` — per-site opt-out.

**Gate before enabling.** `FEATURE_COLLECTORS` must not be turned on, and
`page-list` must not ship, until `safeFetch` pins each connection to the IP
address it validated. Today the SSRF guard resolves DNS to check the address
and `fetch()` resolves it again, leaving the DNS-rebinding window documented
in `src/server/net/safe-fetch.ts`. Data collectors let members point our
servers at arbitrary sites, a broader exposure than the callers that window
was accepted for (ADR-0040).

## Extension seams

| Future change | Seam | What changes |
|---|---|---|
| Paid usage (marketplace step 1) | `quota.ts` `canStartRun`; metering counters on `collector_run` | Policy reads plan/credits; payments through the existing Mollie integration. No collector or executor change. |
| Commissioned collectors (marketplace step 2) | `Collector.author`; catalog | Author widens to a member reference; code still arrives via reviewed PR. |
| Member-written code | Command (`collector_run`) consumed by a runner | Add an isolated runner (e.g. Vercel Sandbox) with no secrets that claims runs of `author: member`; ADR-0040 names this as the trigger for separating execution. |
| Longer runs | `RunExecutor`; `seq` on items | Checkpoint by `seq`/cursor and resume, or move execution to a durable workflow. |
| Headless browser | `CollectorContext` | A second context capability (`ctx.render(url)`) served by an isolated runner. |
| Sharing datasets | `collector_run` visibility | Add a visibility field + community scoping; separate design (moderation, personal data). |
| New export format | export Strategy | One formatter. |
| Existing fetchers | Collector interface | `scan-jobs`, event discovery and URL import can become collectors run on schedule. |

## Error handling summary

- Invalid input → rejected at `startRun` with field errors; nothing stored.
- Quota exceeded → typed refusal with reason and retry time, shown as plain text.
- Robots disallow / blocked domain (also when reached through a redirect) →
  run `failed`, `stop_reason` explains, the page is never requested.
- robots.txt cannot be read (5xx, timeout, network error, too many
  redirects) → run `failed` with `stop_reason = 'robots_unreachable'` ("We
  could not read this site's robots.txt, so we did not collect from it."),
  the page is never requested.
- A non-https address → refused at `startRun` (input schema) and by the
  context.
- Network / parse errors in a collector → `failed` with a mapped user-safe
  message; raw error in the server log.
- Invalid rows → skipped and counted in `invalid_item_count`, shown on the run
  page.
- Worker crash → lease expiry → re-claimed once, then `worker_lost`.

## Testing

- **Unit:** each collector against recorded fixtures through a fake
  `CollectorContext` (assert the requests it makes, not only the rows it
  returns); `run-status` transitions; CSV escaping including formula
  injection; quota rules; robots parsing edge cases; catalog completeness
  (EN/NL, schemas present, sample item validates against item schema).
- **Proxy:** the context with a fake transport — budget stop, blocklist,
  robots disallow and unreachable, the robots.txt request's budget check,
  rate-limit slot, redirect blocklist and metering, 429 back-off sequence,
  rate-limit wait, counters incremented.
- **Integration (test DB on 127.0.0.1:55432):** migration up/down; claim with
  `SKIP LOCKED` under two concurrent workers; lease expiry re-claim; item
  batching and caps; ownership scoping on every facade read; retention
  cleanup.
- **MCP:** tools listed under `collect` only; agent runs count against the
  owner's quota.
- **UI:** the generated form renders each collector's fields; the run page
  shows all statuses and stop reasons; the three data states.
- Full existing suites of every touched workspace, including `safeFetch`
  callers after the option change.

## Delivery slices

1. **Core and first collector:** tables + migration, catalog, interface,
   context (Proxy) with all safety rules, executor, worker route + cron,
   facade, `feed-items`, flag. Tested end to end without UI. Plan:
   `docs/superpowers/plans/2026-10-03-data-collectors-core.md`.
2. **Member UI and the public about page**, preceded by a visual review of
   mockups: dashboard tab, generated form, run page, history, export,
   `/collectors/about`. The flag stays off until this slice ships, so no
   collector contacts a site before the about page exists.
3. **More collectors:** `github-org-repos`, `page-list`.
4. **MCP tools** under the `collect` scope.
5. **Retention cron and blocklist admin.**
