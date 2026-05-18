# BYOA coverage strategy: open submission, soft assignments, cosmetic badges

**Status:** accepted
**Builds on:** [ADR-0006](0006-byoa-community-executes-ait-collects.md),
[ADR-0007](0007-byoa-trust-model.md)

ADR-0006 settled BYOA and flagged coverage strategy as deferred.
ADR-0007 settled the trust mechanics. This ADR settles how contributor
effort is steered toward under-covered cells.

A **coverage cell** is a `(prompt, model_surface)` pair (per
[ADR-0001](0001-brand-benchmark-primary-slice-keys.md)). With ~5–6 active
surfaces and N approved prompts, the cell space is large. The
≥3-distinct-contributor surface threshold from ADR-0007 makes coverage a
real concern: popular cells will saturate, long-tail cells will starve.

## Decisions

### 1. Open submission is the floor

Any contributor may submit a run for any approved prompt on any
supported surface at any time. No claim, no allocation, no queue. The
submission UI is always available.

**Why:** the contributor is the protagonist. Any gate that says "you may
not submit unless assigned" re-creates the autonomous-queue model
ADR-0005 was unwound for. Open submission is the canonical path; every
other mechanism in this ADR is layered on top.

### 2. A visible coverage map shows where help is needed

The benchmark UI surfaces a coverage indicator on each prompt and each
brand page: how many distinct contributors have submitted on each
surface, how many more are needed to reach the ≥3 threshold. This makes
gap-filling work legible without coercing it.

The coverage map is informational, not transactional — there is no
"claim" button on it.

### 3. Soft assignments are an affordance, not a queue

The `benchmark_assignment` table (restored per ADR-0006) holds curated
batches: "here are 5 under-covered prompts on Claude-grounded." A
contributor can grab an assignment, run the prompts in their own AI
session, and submit. They can also ignore it, abandon it, or run some
and not others. **Nothing about the system penalises an unfinished or
abandoned assignment.** Assignments expire after a time window (TBD in
implementation) and are simply released back.

Assignments are matched by a self-serve list ranked by surfaces the
contributor has previously submitted to. No algorithmic auto-assignment.

**Why:** ADR-0006 explicitly restored the assignment table while
re-framing it as an affordance. The contributor decides what they do;
the system gives them a curated starting point if they want one.

### 4. Cosmetic coverage badges, not weight-changing rewards

Contributors who fill gap cells can earn recognition badges via the
existing `member_badge` table — e.g. "Coverage Champion: filled 10 gap
cells this month." These badges are visible on the profile and on run
provenance, but they **do not feed back into the weight formula in
ADR-0007**.

**Why:** weight comes from existing community standing (ADR-0007
decision 1). A coverage-derived signal that loops into weight
re-creates the benchmark-private reputation system that decision was
rejecting. Cosmetic recognition aligns the social signal with effort
without inverting the weight rule.

### 5. No bounties that change weight

Explicitly rejected: point-bounties or weight-bonuses for filling gap
cells. Gamifying weight contradicts ADR-0007 decision 1.

## Consequences

- The existing `benchmark_assignment` table is retained. Schema is
  unchanged by this ADR.
- A coverage-map computation is needed: distinct submitter count per
  `(prompt, model_surface)`. This is the same data the
  surface-threshold aggregator already needs (ADR-0007 decision 2);
  they share the underlying query.
- A self-serve assignments list (tRPC + UI) is in scope. The
  autonomous-queue worker, demand-router, and claim-then-execute flow
  from ADR-0005 stay deleted.
- Coverage badges integrate with the existing `member_badge` table.
  Slugs introduced by this work need to be documented in code where
  the badge slugs are defined.

## What this ADR does *not* settle

- Assignment expiry duration.
- Whether assignments are visible only to logged-in contributors or
  also surfaced publicly as a "ways to help" callout.
- The exact rank-by-prior-surface formula for the self-serve list.
- The list of cosmetic badge slugs (e.g. thresholds, naming).
