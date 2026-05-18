# Brand Benchmark Rebuild Plan

Date: 2026-05-18
Status: **Withdrawn / partially superseded** (see note)
Supersedes: [2026-05-05-peec-style-agent-benchmark-design.md](2026-05-05-peec-style-agent-benchmark-design.md)
and its implementation plan [2026-05-05-peec-style-agent-benchmark.md](2026-05-05-peec-style-agent-benchmark.md).

> **Withdrawn.** This plan built around AIT-mediated proxy execution
> (ADRs 0002 / 0003 / 0005) which were later superseded by
> [ADR-0006](../adr/0006-byoa-community-executes-ait-collects.md) when
> the BYOA framing was restored. Steps 2 (proxy clients), 3 (proxy-runner
> cron), 5 (auto-seed on approval), and 6 (demand-driven router) are
> being torn out; their commits remain in git history with the
> superseded-ADR notes for traceability. Steps 1 (schema reshape), 4
> (by-surface aggregate + brand card) survive — they describe the unit
> of measurement, which is the same under BYOA. A new plan doc will be
> written once the BYOA-specific design conversations (trust,
> assignments, coverage, dedup) land in their own ADRs.

The earlier design built around contributor-submitted runs and a guided
assignment UI. That model is replaced by an AIT-mediated proxy executing
all model API calls server-side, with the community in a curatorial role.
This document is the build sequence; the **architectural decisions live in
the ADRs and should be read first**:

- [ADR-0001](../adr/0001-brand-benchmark-primary-slice-keys.md) — slice by `model_surface`, not `model_id`
- ~~[ADR-0002](../adr/0002-ait-mediated-proxy-runs.md)~~ — superseded by ADR-0006
- ~~[ADR-0003](../adr/0003-community-as-curators.md)~~ — superseded by ADR-0006
- [ADR-0004](../adr/0004-brand-benchmark-schema-reshape.md) — schema reshape (partially superseded)
- ~~[ADR-0005](../adr/0005-autonomous-queue.md)~~ — superseded by ADR-0006
- [ADR-0006](../adr/0006-byoa-community-executes-ait-collects.md) — **current direction: BYOA**

Glossary in [CONTEXT.md](../../CONTEXT.md).

## V1 scope

Three surfaces:

- `chatgpt_grounded` (OpenAI Responses API + web search tool)
- `claude_grounded` (Anthropic Messages API + web_search tool)
- `perplexity` (Perplexity Sonar online models — always grounded)

All other `model_surface` enum values exist in the schema but are
unenabled. Adding a surface later is: implement proxy client → add to
`ENABLED_SURFACES` constant → deploy.

## Build sequence

The first four steps are a tracer bullet. Each must land before the next;
parallelising risks rediscovering schema problems on three surfaces.

### 1. Schema migration

One Drizzle migration. Adds:

- `app.model_surface` Postgres enum with all 9 values (`chatgpt_grounded`,
  `chatgpt_ungrounded`, `claude_grounded`, `claude_ungrounded`,
  `gemini_grounded`, `gemini_ungrounded`, `perplexity`, `kimi_grounded`,
  `legacy_unverified`).
- `app.proxy_status` enum: `queued | running | done | failed`.
- `benchmark_run.model_surface` (NOT NULL, default `legacy_unverified`).
- `benchmark_run.proxy_status` (NOT NULL, default `done` so historical
  rows are not picked up by the worker).
- `benchmark_run.proxy_response_raw` JSONB (nullable).
- `benchmark_run.cost_cents` integer (nullable).
- `benchmark_run.provider_response_id` text (nullable).
- New `benchmark_run_source` table: `run_id`, `url`, `domain`, `title`,
  `snippet`, `position`, `kind` (`source|citation`), `source_type`,
  `brand_relation`, `explicit_citation`, `created_at`. Indexes on
  `run_id`, `domain`.
Backfill: every existing `benchmark_run` row is left with `model_surface
= 'legacy_unverified'` and `proxy_status = 'done'`. No data deletion.

The obsolete `benchmark_assignment` table and `assignment_id` columns from
[20260505_benchmark_assignments.ts](../../src/migrations/20260505_benchmark_assignments.ts)
are **not dropped in this step**. They have live dependent code in
`src/server/api/routers/benchmark.ts`, `src/server/benchmark/assignment.ts`,
`src/app/api/mcp/benchmark-tools.ts`, and three UI components. The drop is
deferred to a dedicated step between steps 6 and 7, once the proxy +
worker + router are running and the assignment-flow UI can be removed at
the same time.

**Done when:** migration runs forward and reverse cleanly on a Neon
branch; Drizzle schema types regenerate; existing benchmark routes
compile.

### 2. Proxy client for `chatgpt_grounded`

New module `src/server/benchmark/proxy/`. Single entry point
`runOnSurface({ surface, prompt }) → { rawAnswer, sources[], cost,
providerResponseId, providerModelId, providerModelVersion }`. Internally
dispatches to a per-surface client.

First client only: OpenAI Responses API with the web_search tool. Normalises
the response into the canonical shape (answer text + sources array, where
each source carries the fields the `benchmark_run_source` table expects).

API key from `OPENAI_API_KEY` env var.

