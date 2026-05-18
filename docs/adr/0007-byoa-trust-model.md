# BYOA trust model: inherited standing, distinct-contributor threshold, no dedup

**Status:** accepted
**Builds on:** [ADR-0006](0006-byoa-community-executes-ait-collects.md)

ADR-0006 settled the BYOA premise (contributors execute, AIT collects) and
flagged trust mechanics as deferred. This ADR resolves them.

The shape: under BYOA, per-run fabrication is undetectable, so trust is
statistical. The mechanisms below take three independent stances —
*how each run is weighted*, *when a per-cell metric becomes public*, and
*how multiple runs from the same contributor combine* — and pick the
simplest choice in each that keeps the contributor-as-protagonist framing
intact.

## Decisions

### 1. Contributor weight is inherited from existing community standing

Every `benchmark_run` carries a `weight` (already on the table, defaulting
to `1.0`). The weight is computed at submission time from the
contributor's existing AIT profile — account age, post / forum activity,
`member_badge` entries, `expertiseTags`, `verifiedAt`, brand-owner
verification — capped to `[0.1, 1.0]`. The exact formula is an
implementation detail not pinned by this ADR.

New accounts start near `0.1`. Long-standing members start near `1.0`.
**Benchmark submissions do not themselves earn weight.** Reputation comes
from the broader social platform; the benchmark consumes it.

**Why:** the social-platform framing is the whole point. A benchmark-
private reputation system re-litigates who the contributor is on every
submission, which is the curators-not-executors smell that ADR-0006
rejected. Inheriting standing also avoids the circular-loop problem
(weight earned from runs deciding whose runs count) and the chicken-and-
egg problem on fresh cells with no cluster to agree with.

**Tradeoff accepted:** a brigade of long-standing community members could
submit bad runs and they would count heavily. The dispute mechanism
below (decision 4) is the answer to this when it actually happens.

### 2. Per-cell public metrics require ≥ 3 distinct contributors

`benchmark_run` rows are written and visible (on the run page, the
contributor's profile, and any "recent submissions" view) the moment they
land. But **per-cell aggregated metrics** — visibility, share of voice,
average position, sentiment, citation rate for a given
`(prompt, model_surface)` — are not exposed publicly until at least 3
distinct contributors have submitted to that cell.

Below the threshold, the cell is shown in the coverage map (see
[ADR-0008](0008-byoa-coverage-strategy.md)) as "needs N more
contributors" rather than as a number.

**Why:** showing "ChatGPT-grounded mentions Acme 100% of the time" off
n=1 is misleading whatever the weight. The threshold gates *publication*,
not *evidence*: the contributor's run still exists and is visible,
which preserves the "your submission is real evidence" feel.

**Why distinct-contributor, not weight-sum:** the rule has to be
explainable to contributors. "This cell needs 2 more people to show up"
is concrete; "this cell needs 0.7 more weight units" is not.

### 3. No dedup — every run is an evidence point

A contributor may submit any number of runs for the same
`(prompt, model_surface)`. All runs are stored. All runs contribute to
metric computation, each weighted by submitter standing (decision 1).
Old runs are never replaced, hidden, or downweighted by recency *for
dedup reasons*. (The aggregator is free to apply a time-decay window
for other reasons.)

**Why:**

- LLMs are non-deterministic. Two back-to-back ChatGPT-grounded runs on
  the same prompt can return different brand evidence. Both are real.
- AI products change over time. The same contributor running the same
  prompt last month and today captures product drift — a first-class
  story the benchmark exists to surface.
- The distinct-contributor surface threshold (decision 2) already
  prevents one person from flooding a cell into visibility.

**Tradeoff accepted:** a power-submitter does get marginally more
influence on the *value* of a metric (not on whether it surfaces).
This is acceptable; their runs are still weight-bounded.

### 4. Disputes are deferred until they exist

The mechanisms above produce noise the system tolerates rather than
filters. A dispute flow — flag a run as bad, lower the submitter's
inherited weight when disputes are upheld — is the right escape valve
for the brigade scenario (decision 1) and for genuinely bad-faith
submissions. **It is not built upfront.** Design it against real
submissions once the system has runs flowing, not against imagined
ones.

This ADR explicitly defers:

- The dispute UI (where the flag button lives, who sees it, what state
  it produces).
- The weight-adjustment math when a dispute is upheld.
- Whether disputes are public or moderator-mediated.

## Consequences

- `benchmark_run.weight` already exists. Submission paths must compute
  and stamp it at insert time from the submitter's profile.
- Aggregate queries (`agg_brand_visibility_by_surface`, etc.) must
  filter to `≥ 3 distinct submitted_by_user_id` per
  `(prompt, model_surface)` before exposing per-cell numbers. Below the
  threshold the per-cell metric is not computed for public display.
- No new tables. Disputes will land in a follow-on ADR if and when
  built.
- The aggregator continues to exclude `model_surface = 'legacy_unverified'`
  from numerator and denominator per ADR-0004.

## What this ADR does *not* settle

- The exact weight formula (which signals, which weights, decay).
- The aggregation time window.
- Outlier visualisation (showing one run that disagrees with the
  cluster) — a UI question, not a trust-mechanism question.
- Dispute mechanics (see decision 4).
