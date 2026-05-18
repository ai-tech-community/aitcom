# Brand-benchmark runs execute on an autonomous queue, not on curator claims

**Status:** superseded by [ADR-0006](0006-byoa-community-executes-ait-collects.md)

> **Historical note.** This ADR described an autonomous AIT-driven queue
> built on the (superseded) proxy execution model from ADR-0002. Under
> BYOA there is no AIT-side execution, so the "autonomous queue" idea
> does not apply. ADR-0006 sets the corrected direction. The text below
> is preserved as the record of how the reasoning went wrong.

Refines [[adr-0003-community-as-curators]] and revises the assignment-cell
direction taken in an earlier draft of [[adr-0004-brand-benchmark-schema-reshape]].

The brand-benchmark queue runs autonomously within budget. Two queueing
triggers and no claim step:

1. **Auto-seed.** When a prompt is approved, the system inserts one
   `benchmark_run` row in `proxy_status='queued'` per enabled
   `model_surface`. Invariant: every approved prompt has baseline
   coverage on every supported surface.
2. **Demand-driven refresh.** A routing job scores cells primarily on
   **cross-surface completeness for demanded prompts** — a prompt that
   has recent runs on N−1 surfaces but is missing one scores highest,
   weighted by brand-profile views and brand-watch counts touching the
   prompt. The router enqueues high-score cells within each surface's
   daily budget.

A separate cron worker (`benchmark-proxy-runner`) processes queued rows
in FIFO-within-priority order, calling the model API via the proxy.

**Why no claim step:** Once AIT funds and executes every call
([[adr-0002-ait-mediated-proxy-runs]]), there is no contributor decision
or capacity that gates a run. A "claim" button would be ceremony — the
system can just run the next-best cell. Curators do meaningful
curatorial work (propose, upvote, flag, claim a brand profile,
discuss); they do not need to broker work the system can broker itself.

**Why cross-surface completeness as the primary score:** The benchmark's
stated purpose is comparing the same prompt across products. A cell
that closes a cross-surface gap directly produces a complete
comparison row that wouldn't exist otherwise. Pure-freshness routing
keeps the dataset current but doesn't add comparison depth; a weighted
composite of many signals is harder to reason about and tune.

**Consequences:**

- The `benchmark_assignment` table (and the `assignment_id` foreign keys
  added in
  [20260505_benchmark_assignments.ts](../../src/migrations/20260505_benchmark_assignments.ts))
  is dropped — replaced by lifecycle state directly on `benchmark_run`.
- "Guided assignment" UI from the 2026-05-05 design doc is removed.
  The curator-facing replacement is a transparent **work-in-flight
  feed** ("47 ChatGPT runs done today / 3 queued / budget refreshes at
  00:00 UTC"), not a claim list.
- Budget exhaustion is silent to curators by design — queued rows
  simply sit until budget resumes the next day. The work-in-flight
  feed surfaces the wait reason.
- Brand owners or other future "priority claim" privileges can be
  added later as a small router input (bumps the score for cells
  matching their brand), without resurrecting the assignment table.
