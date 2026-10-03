---
status: proposed
---

# Data collectors are reviewed built-in strategies, run from a queued command on our own functions

Members want to collect structured web data for their own research. We could
build that three ways: ship collectors we write and review, run code members
write in a sandbox, or have members' own agents execute collectors while we
store the results. We also had to decide whether execution needs its own
machine. Design: `docs/superpowers/specs/2026-10-03-data-collectors-design.md`.

## Decision

1. **Collectors are reviewed code in this repository**, a typed catalog of
   Strategy implementations behind one `Collector` interface. No member-supplied
   code runs on our infrastructure.
2. **A run is a stored Command** (`app.collector_run`), claimed by a worker with
   a lease, so execution is decoupled from the request that asked for it.
3. **The worker runs on our existing Vercel functions** (its own route and
   cron), not on a separate machine.
4. **Collectors reach the network only through a protection Proxy**
   (`CollectorContext`) that owns every safety rule: SSRF guard, robots.txt,
   a shared per-site rate limit, budgets, blocklist and metering.

## Why built-in first

- **Safety without a sandbox.** Reviewed code that only fetches pages needs no
  isolation from our secrets. Member-written code would, from day one.
- **Members get value at once.** A researcher picks a collector and fills a
  form; agent-executed collection (the ADR-0006 model) asks them to run
  infrastructure first. Their agent still takes part, through MCP, and does the
  analysis — we only fetch and structure.
- **The paid-usage path needs no outside code.** Charging for usage of reviewed
  collectors, then commissioning new ones from community builders, keeps every
  collector inside review.

## Why not a separate machine yet

Execution is light, network-bound work by code we reviewed, bounded to about
four minutes per run. A separate machine would add deploys, monitoring,
secrets and a monthly cost with no safety gain. Two properties keep a later
move cheap: a run is a stored Command any runner can claim, and a collector
receives only its input and the Proxy — no database handle or environment.

**Move execution out when any one of these becomes true:**

1. Code not written and reviewed by us runs (member-authored collectors). This
   one is mandatory: an isolated runner with no secrets, such as Vercel Sandbox.
2. A headless browser is needed for JavaScript-rendered sites.
3. Runs need longer than one function invocation (~4 minutes).
4. Collector load measurably slows the website's response times.

## Considered options

- **Member-written scripts in a sandbox:** rejected for v1 — security, cost and
  abuse surface before the core value is proven. Kept reachable through the
  Command seam.
- **Member agents execute, platform stores (ADR-0006 model):** rejected for v1
  — high setup cost for researchers; partially kept through MCP tools.
- **Run inside the request:** rejected — breaks on slow sites at the
  5-minute function limit, no progress, lost on a closed tab.
- **Durable workflow per run:** deferred — strongest for long runs, but a new
  dependency we do not need while runs fit one invocation.

## Consequences

- We own politeness: robots.txt, a 1 request/second per-site limit shared
  across all runs, an honest user agent, a public about page and an opt-out
  blocklist.
- Usage is metered from day one (pages, bytes, rows, duration), so paid usage
  is a policy change in `canStartRun`, not a data migration.
- Coverage is limited to static HTML, feeds and public APIs until a headless
  runner exists.
