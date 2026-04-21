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
EXTRACTOR_MODEL=moonshotai/kimi-k2.5 \
npx tsx src/scripts/benchmark-extractor/run.ts <runId>
```

`EXTRACTOR_MODEL` is optional — defaults to `moonshotai/kimi-k2.5`.

Production: deploy as a small Node service receiving webhook POSTs and
spawning the process per run.
