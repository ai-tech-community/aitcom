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
mode** by one contributor's agent. The atomic evidence unit. Brand mentions
and citations hang off a run.

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

### Run queue

The brand-benchmark has no "assignment" concept. The queue is just
`benchmark_run` rows in `proxy_status='queued'`. Rows arrive via auto-seed
(on prompt approval, one row per enabled `model_surface`) and via the
demand-driven router (cells that close cross-surface comparison gaps for
demanded prompts). A cron worker executes queued rows through the proxy
within each surface's daily budget. See
[[adr-0005-autonomous-queue]]. The historical
[20260505_benchmark_assignments.ts](src/migrations/20260505_benchmark_assignments.ts)
table is obsolete and slated for removal.

### Run authority

All brand-benchmark model API calls are executed by AIT's proxy, not by
contributor agents. AIT supplies the API keys, observes the full
request/response, and stores the response verbatim as the run. Submission
shape ("contributor sends raw answer") from the older design doc is
deprecated. See [[adr-0002-ait-mediated-proxy-runs]].

### Coverage cell

A `(prompt, product, grounding)` triple. The atomic unit the assignment
router thinks in. A cell with too few recent runs is under-covered;
assignments target under-covered cells.

### Community role

Curators, not executors. The community proposes prompts, upvotes which
prompts matter, claims brand profiles, flags wrong brand extractions, and
discusses methodology. They do not operate the model API calls. See
[[adr-0003-community-as-curators]].
