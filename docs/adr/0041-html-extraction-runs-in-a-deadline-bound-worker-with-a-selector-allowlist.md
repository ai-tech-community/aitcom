---
status: accepted
---

# HTML extraction runs in a deadline-bound worker with a selector allowlist

The `page-list` collector ("List on a web page") turns a list on a public web
page into rows: the member gives a page address, a CSS selector for one item,
a selector (and optional attribute) per column, and optionally a selector for
the next-page link. This is the first collector where **both the input and the
selectors come from the member and the page comes from an arbitrary site**.
ADR-0040 keeps collectors as reviewed code on our own functions; this ADR
decides how that reviewed code parses hostile HTML without letting one page
freeze or crash the worker function. Design:
`docs/superpowers/specs/2026-10-03-data-collectors-design.md` (`page-list`
under "Collectors in v1"; "Extraction sandbox" under "CollectorContext").

## Context

HTML parsing and selector matching are synchronous. A page or selector that
makes them slow blocks the whole function, and no timer on the same thread can
interrupt it. We measured this before and during the build (cheerio 1.2.0,
parse5, css-select):

- **Hostile markup alone is enough.** A page of misnested formatting tags
  (`"<b><i><u><s><em><strong><font><nobr>x</p>".repeat(10_000)`) takes about
  4.4 s to parse; a hostile input in the spike ran 49 s. Nothing in our own code
  runs while that happens.
- **Some selector features are super-linear or recursive in css-select.**
  `:nth-*` is quadratic in sibling count; `:has()` and `:contains()` recurse
  and overflow the stack on deep pages. Narrowing the rest of the selector
  language took five review rounds, each finding a new slow shape (numbers
  under "Selector allowlist").
- **Even plain selectors on adversarial pages exceed any sensible budget.**
  A descendant chain that matches nothing (`.nope div div div div div div div`)
  on 200 siblings each holding a 500-deep chain (100 000 elements, 1.1 MB)
  took about 5.0 s, and 23 s near the 5 MB body cap. An item with tens of
  thousands of direct children makes a field lookup quadratic (css-select's
  `removeSubsets`): 1.85 s at 40 000 children, 46 s at 200 000.
- **Deep or wide trees break recursive code.** cheerio's `.text()` recurses
  over the tree, so a page nested thousands of levels deep can exhaust the
  stack; even `stack.push(...children)` on a node with 200 000 children throws
  "Maximum call stack size exceeded".

So limits on the input (selector rules, body size, depth) narrow the problem,
but **no limit we can check up front bounds the parse and match time itself**.
Only something outside the thread doing the work can.

## Decision

1. **Collectors never parse HTML.** `page-list` calls a new context
   capability, `ctx.extractList(page, spec)`. An ESLint rule forbids
   `cheerio`, `parse5`, `htmlparser2`, `css-select`, `css-what`, `domutils`
   and `domhandler` imports in `src/server/collectors/collectors/**` and
   `helpers/**`.
2. **One extraction worker per run, started lazily.** The live context owns an
   extraction sandbox (`src/server/collectors/extract/sandbox.ts`): a Node
   `worker_threads` Worker with `resourceLimits.maxOldGenerationSizeMb: 256`,
   started on the run's first `extractList` call and reused for its later
   pages, one page at a time. The executor disposes it after the run, in a
   `finally`.
3. **A 5 000 ms per-page deadline, enforced from outside.** The main thread
   races each request against a timer (worker start-up included). When the
   timer wins, it **terminates the worker** (a busy parser cannot be asked to
   stop) and the call fails with `page_too_slow`; the next call starts a fresh
   worker. A crash, an out-of-memory exit or a closed sandbox fails the call
   with `extract_failed`. **This deadline is the real bound** on extraction
   time; every other limit below exists to make ordinary pages fast and to
   refuse what we can refuse early with a clearer message, not to replace it.
   The spike measured the mechanism: a 49 s hostile parse was stopped at
   2.06 s with a 2 s deadline, and the main thread answered a ping in 1–7 ms
   throughout. In the shipped tests a hostile page with a 400 ms deadline
   fails in under 1 500 ms, and a 10 ms timer on the main thread fires in
   under 200 ms while the worker is busy.
