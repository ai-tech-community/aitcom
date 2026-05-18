# Context

Glossary of canonical terms used across the codebase. Implementation details
belong in code or ADRs, not here.

## Benchmark domain

### Benchmark

In this repo, "benchmark" refers to two distinct systems. Default to the
**brand benchmark** unless context clearly says otherwise.

- **Brand benchmark** — community-driven measurement of how AI products
  surface brands when answering real-world prompts. The user-facing product
  surface. Lives under `src/server/benchmark/*`,
  `src/app/[locale]/benchmark/*`. Tables: `benchmark_prompt`, `benchmark_run`,
  `benchmark_brand_mention`, `benchmark_citation`, `brand`, plus aggregates.
- **Quiz benchmark** — older multiple-choice agent-scoring system. Tables:
  `benchmark_question`, the `benchmark_run` introduced in
  [20260312_benchmark_tables.ts](src/migrations/20260312_benchmark_tables.ts),
  `benchmark_answer`, `benchmark_vote`. Not the cross-model brand-tracking
  product. Treat as a separate domain.

> Two different tables are both called `benchmark_run`. The brand-benchmark
> `benchmark_run` is the one with `prompt_id`, `model_provider`, `model_id`,
> `raw_answer`. The quiz `benchmark_run` has `score_percent`.

### Model product

The user-facing AI product the run was performed in: ChatGPT, Gemini, Claude,
Perplexity, Kimi, etc. The **primary slicing dimension** for brand-benchmark
metrics. Same prompt, different products is the comparison the benchmark
exists to surface.

Not the same as:

- **Model ID** — the specific underlying model (`gpt-4o-2024-08-06`,
  `claude-sonnet-4-5`). A finer attribute, not the primary slice. Most
  contributors don't know which version their app used.
- **Provider** — the company (OpenAI, Anthropic, Google, Moonshot). Coarser
  than product. One provider can ship multiple products (ChatGPT, Sora).

### Grounding mode

Whether a run had live web search / retrieval at answer time. Co-primary slice
with **model product**. A grounded ChatGPT answer and an ungrounded `gpt-4o`
API call return radically different brand outputs from the same prompt;
averaging them would make the benchmark misleading.

Two ChatGPT runs with different grounding modes are not comparable as the
same datapoint.

### Run

One submission of one **prompt** in one **model product** at one **grounding
mode** by one human contributor. The atomic evidence unit. Brand mentions
and citations hang off a run.

The contributor runs the prompt in their own AI product session (ChatGPT,
Claude.ai, Gemini app, Perplexity, Kimi, an MCP-driven local agent, etc.)
and submits the raw answer text + self-declared metadata to AIT. AIT does
**not** call model APIs. See [[adr-0006-byoa-community-executes-ait-collects]].

### Prompt

An approved benchmark question text (e.g. "best CRM for small teams"). The
unit users compare across products. Curated through the existing
`benchmark_prompt` table and approval flow.

### Brand mention

An occurrence of a brand inside the raw answer of a run. Carries rank,
sentiment, confidence, and links back to the canonical `brand` row when
matched.

### Citation

A source URL the model attributed in its answer. Only meaningful for grounded
runs.

### Assignment

A curated bundle of prompts handed to a contributor as an affordance:
"here are five prompts; run them in your ChatGPT/Claude/Gemini and submit
the output." An assignment is *not* server-side executable work — the
contributor decides whether and when to run it. Assignments are
self-serve, expire if untouched, and **carry no penalty for abandonment
or partial completion**. See [[20260505_benchmark_assignments.ts]] and
[[adr-0008-byoa-coverage-strategy]].

### Coverage cell

A `(prompt, model_surface)` pair — equivalently `(prompt, product,
grounding)` since `model_surface` collapses product+grounding. The unit
the coverage map thinks in: a cell with fewer than 3 distinct
contributors is **under-covered** and its aggregated metric is not yet
shown publicly. See [[adr-0007-byoa-trust-model]] decision 2.

### Coverage map

The UI affordance that makes gap cells legible — shows distinct
contributor count per `(prompt, model_surface)` and how many more are
needed to reach the surfacing threshold. Informational, not
transactional: there is no "claim cell" button on the map. See
[[adr-0008-byoa-coverage-strategy]].

### Contributor weight

A per-run numeric (`benchmark_run.weight`, range `[0.1, 1.0]`) stamped
at submission time from the contributor's existing AIT profile —
account age, post activity, `member_badge` entries, `verifiedAt`,
brand-owner status, etc. Inherited from the broader social platform;
**benchmark submissions do not themselves earn weight**. See
[[adr-0007-byoa-trust-model]] decision 1.

### Surface threshold

The rule that per-cell aggregated metrics (visibility, share of voice,
etc.) are only displayed publicly once at least **3 distinct
contributors** have submitted to that cell. Individual runs are visible
beforehand on the run page and the contributor's profile; only the
aggregated metric is gated. See [[adr-0007-byoa-trust-model]] decision 2.

### Community role

Executors and curators. The community **runs** the prompts (in their own
AI product sessions) and submits the outputs. They also propose prompts,
upvote, claim brand profiles, flag mentions, and discuss methodology.
See [[adr-0006-byoa-community-executes-ait-collects]].

### Trust

Per-run fabrication is undetectable. The benchmark relies on:
- volume across contributors per cell (≥3 distinct contributors before
  per-cell metrics surface publicly — the **surface threshold**);
- per-run **contributor weight** inherited from existing community
  standing;
- no dedup — every submission is a separate evidence point;
- visible provenance (who submitted, when, which surface);
- a **dispute mechanism deferred** until disputes actually occur.

This is a deliberate tradeoff against the AIT-proxy alternative that was
considered and rejected. See [[adr-0006-byoa-community-executes-ait-collects]]
for the framing and [[adr-0007-byoa-trust-model]] for the mechanisms.
