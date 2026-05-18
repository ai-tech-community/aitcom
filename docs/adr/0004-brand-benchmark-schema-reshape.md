# Brand benchmark schema: `model_surface`, normalized sources, queued proxy runs

**Status:** accepted

Implements the slicing keys from [[adr-0001-brand-benchmark-primary-slice-keys]]
and the proxy execution model from [[adr-0002-ait-mediated-proxy-runs]].

## Decisions

1. **`app.model_surface` Postgres enum.** A single enum collapses
   `(product, grounding)` into one column: `chatgpt_grounded`,
   `chatgpt_ungrounded`, `gemini_grounded`, `gemini_ungrounded`,
   `claude_grounded`, `claude_ungrounded`, `perplexity`, `kimi_grounded`,
   `legacy_unverified`. Only supported combinations exist by construction;
   adding a value is a migration paired with a proxy client.

2. **`benchmark_run.model_surface` is the primary slice key.** Replaces
   `model_id` as the aggregate dimension. Existing `model_provider`,
   `model_id`, `model_version` columns remain on the row as forensic
   metadata (which exact SKU/version the proxy hit), not as slicing keys.

3. **Existing rows backfill to `legacy_unverified`.** New aggregates
   filter them out. They remain on disk and may be displayed in a clearly
   labeled "historical evidence" section. No data deletion.

4. **Proxy-run lifecycle is separate from extraction lifecycle.** Add a
   new column (e.g. `proxy_status`: `queued | running | done | failed`)
   distinct from the existing `extraction_status` (which tracks the
   brand-mention extractor's pass over the answer). Conflating them
   would make the queue worker and the extractor fight over one column.

5. **Normalized `benchmark_run_source` table.** One row per cited URL or
   listed source per run, with `kind` (`source | citation`), `source_type`
   (`editorial | corporate | user_generated | reference | owned_site |
   competitor_site | unknown`), `brand_relation` (`own | competitor |
   neutral | unknown`), `explicit_citation` boolean, position, snippet,
   title. Replaces the design doc's plan to extend `benchmark_citation`.
   Source-visibility and citation-rate metrics aggregate from here.

6. **`benchmark_run.proxy_response_raw` JSONB column.** Stores the full
   verbatim provider response. Enables re-extraction if the extractor or
   source-classifier improves later, and serves as audit evidence.

7. **No assignment / claim model — `benchmark_run` IS the queue.** The
   router inserts `benchmark_run` rows with `proxy_status = 'queued'`
   carrying only `prompt_id` and `model_surface`. The worker locks one,
   sets `running`, calls the proxy, fills in `raw_answer`,
   `proxy_response_raw`, `cost_cents`, `provider_response_id` and the
   `benchmark_run_source` rows, then sets `done`. No separate queue
   table, no assignment table, no claim step. The
   `benchmark_assignment` table introduced in
   [20260505_benchmark_assignments.ts](../../src/migrations/20260505_benchmark_assignments.ts)
   is obsolete in this architecture and should be dropped before it
   accumulates production data. See [[adr-0005-autonomous-queue]].

8. **Aggregates re-key on `model_surface`.** `agg_brand_visibility_by_model`
   becomes `agg_brand_visibility_by_surface`, dropping
   `legacy_unverified` from the denominator. New per-surface aggregates
   for share of voice, average position, sentiment, citation rate.

9. **Queue worker is a new Vercel cron** (`benchmark-proxy-runner`),
   matching the existing pattern (`benchmark-aggregate`,
   `benchmark-weights`). Per-minute tick, bounded batch per invocation,
   per-surface daily budget enforced at claim time.

## Why these together

The schema can't be reshaped incrementally without breaking aggregates.
Capturing the right things at run time (sources, raw response, cost) is
what makes the new metrics defensible — retrofitting later means
re-running every API call. The shape also dictates the queue worker's
contract (it reads cells, writes runs + sources), so deferring the cell
table forces an ugly mid-flight refactor.

## Consequences

- One migration introduces enum, columns, two new tables, and aggregate
  re-keying. Expensive to revert once production runs land.
- Existing tRPC / Drizzle types regenerate; every caller that reads
  `model_id` for grouping needs to switch to `model_surface`.
- The `submit-benchmark-run` MCP tool is deleted (already implied by
  [[adr-0002-ait-mediated-proxy-runs]]); a new `claim-assignment` and
  `request-run` tool surface replaces it.
- Per-surface daily API budgets become a real operational concern: a
  surface with an exhausted budget must reject claims with a clear error.