4. **The worker runs a pure function.** `extractList(html, spec)`
   (`src/server/collectors/extract/extract-list.ts`) takes HTML and a spec and
   returns `{ rows, nextUrl, truncated }`. It imports nothing Node-only or
   Next-only, so it is tested directly and bundled unchanged. The worker
   answers with codes only, never error messages.
5. **A selector allowlist, checked twice.** `checkSelector`
   (`src/lib/collectors/selector-policy.ts`, built on `css-what`) runs in the
   input schema (the form refuses the selector) and again inside the worker
   before any parsing (`selector_not_allowed`). See "Selector allowlist".
6. **Page-shape limits inside the worker.**
   - **Depth cap 512.** The element depth is measured iteratively (an
     explicit stack, `<template>` content included) right after parsing;
     a deeper page is refused with `page_too_deep`. Every tree walk in the
     extractor is iterative, so nothing recurses over the tree. A very deep
     page may still end as `page_too_slow` instead: the parse runs before the
     depth can be measured, and on an adversarial page the parse alone can
     pass the deadline. We accept the less precise message.
   - **At most 5 000 rows per page**, and **a per-page output budget of
     2 000 000 characters** summed over all cells. Rows past either limit are
     dropped and the result carries `truncated: true`; the collector writes a
     line in the run log. This closes the rows × columns × cell-size memory
     gap: the answer posted back to the main thread is bounded.
   - **Cells:** text trimmed, whitespace runs collapsed to one space, at most
     2 000 characters. Text is read in bounded chunks and never copied whole,
     so a single 4 MB text node costs about 340 ms. Link attributes (`href`,
     `src`, `action`) are resolved against the page URL and kept only when
     http(s) and short enough to stay whole.
   - **Text inside `script`, `style`, `noscript` and `template` is skipped.**
     A field that matches one of those elements itself yields `""`, so
     member-facing data never contains code (a consequence: JSON-LD cannot be
     collected).
7. **The worker ships as one pre-bundled file.** `scripts/build-workers.mjs`
   bundles `workers/html-extract.worker.ts` with esbuild (cjs, node20,
   minified) into `workers/dist/html-extract.bundle.cjs` (git-ignored).
   `pnpm build` and `pnpm dev` run `pnpm build:workers` first. `next.config.js`
   lists the file under `outputFileTracingIncludes` for
   `/api/cron/collector-worker`, because file tracing does not follow a
   worker's own requires. The runtime path (`HTML_EXTRACT_BUNDLE` in
   `sandbox-paths.ts`) and the config literal are kept equal by a test, and the
   worker test runs the bundle from a temporary directory with no
   `node_modules` reachable, so a bundle that is not self-contained fails.
8. **cheerio's main entry, with parse5.** We import `load` from `cheerio`, which
   parses with parse5 and builds the same tree a browser does, so selectors
   members test in their browser match the same elements here. The bundle is
   about 1.36 MB, of which about 1 MB is undici and iconv-lite pulled in by
   the main entry and never used by the worker.

### Selector allowlist

Allowed: tag, `*`, class, id and attribute selectors (all operators, no
namespaces); the combinators descendant (space), `>` and `+`; the
pseudo-classes `:not()`, `:is()` and `:where()` with **compound arguments
only** (such as `.ad`, `[hidden]`, `a.ad:first-child`), `:first-child` and
`:empty`. One selector per field (no comma lists), at most 200 characters and
at most 8 compound parts. Everything else is refused, including features a
newer `css-what` may learn later.

Removed features and the measured reason for each:

