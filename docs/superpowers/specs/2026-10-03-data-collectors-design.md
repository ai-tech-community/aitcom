# Data collectors — design

**Status:** in delivery — slices 1–2 built; slice 3: `page-list` and its extraction sandbox built
**Date:** 2026-10-03
**Decision records:** [ADR-0040](../../adr/0040-data-collectors-are-built-in-strategies-run-from-a-queued-command.md),
[ADR-0041](../../adr/0041-html-extraction-runs-in-a-deadline-bound-worker-with-a-selector-allowlist.md) (HTML extraction)

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
    item, its columns, and an optional next-page link. Pages are read in an
    extraction sandbox with a hard deadline (ADR-0041).
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
                                                   |
                                     extractList ──> extraction sandbox
                                                     (worker thread, 5 s deadline)
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
  as composable helpers (such as `parseFeed`) that collectors call, and
  HTML extraction as a context capability (`ctx.extractList`) — composition,
  consistent with Strategy.

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
    feed.ts               RSS/Atom parsing
  extract/                HTML list extraction (ADR-0041); never imported by collectors
    protocol.ts           ExtractSpec/Result/Error, worker messages, extraction limits
    extract-list.ts       pure extraction: HTML + spec → rows + next URL (cheerio, parse5)
    sandbox.ts            one worker per run, per-page deadline, replace on timeout
    sandbox-paths.ts      where the pre-bundled worker lives
  context/                the Proxy and its rules
    collector-context.ts  builds the ctx a collector receives
    extract-capability.ts ctx.extractList: time budget, refusals → failed stops
    html-charset.ts       which encoding a page is in (BOM, header, <meta>, UTF-8)
    robots.ts             robots.txt fetch + check, cached per run
    site-rate-limit.ts    shared per-site limit (Upstash Redis)
    blocklist.ts          opted-out domains
  identity.ts             user agent, robots.txt token, about path, opt-out
                          address: one source for the worker and the about page
  flags.ts                FEATURE_COLLECTORS and COLLECTORS_DISABLED
  run-status.ts           transition table + guard
  executor.ts             RunExecutor (Context of the Strategy)
  runs.ts                 CollectorRuns facade
  quota.ts                canStartRun(user) policy
  export/
    csv.ts                formula-injection-safe CSV
    json.ts
src/app/api/cron/collector-worker/route.ts
src/app/api/collectors/runs/[runId]/export/route.ts   streamed download
src/app/api/mcp/collector-tools.ts
src/server/api/routers/collectors.ts
src/app/[locale]/dashboard/(member)/collectors/...    member pages
src/app/[locale]/collectors/about/page.tsx            public page
src/components/collectors/                             member screens
src/lib/collectors/
  form-fields.ts          JSON Schema + field hints → drawable form fields
  input-problems.ts       refused input: codes by path, placed on the form, worded
  run-presentation.ts     run status / stop reason → one presentation model
  selector-policy.ts      CSS selector allowlist (form schema and worker)
workers/html-extract.worker.ts                         worker entry around extractList
scripts/build-workers.mjs                              esbuild bundle → workers/dist/ (git-ignored)
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
  `src/server/collectors/collectors/**` and `helpers/**`. The same rule
  forbids HTML parsing there (`cheerio`, `parse5`, `htmlparser2`,
  `css-select`, `css-what`, `domutils`, `domhandler`): collectors read pages
  only through `ctx.extractList`.
- Input and item schemas are converted to JSON Schema with Zod 4's
  `z.toJSONSchema` for the MCP tool description and the generated form.
- Every catalog entry must have EN and NL text; a unit test enforces it, like
  the badge catalog.

### CollectorContext (Proxy)

