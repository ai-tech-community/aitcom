# AI Brand Bias Benchmark — Design

Date: 2026-04-20
Status: Design approved, pending spec review before plan.

## Summary

Replace the existing correctness-quiz benchmark at `/benchmark` with a community-driven **AI Brand Bias Benchmark**: members submit exploratory prompts, AIT-registered agents run approved prompts against their own models, and a community-hosted extractor agent parses raw answers into structured brand mentions. A public dashboard surfaces brand trends — which brands AI models recommend, by vertical, by intent, by model, over time. Goal: produce the first community dataset + leaderboard of model-level brand bias.

## Goals

- Community-curated prompt library, two-dimensional taxonomy (category × intent).
- Agent-first submission path (MCP/API), web fallback for humans.
- Raw answers stored forever; extraction decoupled and re-runnable as taxonomy improves.
- Public dashboard with multiple chart widgets showing brand trends, model bias, and time drift.
- Trust model: member-gated submissions + statistical outlier down-weighting.

## Non-Goals (MVP)

- Agent vetting / tier-based trust (D from Q7): deferred.
- Paid brand profile pages / monetization layer: deferred.
- Automatic brand website enrichment / logos: manual at first.
- Locale support beyond `en-US`: schema allows, UI does not expose.
- Migration of existing quiz data: old benchmark tables are dropped.

## Scope vs Current Codebase

**Replace (delete, breaking):**
- `src/server/api/routers/benchmark.ts` (current correctness-quiz router).
- DB tables: `benchmarkQuestions`, `benchmarkRuns`, `benchmarkAnswers`, `benchmarkVotes`.
- Constants: `src/lib/benchmark-constants.ts` (`BENCHMARK_TOPICS`, `BENCHMARK_DIFFICULTIES`).
- Any frontend page/components under `/benchmark` route that render the quiz UI.

**Reuse:**
- `agent-management` router + agent API keys for agent auth on `submitRun`/`submitExtraction`.
- `webhook-dispatch` for firing `benchmark.run.created` to the extractor agent.
- Payload admin panel for prompt approval + brand alias triage.
- Member auth from existing tRPC context.

**Add (new deps):**
- `recharts` for dashboard charts (not currently in `package.json`).

## Data Model

All new tables under the `benchmark*` namespace. Prior tables dropped in the same migration.

### `benchmarkCategories`
Hierarchical. Admin-managed via Payload.
- `id` (pk), `slug` (unique), `name`, `parentId` (nullable self-fk), `description`, `createdAt`, `updatedAt`.

### `benchmarkIntents`
Small enum-style table. Seeded with: `recommendation`, `comparison`, `best-for-persona`, `brand-recall`, `ranked-list`, `pros-cons`. Extendable by admin.
- `id` (pk), `slug` (unique), `name`, `description`, `createdAt`.

### `benchmarkPrompts`
The approved (or pending) prompt pool.
- `id` (pk), `text` (not null), `categoryId` (fk), `intentId` (fk), `locale` (default `en-US`), `status` (`pending`/`approved`/`rejected`), `submittedByUserId` (fk users), `approvedByUserId` (fk users, nullable), `approvedAt`, `notes` (admin-only), `createdAt`, `updatedAt`.
- Unique index on `(lower(text), categoryId, intentId, locale)` to dedupe near-identical submissions.

### `benchmarkRuns`
One row per model execution submitted by user or agent.
- `id` (pk), `promptId` (fk), `submittedByUserId` (fk), `agentId` (fk agents, nullable), `modelProvider` (free-text, constrained by enum: `openai`, `anthropic`, `google`, `meta`, `mistral`, `xai`, `other`), `modelId` (free-text, e.g. `gpt-5-pro-2026-03`), `modelVersion` (nullable, e.g. API `x-model-version` header), `temperature` (float, nullable), `rawAnswer` (text), `locale`, `capturedAt` (timestamp, client-reported), `receivedAt` (server default now()), `extractionStatus` (`pending`/`processing`/`done`/`failed`), `extractionAttempts` (int default 0), `weight` (float default 1.0), `createdAt`.
- Index: `(promptId, modelId, capturedAt)`.
- Index: `(extractionStatus)` for extractor worker polling.
- Unique constraint: `(submittedByUserId, promptId, modelId, date_trunc('day', capturedAt))` — 1 submission per user per prompt per model per day.

### `brands`
Normalized brand registry.
- `id` (pk), `canonicalName`, `slug` (unique), `aliases` (text[]), `website` (nullable), `categoryIds` (int[], loose association), `verified` (bool, admin-set), `createdAt`, `updatedAt`.

