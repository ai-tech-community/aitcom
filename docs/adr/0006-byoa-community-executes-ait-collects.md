# Contributors execute, AIT collects: BYOA brand benchmarking

**Status:** accepted
**Supersedes:** [ADR-0002](0002-ait-mediated-proxy-runs.md),
[ADR-0003](0003-community-as-curators.md),
[ADR-0005](0005-autonomous-queue.md)

The brand benchmark is a **bring-your-own-agent** (BYOA) system.
Contributors take an approved prompt, run it in their own AI product
session — ChatGPT, Claude.ai, Gemini app, Perplexity, Kimi, an MCP-driven
local agent, anything — and submit the raw answer (plus the model/grounding
metadata they declare) back to AIT. AIT does **not** call model APIs.

This reverses the direction taken in ADRs 0002, 0003, 0005, which assumed
AIT-mediated proxy execution with AIT-funded API keys. That direction
emerged from grilling that overweighted fraud-resistance and lost the
social-platform framing the system exists to support. The mistake is on
the record: ADRs 0002/0003/0005 are kept marked superseded rather than
deleted so the reasoning trail stays auditable.

## Why BYOA

- **Social platform first.** The benchmark is part of an IT Community
  product. The product *is* the act of contributors comparing what
  different AI products say. A community whose only role is "claim
  brand profiles and flag mentions" is an editorial board for an
  AIT-owned dataset, not a community contributing evidence.
- **Real product coverage.** The literal ChatGPT.com / Claude.ai /
  Gemini app outputs (grounded with web search, configured per the
  user's account, with their region's IP) are what users care about
  comparing. The closest API equivalents differ in subtle ways and
  miss the product experience entirely. Only a human pasting from the
  real product can capture those outputs faithfully.
- **No central spend.** AIT is not the model bill payer. There is no
  daily budget ceiling on coverage; coverage scales with contributor
  effort.

## What this means structurally

- **A run is a contributor submission.** `benchmark_run` rows are
  created by contributors, not by a server-side worker. Each row
  carries the contributor's user id, the surface they declare they
  used, and the raw answer text they paste in.
- **Trust is statistical, not structural.** Per-run fabrication is
  undetectable. The system must accept that and rely on volume,
  reputation, consensus across contributors, and visible provenance.
  Specific mechanisms (reputation weighting, dispute flagging,
  minimum sample sizes before metrics surface) are tracked as open
  questions for a follow-on design conversation.
- **Assignments are an affordance, not a queue the system processes.**
  An assignment is a curated bundle of prompts handed to a contributor
  ("here are 5 prompts, run them in ChatGPT and submit the output").
  The system gives contributors a clear set of work; contributors
  decide what they do. Compare with the autonomous-queue model in
  ADR-0005, which assumed AIT executed claimed assignments.
- **The (model product, grounding) slice still matters.** Same prompt
  in ChatGPT-grounded vs ChatGPT-ungrounded vs Claude-grounded
  produces different brand evidence and must be compared separately.
  ADR-0001's slicing rule survives the pivot unchanged.

## What is explicitly *not* in this ADR

- **Trust mechanism design** (reputation, weighting, dispute flow,
  consensus rules).
- **Coverage strategy** (assignments vs bounties vs open submission
  vs hybrid).
- **Dedup rule** (one per contributor per (prompt, surface, day)?
  aggregate all? per-session?).
- **Grounding self-declaration** (UI prompts, defaults, sanity
  checks).
- **Whether AIT-mediated proxy runs ever return as an opt-in
  supplement** (e.g. for prompts no contributor has covered).

Each of these is a real design decision that was bulldozed past
during the first grilling session. They need their own conversation
on the BYOA premise before being committed to.

## Consequences

- Proxy clients, proxy-runner cron, demand-router cron, auto-seed
  approval hook, pricing tables, locale-eligibility tables, and the
  AIT-as-executor framing of the work-in-flight panel are dead code
  and are removed.
- `benchmark_run.submitted_by_user_id` returns to its original role:
  required-ish identifier of the human who submitted the row. The
  recent migration making it nullable stays in place — proxy-style
  workflows might still come back later as a supplement — but BYOA
  submissions populate it.
- `benchmark_assignment` table and the assignment tRPC/UI/MCP surface
  are restored. The flow that was removed assumed contributors
  claiming AIT-executed work; in BYOA the flow is "contributor claims
  a guided batch and submits answers manually". Shape may change but
  the table is needed.
- `ManualRunForm` and the MCP `submit-benchmark-run` tool, which I
  had flagged for removal under the proxy model, are restored to
  first-class status. They are the BYOA submission paths.
- Schema additions from the rebuild (`model_surface`, `proxy_status`,
  `benchmark_run_source`, by-surface aggregate, brand-profile
  surface card) all stay — they describe the unit of measurement, not
  who executes it.