```ts
interface CollectorContext {
  fetch(url: string, opts?: { accept?: string }): Promise<CollectorResponse>;
  extractList(                   // reads a list out of a fetched page, in the sandbox
    page: { html: string; url: string },
    spec: { itemSelector; fields: { name; selector /* null: the item */; attribute? }[]; nextPageSelector? },
  ): Promise<{ rows: Record<string, string | null>[]; nextUrl: string | null; nextUrlTooLong: boolean; truncated: boolean }>;
  log(message: string): void;    // capped, user-visible
  signal: AbortSignal;           // aborts on time budget or cancellation
}
interface CollectorResponse {
  url: string; status: number; headers: Headers;
  text(): Promise<string>;       // UTF-8
  html(): Promise<string>;       // by the page's declared charset (page-list)
  json(): Promise<unknown>;
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
5. **`safeFetch`** with the SSRF guard on every redirect hop, each connection
   pinned to the addresses it checked (`pinnedFetch`); body read through
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

**Extraction sandbox (ADR-0041).** `ctx.extractList` hands the page to the
run's extraction sandbox (`src/server/collectors/extract/sandbox.ts`), never
to the collector's own code:

- **One worker per run, started lazily.** The live context creates the
  sandbox; its `worker_threads` Worker starts on the run's first
  `extractList` call (about 35–55 ms) and serves the run's later pages, one at
  a time. Heap limit `maxOldGenerationSizeMb: 256`. A worker that dies while
  idle is replaced on the next call. The executor awaits the context's
  `dispose` in a `finally`, which ends the worker; a failing dispose is
  logged and never changes the run's outcome.
- **Per-page deadline 5 000 ms, enforced from outside.** The main thread
  races each page (worker start-up included) against a timer. When the timer
  wins it terminates the worker and the call fails with `page_too_slow`; the
  next page gets a fresh worker. This deadline is the real bound on parse and
  match time; the limits below make ordinary pages fast and refuse what can
  be refused early.
- **Out of memory is its own outcome.** A worker that reaches its heap limit
  (`ERR_WORKER_OUT_OF_MEMORY`) fails the call with `page_too_complex`: the
  page has too many elements for 256 MB, so trying again would not help.
  Measured: 3 MB of `<p></p>` (well inside the 5 MB body cap) runs out of
  memory in about 0.4 s; a 5 MB table with three cells per row does too,
  while a 5 MB `<li>` list is read. Any other crash, or a closed sandbox,
  is `extract_failed`.
- **Inside the worker** the pure `extractList(html, spec)` first re-checks
  every selector against the allowlist (`selector_not_allowed`), parses with
  cheerio (parse5, the browser's tree), measures the element depth
  iteratively and refuses a page deeper than **512** (`page_too_deep`; a very
  deep page may end as `page_too_slow` instead, because the parse runs
  first). It then empties every `<template>`: its content is inert markup a
  browser never shows, so no item, column or next-page link matches inside
  it. Then: at most **5 000 rows** per page; each cell trimmed, whitespace
  collapsed, at most **2 000 characters**, cut on a whole character (never
  inside a surrogate pair or between a letter and its combining marks); at
  most **2 000 000 characters** per page summed over all cells. Rows past
  either page limit are dropped and the result says `truncated: true`.
  Text keeps block elements apart by one space
  (`<h3>Engineer</h3><p>Amsterdam</p>` reads "Engineer Amsterdam"; `<br>`
  too; inline elements add nothing). Text inside `script`, `style`,
  `noscript` and `template` is skipped (a column that matches such an
  element itself is `""`). `href`, `src` and `action` attributes are
  resolved against the page's final URL and kept only when http(s) and at
  most 2 000 characters long. The next-page link likewise; one that is too
  long is reported (`nextUrlTooLong`) so paging can end with a reason.
- **The run's time budget comes first** (`context/extract-capability.ts`):
  once the run's deadline has passed or the run was aborted, `extractList`
  stops at `time_limit` without extracting, and an extraction failure after
  the abort is reported as `time_limit` too.
- **Refusals become failed stops** (same file): `page_too_slow`,
  `page_too_deep`, `page_too_complex` and `selector_not_allowed` keep their
  codes; a worker crash (`extract_failed`) becomes `generic`.
- **Packaging.** The worker is bundled by esbuild (`pnpm build:workers`, run
  by `build` and `dev`) into `workers/dist/html-extract.bundle.cjs` and
  shipped with `/api/cron/collector-worker` through
  `outputFileTracingIncludes` in `next.config.js` (file tracing does not
  follow a worker's own requires). A test keeps the config path equal to
  `HTML_EXTRACT_BUNDLE`. That the route's trace file
  (`route.js.nft.json`) lists the bundle was proven once, by hand, in a
  local production build (Task 10 of the page-list plan, 2026-10-03); it is
  not a recurring step.

User agent: `aitcom-collector/1.0 (+https://aitcommunity.org/collectors/about)`.
It is built in `src/server/collectors/identity.ts` from the robots.txt token
(`aitcom-collector`) and the about path (`/collectors/about`). The worker's
context sends it and the public about page shows it from the same constants,
so the two cannot drift apart.

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
- **Errors.** A thrown error inside a collector ends the run `failed`. Two
  things are stored: `error`, a plain English sentence for the server log
  and MCP (cut to 500 characters, the column size), and `error_detail`, a
  stable failure code the member's screen translates (see "Failure
  detail"). The raw error goes to the server log only.

### Failure detail (`errors.ts`)

Every failed run stores `error_detail = { code, params? }`. The code is a
closed union (`FailureCode`), so a new failure needs a new code and its
EN/NL copy (`collectors.failure.<code>`); screens never show the English
`error`.

| Code | Produced when |
|---|---|
| `not_a_feed` | the address is not an RSS or Atom feed |
| `feed_status` | the feed answered with a non-2xx status (`params.status`) |
| `https_only` | an address is not https |
| `invalid_address` | a collector produced something that is not a web address |
| `redirect_loop` | more than 5 redirects |
| `too_large` | a response was over the 5 MB limit |
| `timeout` | a site took too long to answer |
| `unreachable_address` | the SSRF guard refused the address (private or local) |
| `site_refused` | the third 429/503 in a row from one site |
| `robots_disallowed` | the site's robots.txt disallows the page |
| `robots_unreachable` | the site's robots.txt could not be read |
| `blocked_domain` | the site opted out |
| `collector_unavailable` | the run's collector is gone or switched off |
| `input_invalid` | the stored input no longer fits the collector |
| `worker_lost` | the run was interrupted twice |
| `page_status` | a list page answered with a non-2xx status (`params.status`) |
| `not_a_page` | a list page is not HTML (content type other than `text/html` / `application/xhtml+xml`) |
| `page_too_slow` | reading one page passed the 5 000 ms extraction deadline |
| `page_too_deep` | a page is nested deeper than 512 elements |
| `page_too_complex` | the extraction worker ran out of memory on a page (too many elements for the 256 MB heap) |
| `selector_not_allowed` | a selector failed the allowlist inside the worker (the form refuses it first) |
| `generic` | anything else, including an extraction worker crash |

`CollectorStop` carries its detail (optional 4th argument); for other
errors `failureDetailFor(err)` maps the same known kinds as
`userMessageFor(err)`. A partial (succeeded) run has neither `error` nor
`error_detail`.

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
next_page_not_secure | next_page_too_long | site_refused |
robots_disallowed | robots_unreachable | blocked_domain | error |
worker_lost` (runtime list `STOP_REASONS`). The two `next_page_*` reasons
end a `page-list` run as a partial success (see `page-list` "Paging").

### CollectorRuns (Facade)

```ts
listCollectors(locale)                          // translated titles, field hints, input JSON Schema
startRun({ userId, agentId?, origin, collectorId, input })
                                                // → { ok: true, runId } | typed refusal
getRun(userId, runId)                           // → run, or null when missing/foreign
listRuns(userId, { cursor?, limit? })           // newest first, cursor-paged
listItems(userId, runId, { afterSeq?, limit? }) // paged by seq
usage(userId)                                   // { runsToday, runsPerDay }
exportRun(userId, runId, "csv" | "json")        // streamed body, or null
```

A refusal carries a reason code (`disabled | unknown_collector |
invalid_input | quota`), field errors for invalid input (codes by full
path, such as `fields.2.selector: selector_not_allowed/too_long`; see
"Member UI"), and for quota the `quotaReason` and, when known, `retryAt`.
It also carries an English `message` for logs and agents; the web UI never
shows it and maps the codes to its own EN/NL strings.

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

- `csv`: header from the item schema's keys, or from the first row's keys
  when the schema has no fixed keys (`page-list`, whose columns the member
  names); nested values JSON-encoded; any
  cell starting with `=`, `+`, `-`, `@`, tab or carriage return is prefixed
  with `'` (spreadsheet formula injection).
- `json`: an array of row objects.
- Both stream from `collector_item` ordered by `seq`, read 500 rows at a
  time, so a 5,000-row run is never held in memory whole.
- Download route: `GET /api/collectors/runs/[runId]/export?format=csv|json`.
  Signed-in owner only: no session → 401, unknown format → 400, another
  member's or a missing run → 404 (never 403), flag off → 404, a run still
  `queued` or `running` → 409 "Run still in progress" (its file would be
  incomplete). The response is a `ReadableStream` pulled page by page, sent
  as an attachment with `Cache-Control: private, no-store` and
  `X-Content-Type-Options: nosniff`. A failure mid-stream is logged with the
  run id and errors the stream, so the browser shows a failed download
  rather than a silently short file; cancelling the download stops the
  reads.
  The format is looked up in the export registry, so a new format needs no
  route change.

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
| `error` | varchar(500) NULL | plain English sentence (server log, MCP) |
| `error_detail` | jsonb NULL | `{ code, params? }` failure code the screens translate (migration `20261003b`) |
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

**`page-list`** (`page`, "List on a web page"). Reads a list on a public
web page into rows; parsing happens only in the extraction sandbox (see
"CollectorContext", ADR-0041).

- **Input.** `url` (https only, ≤ 2 048 characters); `itemSelector` (one
  item = one row); `fields`, 1–20 columns of `{ name, selector?, attribute? }`
  — `name` matches `^[a-zA-Z][a-zA-Z0-9_]{0,39}$` and is unique, `attribute`
  matches `^[a-zA-Z_:][-a-zA-Z0-9_:.]{0,39}$`, and a `selector` that is left
  out or blank means **the item itself** (for a list whose items are links,
  a `link` column with attribute `href` and no selector); optional
  `nextPageSelector`; `maxPages` 1–20, default 5. Collector limits:
  20 pages, 5 000 rows, 120 s. The start form draws `fields` as a **rows**
  field (see "Member UI"); its selector help says "Leave empty to read the
  item itself — for example its link."
- **Selector allowlist** (`src/lib/collectors/selector-policy.ts`, checked
  in the input schema and again in the worker). Allowed: tag, `*`, class, id,
  attribute selectors (all operators, no namespaces); combinators descendant,
  `>` and `+`; pseudo-classes `:not()`, `:is()`, `:where()` with compound
  arguments only (no combinators inside), `:first-child`, `:empty`. Refused:
  everything else — `~`, all `:nth-*`, `:has()`, `:contains()`,
  `:icontains()`, `:first-of-type`, `:last-of-type`, `:only-of-type`,
  `:only-child`, `:last-child`, `:eq`/`:gt`/`:lt` and other positionals,
  pseudo-elements, the `<` parent combinator, namespaces. One selector per
  field (no comma lists), ≤ 200 characters, ≤ 8 compound parts. A blank
  column selector skips the check for that column only. Each refused
  feature's measured reason is in ADR-0041. A refusal comes back as a code
  per input path (`fields.2.selector: selector_not_allowed/too_long`), and
  the form names the problem in plain words at that input (empty, too long,
  not valid, a list, too many parts, a feature we don't allow; see "Member
  UI").
- **Row.** An object with the member's column names. Each value is read
  from the first match of the column's selector inside the item, or from the
  item itself when the column has no selector: its text (trimmed, block
  elements kept apart by one space, whitespace collapsed, ≤ 2 000
  characters cut on a whole character) or the named attribute; link
  attributes (`href`, `src`, `action`) resolved against the page's final URL
  and kept only when http(s) and at most 2 000 characters (a cut link would
  be broken). No match, or a missing attribute, is `null`. Matches inside a
  `<template>` do not count. Item schema: `record<string, string | null>`.
- **Paging.** Pages are read in order from `url`, following the `href` of
  the first `nextPageSelector` match that has one (resolved against the
  page; a `javascript:`, `mailto:` or other non-http(s) link, or no link,
  ends paging as `complete`). A next link we cannot follow ends paging, not
  the run: a plain-`http` link stops with `next_page_not_secure` and one
  longer than 2 000 characters with `next_page_too_long` (both `succeeded`,
  partial; the run page says why in plain words). A visited set of page
  addresses (without `#hash`) stops paging cleanly (`complete`) when the
  next link points back to a page already read, **or when a page redirects
  onto a page already read** (its rows would repeat). When `maxPages` pages
  have been read and a new next link remains, the run stops with
  `page_limit` (`succeeded`, partial), so it never claims to have read
  everything. Redirect hops and 429/503 retries count toward the context's
  own page budget (`limits.maxPages`), so a run can reach `page_limit`
  before `input.maxPages` pages.
- **Each page.** A non-2xx answer fails the run with `page_status`
  (`params.status`); a content type other than `text/html` or
  `application/xhtml+xml` (a missing type counts as HTML) fails it with
  `not_a_page`. The body is decoded by the charset the page declares
  (`res.html()`, `context/html-charset.ts`): a byte order mark, else the
  `charset` in `Content-Type`, else `<meta charset>` or `<meta http-equiv>`
  in the first 1024 bytes, else UTF-8; labels are WHATWG labels
  (`TextDecoder`), and an unknown label counts as undeclared. Other
  collectors keep `res.text()` (UTF-8). The log gets "Page n: k items."
  and, when a page was cut (`truncated`), a line saying some items were
  left out. Extraction refusals fail the run with `page_too_slow`,
  `page_too_deep`, `page_too_complex` or `selector_not_allowed`; rows from
  earlier pages stay in the run's table.
- **Empty result.** A run that ends `succeeded` with 0 rows shows, under
  "No rows were collected.", that some pages build their list in the
  browser after loading and this collector reads the page as the site sends
  it (chosen by collector kind `page`; generic, no detection).
- **Working on it locally.** `pnpm dev` builds the worker bundle once, at
  start; there is no watcher. After editing `workers/` or the extractor
  (`extract-list.ts`, `protocol.ts`, `selector-policy.ts`), restart
  `pnpm dev`.

**Real-world check, 2026-10.** 33 startup careers pages (20 own website,
4 Personio, 3 Greenhouse, 3 Lever, 2 Ashby, 1 Workable), each with an input
written by hand from the fetched HTML and run through the real engine
(robots.txt, per-site limit, budgets, sandbox) against a local database. The
reference was the role titles our startup jobs scan had stored.

- **Engine.** 33 of 33 runs ended `succeeded` / `complete`. No page was
  refused by robots.txt, the block list, a 4xx/5xx, the depth cap, the
  per-page deadline or the selector allowlist (largest page 0.74 MB; slowest
  run 3.4 s). No input needed a refused selector feature.
- **Outcomes by the plain metric** (recall of stored titles ≥ 0.9 = works):
  works 10, partial 17, needs JavaScript 6, blocked by site rules 0,
  selector feature refused 0, other failure 0. By board — own website:
  7 works / 10 partial / 3 needs JavaScript; Personio: 0 / 4 / 0;
  Greenhouse: 1 / 2 / 0; Lever: 2 / 1 / 0; Ashby: 0 / 0 / 2;
  Workable: 0 / 0 / 1.
- **Why "partial".** All 17 are reference problems, not missed items: every
  stored title that still appears on the page was extracted, and every role
  visible on the page became a row. The stored titles were often button or
  subtitle text ("View details", "Apply now", a location line), filter
  labels, or roles since closed or renamed. Judged against the roles visible
  on the page: **works 27, needs JavaScript 6** (own website 17 / 3,
  Personio 4, Greenhouse 3, Lever 3, Ashby 0 / 2, Workable 0 / 1).
- **Needs JavaScript (6).** Ashby and Workable boards, and own websites that
  embed an Ashby board, send no role list in the HTML; Ashby keeps it only
  in a script's JSON, which `page-list` does not read by design. These runs
  end `complete` with 0 (or a few empty) rows. *Since addressed:* the run
  page now explains an empty result (see "Empty result" above).
- **Limit that blocked real pages: the item's own link.** A column selector
  matched only *inside* the item, so when each item is itself the link (a
  card `<a href>` with no wrapper per item), the `link` column could not be
  read. 6 of the 27 working pages lost their links this way (one more page
  has no link in its HTML at all). *Since fixed:* a column with no selector
  reads the item itself (see "Input").
- **Smaller notes.** Without `:has()`, a generic wrapper as item gives some
  all-empty rows on 2 pages. A redirect (such as an added trailing slash)
  counts as a fetched page, so 3 one-page runs show 2 pages. No sampled
  page used a next-page link, so paging was not exercised on real pages.

New dependencies: `fast-xml-parser` (feeds), `robots-parser` (robots.txt),
`cheerio` with parse5 and `css-what` (HTML extraction and the selector
allowlist; `cheerio/slim` and `node-html-parser` were rejected, see
ADR-0041), and `esbuild` as a devDependency (worker bundle).

## Surfaces

### Member UI

A member-only tab in the dashboard, hard-gated like the other dashboard
pages: every page calls `requireDashboardSession()` itself and every
procedure is a `protectedProcedure`. User-facing name: **Data collectors**
for the tab and the page title (one item is "a data collector"). The tab
appears after Job tracker only while the feature flag is on (see
"Feature flag and kill switches").

Routes:

| Route                                                  | Screen                              |
| ------------------------------------------------------ | ----------------------------------- |
| `/dashboard/collectors`                                | collectors list, recent runs, usage |
| `/dashboard/collectors/new/[collectorId]`              | start a run                         |
| `/dashboard/collectors/runs`                           | my runs (history)                   |
| `/dashboard/collectors/runs/[runId]`                   | run page                            |
| `/api/collectors/runs/[runId]/export?format=csv\|json` | download (see "Export")             |
| `/collectors/about`                                    | public page for site owners         |

The web talks to the facade through the `collectors` tRPC router
(`overview`, `start`, `run`, `runs`, `items`). The router adds only the
feature gate and the first-use acknowledgement; ownership, quota and
validation stay in the facade, so MCP behaves the same.

1. **Collectors** — a quiet list (not a card grid): title, one-line
   description, kind as a neutral (`secondary`) badge — kind is a category,
   never a status colour (DESIGN.md "Status vs. category") — and the sample
   row on expand. The page also shows the member's last three runs and
   their usage ("3 of 20 runs used · last 24 hours"), and links to the
   about page.
2. **Start a run** — form generated from the collector's input JSON Schema
   plus its `fieldHints` (one generic renderer; adding a collector needs no
   UI code). `src/lib/collectors/form-fields.ts` maps each property to a
   field kind it can draw: plain text, web address (`format: "uri"`), number
   (whole numbers get a numeric keypad and step 1), checkbox, and **rows** —
   an array of objects whose properties are each plain text, web address or
   number, drawn as one labelled input per column per row, with "Add column"
   and "Remove" buttons inside the schema's min/max (`page-list`'s
   `fields`). Its column labels come from `FieldHint.columns`; empty optional
   cells and fully empty rows are dropped before submit. Anything
   else — a choice list (`enum`), a fixed value (`const`), a string format
   other than a web address, or an unknown type — is **refused**: the form
   says the collector cannot be started from here yet, rather than drawing
   it as free text the server would then reject. A field with a `default`
   is optional even though `z.toJSONSchema` lists it as required. The limits
   (rows, pages, seconds, and that the run uses one of the member's daily
   runs) are shown above the button. **Start run** is the one Signal Orange
   action.

   **First-use note.** While the member has no stored runs,
   the form shows a short acceptable-use note (own research, respect each
   site's terms, avoid personal data, runs are private and deleted after
   30 days) with a checkbox the member must tick. The router enforces it:
   `start` without `acknowledged: true` from a member with no runs is
   refused with `BAD_REQUEST` / `ACKNOWLEDGEMENT_REQUIRED`, so a stale or
   crafted request cannot skip it. There is no separate stored flag; once
   the member has a run the note is gone. Runs are removed after 30 days by
   the retention cron (slice 5), so once all of a member's runs have been
   removed the note shows again.

   **Refusals.** The facade returns field errors as codes by full path
   (`itemSelector`, `fields.2.selector`, `fields.1.name`), never English
   sentences; a collector's own checks give their own codes (each selector
   refusal reason, `duplicate_name`), other checks Zod's issue code
   (`src/lib/collectors/input-problems.ts`). The form maps a rows field's
   row number back to the member's row (empty rows are not sent), shows the
   EN/NL words at that exact input with `aria-invalid`, and falls back to
   "Check this field." under the whole field for a problem with no precise
   input. Rows keep an id, so a message stays with its row when an earlier
   row is removed. A quota refusal
   names the limit: "You've used all 20 runs for the last 24 hours. You can
   start again in 3 hours." for the daily limit (the retry time comes from
   `retryAt`; without it the sentence ends after the limit), and plain
   sentences for the active-run and platform limits.