**Done when:** unit tests cover one fixture response per supported shape
(text-only answer, answer with citations, answer with sources block).

### 3. Cron worker

New endpoint `src/app/api/cron/benchmark-proxy-runner/route.ts`. On each
tick:

1. Select up to N queued rows (`proxy_status = 'queued'`), ordered by
   `created_at`, where `model_surface` is in `ENABLED_SURFACES` and the
   surface's daily budget has remaining capacity.
2. For each: set `proxy_status = 'running'`, call `runOnSurface`, write
   the answer + sources, set `proxy_status = 'done'` (or `failed` with
   an error reason) and `extraction_status = 'pending'` so the existing
   brand-extractor picks it up downstream.
3. Decrement the surface's day-budget counter.

Daily budget is a per-surface dollar cap in env or config; the worker
tracks spend via `cost_cents` summed for `captured_at >= start of UTC
day`.

Add to `vercel.json` cron list.

**Done when:** inserting a `queued` row manually causes the worker to
populate it on the next tick.

### 4. Re-key one aggregate end-to-end

Add `app.agg_brand_visibility_by_surface` table mirroring
`agg_brand_visibility_by_model` but keyed on
`(brand_id, model_surface, window_days)`. Build function in
`aggregate-brand-visibility.ts` that excludes `legacy_unverified`. Render
one chart on the brand profile page from the new aggregate (model/channel
comparison card from the original design doc).

Leave the old aggregate in place until all charts migrate.

**Done when:** the new chart renders for a brand with at least one
non-legacy run, and the legacy chart still works for historical data.

### 5. Auto-seed on prompt approval

When `benchmark_prompt.status` transitions to `approved`, insert one
`benchmark_run` row per enabled surface whose allowed-locales contain
the prompt's locale, with `proxy_status = 'queued'` and the prompt fields
populated. Locale eligibility lives in a per-surface const in
`src/server/benchmark/proxy/`.

**Done when:** approving a prompt creates the right number of queued
rows and the worker processes them.

### 6. Demand-driven router

New cron `benchmark-router/route.ts`. Hourly. For each enabled surface
with remaining daily budget:

1. Score every `(prompt_id, surface)` cell that is not currently queued
   and whose newest `done` run is older than a refresh threshold (config,
   default 14 days). Score = `completeness_gap_bonus + log(1 +
   brand_profile_views_7d + brand_watch_count) * staleness_days`. Cells
   that close a cross-surface gap (prompt has runs on N−1 surfaces, this
   surface missing) get a fixed bonus.
2. Insert queued rows for the top K within budget.

Cap one in-flight cell per `(prompt, surface)` at any time.

**Done when:** the router produces a stable, explainable queue and
budget is respected.

### 6b. Remove the obsolete assignment flow

Delete the `benchmark_assignment` table and `assignment_id` column from
[20260505_benchmark_assignments.ts](../../src/migrations/20260505_benchmark_assignments.ts),
plus dependent code:

- `benchmarkAssignments` Drizzle table and `benchmark_run.assignmentId`
  column / index in `src/server/db/schema.ts`.
- Assignment procedures in `src/server/api/routers/benchmark.ts`.
- `src/server/benchmark/assignment.ts`.
- `assignmentId` from `src/app/api/mcp/benchmark-tools.ts`.
- `agent-run-modal.tsx`, `benchmark-assignment-panel.tsx`, and the
  `run-prompts-tab.tsx` block that renders the assignment panel.

This is a separate commit so the diff is reviewable as a focused
deletion.

### 7. Surfaces 2 and 3

Implement `claude_grounded` (Anthropic Messages API + web_search tool)
then `perplexity` (Sonar online models). Each adds one file under
`src/server/benchmark/proxy/`, one entry in `ENABLED_SURFACES`, and one
allowed-locales list. No other code changes; the worker, router,
auto-seed, and aggregates pick them up automatically.

Migrate remaining charts on the brand profile to the new surface
aggregate. Drop the old `agg_brand_visibility_by_model` table only after
all charts are migrated.

### 8. Curator surfaces (deferred)

Not in V1. Open design questions tracked separately:

- Extraction-flag UI and dispute/override flow (branch #3).
- Brand claim and DNS verification (branch #4).
- Work-in-flight transparency feed.

V1 ships read-only brand profiles plus the existing prompt-proposal flow.

## Risks

- **Cost.** Daily budgets must be enforced strictly; an unbounded router
  can spend hundreds of dollars in an hour against grounded APIs. Step 3
  must land budget enforcement before any auto-seed flows in step 5.
- **Provider response shape drift.** Each proxy client is a normaliser;
  shape changes from providers break source extraction silently. Fixture
  tests per client are the only guard.
- **Trust messaging.** Legacy rows are marked but the UI must visibly
  distinguish "verified proxy run" from "historical contributor
  submission" or the new trust model is undermined.
- **Cold start.** Until step 5 backfills auto-seed across the existing
  approved prompts, brand profiles will show empty surface columns. A
  one-shot script to enqueue all approved prompts × enabled surfaces is
  needed at step 5 cutover.

## Out of scope

- BYOK or hybrid funding models.
- Region-of-caller simulation.
- The four unenabled surfaces and the four ungrounded variants.
- Curator dispute/override UI.
- Brand claim/verification.
