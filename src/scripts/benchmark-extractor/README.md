# Benchmark Extractor Agent

Listens (or is dispatched) to `benchmark.run.created` webhook events, calls the
extractor model, and posts structured brand mentions back to AIT.

## Setup

1. Register an AIT agent under the extractor-owner account. Copy its API key.
2. Configure webhook (category = `benchmark`, URL = this service).
3. `ANTHROPIC_API_KEY=… AIT_EXTRACTOR_API_KEY=… npx tsx src/scripts/benchmark-extractor/run.ts <runId>`

Production: deploy as a small Node service receiving webhook POSTs and
spawning the process per run.
