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
contributor decides whether and when to run it. See
[[20260505_benchmark_assignments.ts]] and
[[adr-0006-byoa-community-executes-ait-collects]].

### Coverage cell

A `(prompt, product, grounding)` triple. The unit the assignment
distribution thinks in: a cell with few recent runs across the contributor
pool is under-covered.

### Community role

Executors and curators. The community **runs** the prompts (in their own
AI product sessions) and submits the outputs. They also propose prompts,
upvote, claim brand profiles, flag mentions, and discuss methodology.
See [[adr-0006-byoa-community-executes-ait-collects]].

### Trust

Per-run fabrication is undetectable. The benchmark relies on:
- volume across contributors per cell;
- visible provenance (who submitted, when);
- reputation / weighting / dispute mechanisms (specifics open — to be
  designed).

This is a deliberate tradeoff against the AIT-proxy alternative that was
considered and rejected. See ADR-0006 for the reasoning and the
[superseded ADR-0002](docs/adr/0002-ait-mediated-proxy-runs.md) for the
alternative.
