# Brand Benchmark BYOA Rebuild Plan

Date: 2026-05-18
Status: **Active**
Supersedes: [2026-05-18-brand-benchmark-rebuild-plan.md](2026-05-18-brand-benchmark-rebuild-plan.md)
(withdrawn — built around AIT-mediated proxy execution; superseded by ADR-0006).

The proxy-direction plan was withdrawn after BYOA was restored. This plan
sequences the implementation work the BYOA-era ADRs imply.

**Read first:**
- [ADR-0001](../adr/0001-brand-benchmark-primary-slice-keys.md) — slice by `model_surface`
- [ADR-0004](../adr/0004-brand-benchmark-schema-reshape.md) — schema additions (`model_surface`, `benchmark_run_source`, by-surface aggregate)
- [ADR-0006](../adr/0006-byoa-community-executes-ait-collects.md) — BYOA framing
- [ADR-0007](../adr/0007-byoa-trust-model.md) — inherited weight, ≥3 surface threshold, no dedup
- [ADR-0008](../adr/0008-byoa-coverage-strategy.md) — open + soft assignments + cosmetic badges
- [CONTEXT.md](../../CONTEXT.md) — glossary

## V1 scope

Three contributor-facing surfaces are in scope for V1:
- `chatgpt_grounded` / `chatgpt_ungrounded`
- `claude_grounded` / `claude_ungrounded`
- `gemini_grounded` / `gemini_ungrounded`

Plus the always-grounded ones (`perplexity`, `kimi_grounded`) — accepted
on submission, no surface-specific UX work yet.

`legacy_unverified` remains a backfill-only marker and is not
user-selectable.

## Out of scope for V1

- Dispute mechanism (deferred per ADR-0007 decision 4).
- AIT-mediated proxy as opt-in supplement (deferred per ADR-0006).
- Outlier visualisation on the cell page.
- Auto-assignment / algorithmic matching of assignments beyond
  "rank by surfaces this contributor has submitted to before".

## Sequence

The order is chosen so each step ships value independently. Earlier
steps can land before later ones are designed.

### Step 1 — Submission path: surface-first form + tRPC + MCP

The most-visible BYOA gap today: `ManualRunForm` and the MCP
`submit-benchmark-run` tool don't collect `model_surface`. Every new
submission lands in `legacy_unverified` and is excluded from
by-surface metrics. Fix the submission paths before anything else.

Files:
- [src/app/[locale]/benchmark/_components/manual-run-form.tsx](../../src/app/[locale]/benchmark/_components/manual-run-form.tsx)
- [src/server/api/routers/benchmark.ts](../../src/server/api/routers/benchmark.ts) (or wherever `submitRun` lives)
- [src/app/api/mcp/benchmark-tools.ts](../../src/app/api/mcp/benchmark-tools.ts)

Changes:
- `benchmark.submitRun` tRPC input: replace `modelProvider` with
  required `modelSurface` enum; `modelId` becomes optional. Derive
  `modelProvider` server-side from a `surface → provider` map.
- `ManualRunForm`: replace provider dropdown with surface dropdown
  using human-readable labels:
  - ChatGPT — with web search
  - ChatGPT — without web search
  - Claude.ai — with web search
  - Claude.ai — without web search
  - Gemini — with web search
  - Gemini — without web search
  - Perplexity *(always grounded)*
  - Kimi *(always grounded)*
  - Helper text: *"Not sure if web search was on? If the answer contains
    source links or citation chips, web search was on."*
  - `modelId` input becomes optional, relabelled "Model version
    (optional, e.g. gpt-5-pro)".
- MCP `submit-benchmark-run`: `model_surface` is a **required** enum.
  Missing → validation error referencing the enum values. No fallback
  to `legacy_unverified` from MCP.

Exit: a logged-in contributor can submit a run via the form and have it
land with the correct `model_surface`. The MCP tool refuses submissions
that don't declare a surface.

### Step 2 — Stamp contributor weight at submission time

Files:
- `src/server/api/routers/benchmark.ts` (`submitRun`)
- A new helper, e.g. `src/server/benchmark/contributor-weight.ts`

Changes:
- New `computeContributorWeight(userId)` reads the user's profile —
  account age, post/forum activity counts, `member_badge` rows,
  `expertiseTags`, `verifiedAt`, brand-owner status — and returns a
  value in `[0.1, 1.0]`. Exact formula is implementation detail; start
  conservative (most-existing-members near 1.0, brand-new accounts at
  0.1, plus a few badge-based boosters).
- `submitRun` calls this and writes the result to `benchmark_run.weight`.
- Add tests covering: new-user baseline, established-member baseline,
  badge influence.