3. **Run page** — status badge with icon + label (semantic tokens), one
   sentence saying where the run stands, counts (rows, pages fetched, rows
   skipped), stop reason in plain words ("Partial: stopped at the page
   limit."), and for a failed run the translated failure detail under it
   ("The feed answered with error 404. Check the address, or try again
   later."; an unknown code adds nothing, the English `error` never shows),
   a paged table preview (50 rows per page, by `seq`; its columns are every
   key the rows on screen have, in first-seen order, so `page-list` shows the
   member's own columns, and an empty cell shows "—"), and a
   collapsible log. A page collector's run that finished with no rows also
   explains why that can happen (see `page-list` "Empty result"). The
   status is announced to screen readers (`role="status"`).

   **Polling.** The run and its rows refetch every 3 seconds while the run
   is `queued` or `running`, and stop when it ends. At that moment the rows
   are fetched once more, so the table agrees with the final count and the
   download (a first load of an already-ended run is not a transition and
   does not refetch). An error does not stop polling: a passing failure (a
   deploy, a network blip) keeps the last known status and its interval.
   Only `NOT_FOUND` stops it: a missing or foreign run shows "not found"
   with a link to My runs; that query is not retried and not polled. The
   rows query follows the same rule.

   **Downloads.** **Download CSV** / **Download JSON** are equal peers, so
   both use the `ink` button, not orange. They are offered only once the
   run has ended and has rows — a file of a half-finished run would mislead.

4. **My runs** — history table with collector, start time, status badge,
   row count, short stop reason ("Why it ended") and expiry as
   `<RelativeTime>`; older runs load by cursor. When a new run appears on
   top of the first page, the loaded older pages are dropped and paging
   starts again, so no run falls between pages. Empty history teaches the
   next action with **Choose a collector**, the one orange action there.

   The dashboard's recent runs and the history's first page refetch every
   5 seconds while any listed run is `queued` or `running`, and stop once
   none is. The recent-runs empty hint ("Pick a collector above…") shows
   only when there is at least one collector.

All data views implement the three data states (`<Skeleton>`,
`<ErrorState onRetry>`, `<EmptyState>`). All member-facing copy lives in
`messages/en.json` and `messages/nl.json` (namespaces `collectors` and
`collectorsAbout`, plus `dashboard.tabs.collectors`); collector titles,
descriptions and field labels come translated from the catalog.

**Words.** Member-facing copy uses everyday words: "this site's rules for
automated visitors", never "robots.txt"; "rows", not "items", for what a run
collected. `page-list` copy says "items" only for the entries of the list on
the member's page (each becomes a row), "columns" and "next-page link", and
never names parser internals. The about page
for site owners (below) is written for a technical reader and keeps the
technical terms (robots.txt, user agent, 429/503).

### Public page for site owners

`/collectors/about`, public (no sign-in) and shown whether or not the
feature flag is on: what the visitor is, that it reads robots.txt first and
follows it, the 1-request-per-second limit across all members, how it backs
off on 429/503, that it only reads public https pages, the exact user-agent
string, a robots.txt snippet to block it (whole site or part), and the
opt-out address `info@klevox.com` (the domain and its subdomains are added
to the blocklist). The user agent, robots.txt token and address come from
`src/server/collectors/identity.ts`, the same module the worker uses. It uses
technical terms on purpose: its readers are site operators. The collectors
page links to it ("How our collector visits sites").

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

- `FEATURE_COLLECTORS=on` — one server flag, off by default, read only
  through `collectorsEnabled()` in `src/server/collectors/flags.ts`. There is
  no `NEXT_PUBLIC_` flag: the member dashboard layout reads the server flag
  and passes it to the tab bar (`showCollectors`). When off: tab hidden, the
  member pages call `notFound()`, every `collectors.*` procedure throws
  `NOT_FOUND` with message `COLLECTORS_OFF`, the download route answers 404,
  `startRun` is refused, the worker no-ops, and MCP tools return a clear "not
  available" error. Deleted once the feature is final.
- `COLLECTORS_DISABLED` — per-collector disable.
- `collector_blocked_domain` — per-site opt-out.

**Gate before enabling (met, #419).** `FEATURE_COLLECTORS` was not to be
turned on, and `page-list` was not to ship, until `safeFetch` pinned each
connection to an address it had checked, because data collectors let members
point our servers at arbitrary sites (ADR-0040). That condition is now met:
`safeFetch` connects through `pinnedFetch`
(`src/server/net/pinned-transport.ts`), which resolves DNS once at connect
time, checks every answer against the public-address policy
(`src/server/net/address-policy.ts`) and connects only to the answers it
checked, so a DNS server can no longer switch to an internal address between
the check and the connection. IP-literal hosts skip DNS and are refused unless
public, and the transport never follows redirects itself. The URL pre-check in
`validateWebhookUrl` stays as a friendly early refusal, not the guard. The
member UI and the public about page have shipped (#421), so turning
`FEATURE_COLLECTORS` on is now the owner's decision.

`page-list` had a second condition: it ships only together with a parse
sandbox. **That condition is met** in slice 3: `page-list` never parses HTML
itself, and every page is read in the extraction sandbox — a worker thread
with a heap limit, a 5 000 ms per-page deadline enforced from outside, a
selector allowlist checked twice and a depth cap of 512 (see
"CollectorContext" and ADR-0041). It can be switched off on its own with
`COLLECTORS_DISABLED=page-list`.

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
- Quota exceeded → typed refusal with reason and, for the daily limit, the
  retry time; the form names the limit in plain words (see "Member UI").
- First run without the acceptable-use acknowledgement → refused with
  `ACKNOWLEDGEMENT_REQUIRED`; the form shows the note.
- Robots disallow / blocked domain (also when reached through a redirect) →
  run `failed`, `stop_reason` explains, the page is never requested.
- robots.txt cannot be read (5xx, timeout, network error, too many
  redirects) → run `failed` with `stop_reason = 'robots_unreachable'`
  ("Failed: we could not read this site's rules for automated visitors, so
  we did not collect from it."), the page is never requested.
- A non-https address → refused at `startRun` (input schema) and by the
  context.
- Network / parse errors in a collector → `failed` with a mapped English
  message and a failure code (see "Failure detail") the screens translate;
  raw error in the server log.
- A list page that is too slow to read, nested too deeply, too large for
  the worker's memory, or given a selector outside the allowlist → `failed`
  with `page_too_slow`, `page_too_deep`, `page_too_complex` or
  `selector_not_allowed`; the extraction worker is replaced after a
  timeout or crash, or when it died while idle; rows from earlier pages are
  kept. A refused selector is normally caught earlier, by the form.
- A next-page link that is plain `http` or too long → paging ends,
  `succeeded` (partial) with `next_page_not_secure` / `next_page_too_long`.
- Download of a run still in progress → 409; a failure mid-download is
  logged with the run id and errors the stream.
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
- **Extraction:** the selector allowlist (each allowed and refused
  feature); `extractList` on fixtures (text, attributes, link resolution,
  the depth cap without a stack overflow, row and output-budget cuts with
  `truncated`, skipped script/style/noscript/template text, template content
  never matched, block spacing, whole-character cuts, a column that reads
  the item itself, an over-long next link); the charset decision
  (windows-1252, `<meta>`-only, unknown label); the worker run from the
  **built bundle** in a directory with no `node_modules`; the sandbox's
  deadline (a hostile page ends `page_too_slow` and the next call gets a
  fresh worker; the main thread stays responsive; start-up counts), out of
  memory as `page_too_complex`, crash handling, an idle worker that died,
  and close; `next.config.js` tracing path equal to `HTML_EXTRACT_BUNDLE`.
  The route's trace file was checked once by hand (see "Packaging").
- **MCP:** tools listed under `collect` only; agent runs count against the
  owner's quota.
- **UI:** the generated form renders each collector's fields and refuses
  fields it cannot draw; defaults make a field optional; the first-use note
  and its router check; quota sentences; the run page shows all statuses and
  stop reasons and the translated failure detail, stops polling when the
  run ends and refetches the rows once, keeps polling through a passing
  error and stops only for a missing run; the lists poll while a run is
  active; downloads appear only for an ended run with rows; the export
  route's owner, format, flag and in-progress (409) checks, its lazy,
  cancellable stream and its mid-stream failure; a refused input shown at
  its exact input (column rows mapped past empty rows); the empty-result
  hint for page runs; member copy never says "robots.txt"; EN/NL key
  parity (`scripts/check-i18n-parity.mjs`); the three data states.
- Full existing suites of every touched workspace, including `safeFetch`
  callers after the option change.

## Delivery slices

1. **Core and first collector:** tables + migration, catalog, interface,
   context (Proxy) with all safety rules, executor, worker route + cron,
   facade, `feed-items`, flag. Tested end to end without UI. Plan:
   `docs/superpowers/plans/2026-10-03-data-collectors-core.md`.
2. **Member UI and the public about page** (built), preceded by a visual
   review of mockups: dashboard tab, generated form, run page, history,
   export, `/collectors/about`. Shipped in #421; the flag stayed off until
   then, so no collector contacted a site before the about page existed. Plan:
   `docs/superpowers/plans/2026-10-03-data-collectors-screens.md`.
3. **More collectors:** `page-list` together with its extraction sandbox
   (built: ADR-0041, plan
   `docs/superpowers/plans/2026-10-03-collector-page-list.md`), and
   `github-org-repos` (not built yet).
4. **MCP tools** under the `collect` scope.
5. **Retention cron and blocklist admin.**