| Refused | Reason (measured in css-select, cheerio 1.2.0) |
|---|---|
| `:nth-child`, `:nth-of-type`, `:nth-last-*` | quadratic in sibling count |
| `:has()`, `:contains()`, `:icontains()` | recurse over the subtree and overflow the stack on deep pages |
| `~` (general sibling) | uncached sibling scan: `x ~ * ~ * ~ *` 1.2 s at 200 siblings, 19.8 s at 400; a descendant chain before `~` costs siblings² × depth (`p * * * * * * ~ *`: 4.3 s at 5 000 siblings and depth 15, 135 s at depth 512). Capping the count of `~`, then forbidding it next to sibling-scanning pseudos, each left a new slow shape, so it was dropped |
| `:first-of-type`, `:last-of-type`, `:only-of-type`, `:only-child`, `:last-child` | scan the sibling list; next to `+` with a descendant part they cost siblings² × depth (`:only-of-type + :only-of-type *` 11.1 s, `* + :only-of-type *` 5.6 s, at 5 000 siblings each holding a 15-deep chain). A cap of two per selector still left such shapes, so they were dropped |
| a combinator inside `:not()` / `:is()` / `:where()` | css-select has no descendant cache there: `:not(a div div div div div div div)` 4.2 s at depth 40, 25 s at depth 50, over 60 s at depth 100 |
| namespaces (`svg\|rect`, `*\|a`, `[xlink\|href]`) | css-select throws on them; members never need them |
| `:eq`/`:gt`/`:lt` and other positionals, pseudo-elements, the `<` parent combinator, comma lists | not needed for list pages; refused by the allowlist's default |

After these removals every remaining feature costs O(1) per element per
compound part. On the probe pages (5 000 distinct-tag siblings each holding a
15-deep chain, 80 000 elements) the worst allowed selector took about 150 ms.

## Considered options

- **node-html-parser** instead of cheerio: rejected. Its parse time grows
  cubically on some malformed input, and it builds trees that differ from a
  browser's on misnested markup, so a selector that works in the member's
  browser can miss here.
- **`cheerio/slim`** (htmlparser2, no undici/iconv-lite, about 1 MB smaller):
  rejected. htmlparser2 does not build the browser's tree, which brings back
  the mismatch above. 1 MB in a function bundle limited to 250 MB is cheap.
- **Parse on the main thread with input limits only** (body size, depth,
  selector rules): rejected. No limit we can check before parsing bounds the
  parse itself; a page of misnested tags (49 s in the spike) or a
  deep-and-wide page still blocks the function for seconds to minutes.
- **Worker packaging:** `new Worker(new URL("./worker", import.meta.url))`,
  an `eval` worker built from a string, and a plain unbundled worker file next
  to the route all failed in an isolated, Vercel-like build (a standalone copy
  of the output without the source tree). A single pre-bundled file listed in
  `outputFileTracingIncludes` was the only packaging that worked in dev, in
  `next build` + `next start`, and in the isolated copy.

## Consequences

- **A build step.** `pnpm build` and `pnpm dev` run esbuild first; esbuild is a
  devDependency (Vercel installs devDependencies). A missing bundle breaks the
  worker route, so the local build check confirms the route's trace file
  (`route.js.nft.json`) lists `workers/dist/html-extract.bundle.cjs`.
- **One worker per run, started lazily**, about 35–55 ms once per run that
  reads a page, plus one more after each `page_too_slow`. 5 000 rows post back
  to the main thread in 3–6 ms.
- **The worker shares the function's CPU and memory.** It is isolated from a
  stalled event loop and from a crash, not from resource use: its heap is
  capped at 256 MB and its time per page at 5 s, inside the same function.
- **Re-verify packaging on a Next major upgrade.** The packaging was proven on
  Next 15.4 with webpack. A new major (or a switch to Turbopack builds) can
  change file tracing; repeat the isolated-build check then.
- **Accepted adversarial cases.** Plain descendant chains on deep, wide pages
  and items with tens of thousands of direct children stay slow by design.
  The run ends `failed` with `page_too_slow` within about the deadline, and
  the rows already collected from earlier pages stay in its table. Tightening further would mean a different
  matching engine or new caps that ordinary pages would hit.
- **The selector language is smaller than CSS.** Members cannot use `~`,
  `:nth-*`, `:has()`, `:last-child` or `*-of-type`. Ordinary list pages do not
  need them; the form names the problem in plain words.
- **New failure codes** the screens translate: `page_too_slow`,
  `page_too_deep`, `selector_not_allowed` (from the sandbox) and
  `page_status`, `not_a_page` (from the collector). A worker crash maps to
  `generic`.