### `benchmarkBrandMentions`
One row per brand reference extracted from a run.
- `id` (pk), `runId` (fk), `rawMention` (text), `brandId` (fk brands, nullable — null means unresolved), `rank` (int, nullable, 1-based position if answer is a ranked list), `sentiment` (`positive`/`neutral`/`negative`), `context` (short snippet, <= 280 chars), `confidence` (float 0-1), `extractorVersion` (string, the extraction prompt version that produced this), `createdAt`.
- Index: `(brandId, runId)`.
- Index: `(runId)`.

### `brandAliasQueue`
Unresolved mentions for admin triage.
- `id` (pk), `rawMention`, `suggestedBrandId` (fk brands, nullable), `runId` (fk), `occurrenceCount` (int, incremented when same string re-appears), `status` (`pending`/`merged`/`rejected`), `reviewedByUserId` (nullable), `reviewedAt`, `createdAt`.
- Unique index on `lower(rawMention)` so repeated unknowns coalesce.

### Aggregate tables (materialized; refreshed on cron)
Read-optimized; rebuilt hourly (or on-demand after large batch extractions).

- `aggBrandRankByPrompt`: `(promptId, brandId, modelId, windowDays, mentionCount, weightedScore, avgRank, sentimentPositivePct, sentimentNeutralPct, sentimentNegativePct, updatedAt)`.
- `aggBrandTrendsByDay`: `(brandId, modelId, categoryId, date, mentionPct, runCount, updatedAt)`.
- `aggModelBiasMatrix`: `(promptId, modelId, topBrandIds jsonb, updatedAt)` — precomputed top-5 brand ranking for fast heatmap render.

## Submission Flow

1. Member opens `/benchmark` → **Submit Prompt** tab → fills text + category + intent → `benchmark.submitPrompt` tRPC mutation inserts row with `status='pending'`.
2. Admin reviews in Payload → approves → `status='approved'`.
3. Member (or their agent) opens **Run Prompts** tab, selects an approved prompt.
4. For humans: **Manual submit** form — paste raw answer + select model + click submit.
5. For agents: agent reads approved prompt list via `benchmark.listApprovedPrompts` (public or agent-authed), runs it against its model, posts result to `benchmark.submitRun` with agent API key.
6. Server creates `benchmarkRuns` row (`extractionStatus='pending'`), enforces per-user-per-prompt-per-model-per-day uniqueness.
7. Webhook event `benchmark.run.created` dispatched via existing `webhook-dispatch`.

## Extraction Pipeline

Extractor = AIT-owned registered agent (same agent-management primitives any member uses — we dogfood).

1. Extractor agent subscribes to `benchmark.run.created` webhook.
2. On event, agent fetches `{promptText, rawAnswer, knownBrandsInCategory}` via `benchmark.getRunForExtraction` (agent-authed).
3. Agent calls its configured extraction model (Haiku-class) with a **versioned fixed prompt** (stored in `src/server/benchmark/extractor-prompt.ts`, exported as `EXTRACTOR_PROMPT_V1`).
4. Model returns JSON array: `[{rawMention, suggestedBrandSlug?, rank?, sentiment, context, confidence}]`.
5. Agent posts back via `benchmark.submitExtraction` with `{runId, extractorVersion, mentions[]}`.
6. Server:
   - Sets `extractionStatus='processing'` at start, `'done'` on success.
   - For each mention: if `suggestedBrandSlug` matches a `brands.slug` or alias, resolve `brandId`. Otherwise insert/update `brandAliasQueue`.
   - Inserts `benchmarkBrandMentions` rows with `extractorVersion`.
7. On failure: increment `extractionAttempts`. After 3 attempts → `extractionStatus='failed'`. Admin can manually re-queue.

Re-extraction: admin can bump `EXTRACTOR_PROMPT_V2`, run backfill command `pnpm benchmark:reextract` which resets `extractionStatus='pending'` for target runs and re-fires webhooks. Old mention rows kept (or pruned by `extractorVersion` — TBD at plan time, lean toward keeping for reproducibility audit).

## Aggregation & Weighting

Cron job (hourly, same mechanism as existing project cron if present; otherwise Next.js scheduled route) rebuilds aggregate tables.

**Weight recompute (nightly):** For each `(promptId, modelId)` window (30d), compute agreement: `weight = min(1.0, mentionsOfThisBrandFromDistinctUsers / medianDistinctUsersAcrossAllBrands)`. Persisted on `benchmarkRuns.weight`. Used by `aggBrandRankByPrompt.weightedScore`. Raw count always displayed alongside weighted count for transparency.

## API Surface (tRPC router `benchmark`)

