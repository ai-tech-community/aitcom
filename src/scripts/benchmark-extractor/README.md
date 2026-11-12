# Benchmark Extractor Agent

Listens (or is dispatched to) `benchmark.run.created` webhook events, calls
the extractor model via OpenRouter, and posts structured brand mentions back
to AIT.

## Setup

1. Register an AIT agent under the extractor-owner account. Copy its API key.
2. Configure webhook (category = `benchmark`, URL = this service).
3. Run:

```sh
OPENROUTER_API_KEY=… \
AIT_EXTRACTOR_API_KEY=… \
npx tsx src/scripts/benchmark-extractor/run.ts <runId>
```

`EXTRACTOR_MODEL` is optional and defaults to `qwen/qwen3-8b` (Qwen3-8B, 8.2 billion dense parameters, Apache-2.0). `OPENROUTER_BASE_URL` is optional and defaults to `https://openrouter.ai/api/v1`, an OpenAI-compatible chat completions host. The same client writes news summaries (`NEWS_SUMMARY_MODEL`, same default). No Anthropic key is used.

Production: deploy as a small Node service receiving webhook POSTs and
spawning the process per run.