Exit: every contributor-submitted run carries a non-default weight.
Existing `weight = 1.0` rows are left as-is.

### Step 3 — Per-cell surface threshold in aggregates

Files:
- `src/server/benchmark/aggregate.ts` (or the cron under
  `src/app/api/cron/benchmark-aggregate.ts`)
- The by-surface aggregate table (`agg_brand_visibility_by_surface`).

Changes:
- For each `(prompt, model_surface)` cell, compute distinct
  `submitted_by_user_id` count.
- When materialising public aggregates, **only emit rows for cells
  with ≥3 distinct contributors**.
- Below-threshold cells must still be queryable separately so the
  coverage map (Step 4) can read them. Expose either as a separate
  view (`agg_brand_coverage_status`) or via a `meets_threshold`
  boolean.
- Aggregate math uses `weight` from Step 2 (weighted visibility,
  weighted SoV, etc.).

Exit: public brand pages no longer show metrics for cells with <3
contributors, regardless of how many runs exist.

### Step 4 — Coverage map UI

Files:
- New `src/app/[locale]/benchmark/_components/coverage-map.tsx`
- Wire it into the prompt page and the brand page.

Changes:
- For a given prompt or brand, render a grid: rows are prompts (on
  brand page) or surfaces (on prompt page), cells show distinct-
  contributor count and "N more needed" or the metric if surfaced.
- No "claim" button. Click-through goes to either the submission form
  pre-filled with that `(prompt, surface)`, or to existing run
  evidence for the cell.

Exit: a contributor browsing a brand can see at a glance which
`(prompt, surface)` cells need their help.

### Step 5 — Soft assignments: restore the affordance

The `benchmark_assignment` table exists and is restored per ADR-0006.
The previous flow assumed AIT-executed work; the BYOA flow is
contributor-submits-after-grabbing-batch.

Files:
- [src/server/benchmark/assignment.ts](../../src/server/benchmark/assignment.ts)
- [src/app/[locale]/benchmark/_components/benchmark-assignment-panel.tsx](../../src/app/[locale]/benchmark/_components/benchmark-assignment-panel.tsx)
- MCP: a `list-assignments` / `claim-assignment` pair (or repurpose
  whatever currently exists).

Changes:
- Self-serve assignment list: open assignments matched by surfaces the
  contributor has previously submitted to (simple ORDER BY heuristic,
  no ML).
- "Grab" an assignment: marks it as held by the user with an expiry
  (e.g. 7 days). On expiry, returns to the pool.
- Submission flow from inside an assignment: the form is pre-filled
  with the prompt and surface from the assignment; on submit the
  `benchmark_run.assignment_id` is populated.
- Abandoning or only partially completing an assignment has **no
  effect** on the contributor's weight or any score.
- Remove any UI/copy that frames assignments as "work the system will
  execute" or "claims that lock the cell."

Exit: a contributor can browse open assignments, grab one, run the
prompts in their own AI session, and submit answers that come back
into the cell aggregates correctly.

### Step 6 — Cosmetic coverage badges

Files:
- Wherever `member_badge` slugs are defined / awarded.
- A new evaluator that runs after aggregate refresh.

Changes:
- Define badge slugs (e.g. `benchmark-coverage-first-gap`,
  `benchmark-coverage-10`, `benchmark-coverage-50`). Exact thresholds
  and naming TBD in implementation review.
- Awarding logic: when a contributor's run is the one that pushes a
  cell across the ≥3 threshold (or contributes to N such cells in a
  month), award the badge.
- **Do not** read these badges back into the weight formula. They are
  cosmetic.

Exit: contributors who fill gap cells see recognition badges on their
profile. Weight formula is unchanged.

## Cross-cutting cleanup

- Audit copy across `src/app/[locale]/benchmark/**` for any remaining
  language that frames AIT as the executor (e.g. "queued for run",
  "will run shortly", "we'll run this against ChatGPT"). Replace with
  contributor-as-executor copy.
- The work-in-flight panel (mentioned as dead code in ADR-0006) should
  be re-evaluated: is there a BYOA equivalent worth showing
  (in-progress assignments, recent submissions)? If yes, redesign;
  if no, remove.

## What this plan does *not* cover*

- Dispute mechanism (ADR-0007 decision 4 — deferred).
- Optional opt-in AIT-mediated proxy as a supplement (ADR-0006
  open question).
- Outlier visualisation on cell pages.
- Discrepancy detection between declared grounding and pasted text
  (deferred enhancement of the surface picker).
- Weight-formula tuning beyond the initial conservative pass.