Public:
- `listCategories()` — tree of categories.
- `listIntents()`.
- `listApprovedPrompts({ categoryId?, intentId?, search?, page })`.
- `getPromptDashboard(promptId)` — aggregated widgets for one prompt.
- `getBrandProfile(slug)` — brand detail page data.
- `getCategoryLeaderboard(categoryId, windowDays)`.
- `getTrend({ brandId, modelId?, windowDays })`.
- `getLatestRunsFeed(limit)`.

Member (protected):
- `submitPrompt({ text, categoryId, intentId, locale })`.
- `listMySubmissions()` — pending/approved prompts + my recent runs + extraction status.
- `submitRun({ promptId, modelProvider, modelId, modelVersion?, temperature?, rawAnswer, locale, capturedAt? })` — `capturedAt` defaults to server time if the client does not supply it (manual web submissions often won't know it).

Agent-authed (protected, agent API key):
- `submitRun` — same payload, uses `agentId` from key.
- `getRunForExtraction(runId)` — extractor fetch.
- `submitExtraction({ runId, extractorVersion, mentions[] })`.

Admin (Payload):
- Prompt approval queue.
- Brand alias queue (merge / reject / create new brand).
- Brand CRUD.
- Manual re-extract button per run.

## UI — `/benchmark` page, tab-based

Three tabs, rendered as a Tab component (project convention to be confirmed in plan stage; likely existing shared `Tabs` primitive).

**Tab 1 — Submit Prompt**
- Form fields: prompt text (textarea), category (tree picker), intent (dropdown), locale (hidden en-US for MVP).
- Below form: list of user's own submissions with status badges.
- Submit → toast confirm, entry appears as `pending`.

**Tab 2 — Run Prompts**
- Filter row: category, intent, search, sort (newest / most-run).
- List of approved prompts. Each card:
  - Prompt text, category, intent, run count, last-run timestamp.
  - Two CTAs: **Run with my agent** (opens modal with MCP/API snippet + agent-key picker) and **Submit manual run** (expands inline form: model provider, model id, paste raw answer, captured timestamp, submit).
- Below list: user's recent runs with extraction status badges.

**Tab 3 — Dashboard** (public, no auth required)
Widget grid (responsive; 2-col desktop, 1-col mobile):
1. **Prompt focus** — prompt selector + bar chart of top 10 brands by weighted score. Toggle: raw vs weighted.
2. **Model bias matrix** — prompt selector (shares state with #1) + heatmap (rows = models, cols = top brands, cells = mention %).
3. **Brand trend** — brand selector + model multi-select + 30/90/365-day line chart of mention %.
4. **Category leaderboard** — category selector + horizontal bar chart of top 10 brands across all prompts in that category.
5. **Brand profile entry** — search/autocomplete → links to `/benchmark/brands/[slug]` detail page.
6. **Latest runs feed** — vertical list ticker, compact, shows prompt + model + capturedAt (social proof, live feel).

Chart library: **Recharts** (new dep). Accessible, SSR-friendly, matches the stack.

## Testing Strategy

- Unit tests for extractor JSON parse + brand resolution logic.
- Unit tests for weight computation formula.
- Integration tests for tRPC procedures (submit prompt, approve, submit run, submit extraction, aggregate query).
- Seed script `pnpm benchmark:seed` populating sample categories/intents/brands/prompts for local dev.
- E2E smoke (Playwright or project's existing e2e harness — confirm at plan time) covering: submit prompt → admin approve → submit run → extractor callback → dashboard reflects new mention.

## Risks & Open Questions (flagged for plan stage, not blocking design)

- **Chart library choice:** assumed Recharts; confirm it doesn't conflict with existing bundle size goals.
- **Cron infra:** project may or may not have a cron runner — the plan will pick between Next.js scheduled routes, a worker process, or Payload hooks.
- **Agent auth boundary:** confirming whether `agent` API keys already grant writes to new procedures by default or need explicit scope.
- **Re-extraction retention:** keep all historical mention rows per run (full reproducibility) vs replace on new extractor version (simpler). Plan will decide.
- **Prompt duplication fuzziness:** the exact-match unique index may let near-duplicates through ("Best CRM" vs "Best CRM?"). Admin review catches most, but a normalized-text column may be useful later.

## Rollout

1. Migration drops old benchmark tables + creates new schema.
2. Seed base categories (SaaS, E-commerce, Travel, Finance, DevTools, AI Tools, Health, Media) + intents + ~20 starter brands per category.
3. Deploy backend + admin UI.
4. Register AIT extractor agent; point webhook.
5. Seed 10-20 starter approved prompts to prime dashboard.
6. Ship frontend tabs.
7. Announce to community — call for prompt submissions.
