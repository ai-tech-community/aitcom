# "List on a Web Page" Collector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Members turn a list on a public web page into a table: they give a page address, a CSS selector for each item, a selector (and optional attribute) per column, and optionally a "next page" selector. HTML parsing runs in a deadline-bound worker thread so a hostile page can never freeze the server.

**Architecture:** The `page-list` collector (Strategy, like `feed-items`) never parses HTML itself: it calls a new context capability, `ctx.extractList(page, spec)`. The host serves that capability from an **extraction sandbox** — one `worker_threads` Worker per run, reused across the run's pages, killed and replaced when a page exceeds its deadline. The worker runs a pure function (`extractList`, cheerio with parse5) that checks every selector against an allowlist and refuses pages nested too deeply. The worker is pre-bundled into one file with esbuild and shipped with the worker route through `outputFileTracingIncludes` (the only packaging that survived an isolated, Vercel-like build in the spike). The start form gains one field kind, "rows", for the column list.

**Tech Stack:** cheerio ^1.2 (parse5), css-what (selector parsing for the allowlist), esbuild (worker bundle), Node `worker_threads`, Next 15.4 webpack build, Zod 4, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-03-data-collectors-design.md` (collector `page-list`), ADR-0040, and the new ADR-0041 written in Task 9. Evidence: spike report (worker in Next 15: dev, `next build` + `next start`, isolated standalone copy; hostile input 49 s → stopped at 2.06 s; ping 1–7 ms during a runaway parse; 5 000 rows posted back in 3–6 ms; worker start 35–55 ms), and research (cheerio vs node-html-parser timings; css-select's quadratic `:nth-*` and stack overflow in `:has()`/`:contains()`).

## Global Constraints

- Branch: `feat/collector-page-list` from `origin/main`. Commit steps start with `git branch --show-current`. Never `git checkout`/`switch`/`stash`/`add -A`/`add .`. No AI-credit lines.
- Dependencies: `cheerio@^1.2.0` and `css-what` (the version cheerio's tree already uses, as a direct dependency); `esbuild` as a direct devDependency. Keep `undici@^7` (cheerio needs ^7.19, already satisfied).
- Collectors never parse HTML or start workers themselves: extend the collector ESLint boundary to forbid `cheerio`, `parse5`, `htmlparser2`, `css-select`, `css-what`, `domutils`, `domhandler` imports in `src/server/collectors/collectors/**` and `helpers/**`.
- Selector allowlist (exact): tag, `*`, class, id, attribute selectors (all operators), combinators descendant / `>` / `+` / `~`, pseudo-classes `not`, `is`, `where`, `first-child`, `last-child`, `only-child`, `first-of-type`, `last-of-type`, `only-of-type`, `empty`. Everything else refused (all `:nth-*`, `:has`, `:contains`, `:icontains`, `:eq`/`:gt`/`:lt` and other positionals, pseudo-elements, the `<` parent combinator). One selector per field (no comma lists), length ≤ 200, at most 8 compound parts.
- Extraction limits (exact): page depth ≤ 512 (iterative measure; deeper pages refused); ≤ 5 000 rows per page; cell text trimmed, whitespace collapsed, ≤ 2 000 characters; per-page deadline 5 000 ms; worker heap `maxOldGenerationSizeMb: 256`.
- `page-list` input limits: `maxPages` 1–20 (default 5); 1–20 columns; column names `^[a-zA-Z][a-zA-Z0-9_]{0,39}$`, unique; attribute names `^[a-zA-Z_:][-a-zA-Z0-9_:.]{0,39}$`; page URL https only (the platform-wide rule).
- Worker bundle: `workers/dist/html-extract.bundle.cjs`, git-ignored, built by `pnpm build:workers`; `build` and `dev` run it first; `next.config` ships it with `/api/cron/collector-worker` via `outputFileTracingIncludes`.
- All member copy in `messages/en.json` and `messages/nl.json` (natural Dutch, everyday words — say "items", "columns", "next-page link", never "DOM"/"parse5").
- Never run `pnpm build` locally (it applies migrations against `.env` = production). For the local build check use exactly: `NODE_ENV=production PAYLOAD_PUSH=false SKIP_ENV_VALIDATION=1 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm exec next build` (after `pnpm build:workers`).
- DB tests only with: `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test`. Unit prefix: `SKIP_ENV_VALIDATION=1 pnpm vitest run`.

## Review Focus

1. **A hostile page (parse would take tens of seconds)** → that page fails with "page_too_slow" within ~deadline + 1 s, the worker is replaced, rows from earlier pages are kept, and the server keeps answering. Tasks 4 and 6.
2. **A selector that would be slow or crash css-select** (`li:nth-child(2n)`, `div:has(div)`, `a:contains(x)`) → refused at the form and again inside the worker. Tasks 1, 2, 6.
3. **A deeply nested page (> 512 levels)** → refused with "page_too_deep", never a stack overflow. Task 2.
4. **A "next page" link that loops or leaves the web** (`javascript:`, `mailto:`, or back to a visited page) → paging stops cleanly. Task 6.
5. **The worker bundle is missing from the deployed function** → caught before deploy: the build check asserts the route's trace file lists the bundle. Task 3 and Task 10.

---

## File map

| File | Responsibility |
|---|---|
| `src/lib/collectors/selector-policy.ts` | allowlist check for one CSS selector (shared by the form schema and the worker) |
| `src/server/collectors/extract/extract-list.ts` | pure extraction: HTML + spec → rows + next URL (cheerio, depth cap) |
| `src/server/collectors/extract/protocol.ts` | worker message types and `ExtractError` codes |
| `workers/html-extract.worker.ts` | worker entry: wraps `extractList` behind the message protocol |
| `scripts/build-workers.mjs` | esbuild bundle of the worker |
| `src/server/collectors/extract/sandbox.ts` | one worker per run, deadline, replace on timeout, close |
| `src/server/collectors/collector.ts`, `context/collector-context.ts`, `context/live.ts`, `executor.ts` (modify) | the `extractList` capability, its live wiring, and context disposal |
| `src/server/collectors/collectors/page-list.ts` + `catalog.ts` (modify) | the collector |
| `src/lib/collectors/form-fields.ts`, `src/components/collectors/field-renderers.tsx`, `start-run-form.tsx`, `src/server/collectors/runs.ts` (modify) | the "rows" field kind |
| `src/server/collectors/errors.ts`, `messages/*.json` (modify) | failure codes and copy |
| `eslint.config.js`, `next.config.js`, `package.json`, `.gitignore` (modify) | boundary, tracing, scripts |
| `docs/adr/0041-…md`, spec (modify) | decision record and spec |

---

### Task 1: Selector policy

**Files:** Create `src/lib/collectors/selector-policy.ts`, `src/lib/collectors/selector-policy.test.ts`; modify `package.json`/`pnpm-lock.yaml`.

**Interfaces:** Produces `checkSelector(selector: string): { ok: true } | { ok: false; reason: SelectorProblem }` where `type SelectorProblem = "empty" | "too_long" | "invalid" | "list" | "too_complex" | "not_allowed"`; `MAX_SELECTOR_LENGTH = 200`; `MAX_COMPOUNDS = 8`.

- [ ] **Step 1: Add dependencies.** `pnpm add cheerio@^1.2.0 css-what@<version cheerio already resolves, check node_modules/.pnpm>` and `pnpm add -D esbuild@<a current 0.2x already in the store, e.g. 0.25.x>`.

- [ ] **Step 2: Write the failing tests**

```ts
// src/lib/collectors/selector-policy.test.ts
import { describe, expect, it } from "vitest";
import { checkSelector } from "./selector-policy";

describe("checkSelector", () => {
  it.each([
    "li",
    "*",
    ".talk",
    "#speakers",
    "ul.list > li.item",
    "h2 + p",
    "h2 ~ p",
    "a[href]",
    'a[href^="https://"]',
    "[data-id='3']",
    "li:not(.ad)",
    "li:is(.a, .b)",
    ":where(article) h2",
    "tr:first-child",
    "tr:last-child td:only-child",
    "td:first-of-type",
    "td:last-of-type",
    "p:only-of-type",
    "div:empty",
    "div p span a b i em strong",
  ])("allows %s", (selector) => {
    expect(checkSelector(selector)).toEqual({ ok: true });
  });

  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["a".repeat(201), "too_long"],
    ["li,", "invalid"],
    ["li[", "invalid"],
    ["a, b", "list"],
    ["li:nth-child(2n)", "not_allowed"],
    ["li:nth-of-type(2)", "not_allowed"],
    ["li:nth-last-child(1)", "not_allowed"],
    ["li:nth-last-of-type(1)", "not_allowed"],
    ["div:has(p)", "not_allowed"],
    ["a:contains(x)", "not_allowed"],
    ["a:icontains(x)", "not_allowed"],
    ["li:eq(2)", "not_allowed"],
    ["li:gt(1)", "not_allowed"],
    ["p::before", "not_allowed"],
    ["li:not(:nth-child(2))", "not_allowed"],
    ["a b c d e f g h i", "too_complex"],
  ] as const)("refuses %j (%s)", (selector, reason) => {
    expect(checkSelector(selector)).toEqual({ ok: false, reason });
  });
});
```

(If css-what parses `"li,"` as a valid list with an empty selector, the expected reason is `"list"`; assert what css-what actually does for the two malformed inputs and keep both refused — never allow them.)

- [ ] **Step 3: Run to verify failure** — `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/collectors/selector-policy.test.ts` → FAIL (module missing).

- [ ] **Step 4: Implement**

```ts
// src/lib/collectors/selector-policy.ts
import { parse, type Selector } from "css-what";

/**
 * Which CSS selectors a member may give the "list on a web page" collector.
 * Only features that css-select evaluates in linear time and without deep
 * recursion: the `:nth-*` family is quadratic in sibling count, `:has()` and
 * `:contains()` recurse and overflow the stack on deep pages (measured).
 * Used by the form schema and again inside the extraction worker.
 */
export const MAX_SELECTOR_LENGTH = 200;
export const MAX_COMPOUNDS = 8;

export type SelectorProblem = "empty" | "too_long" | "invalid" | "list" | "too_complex" | "not_allowed";

const ALLOWED_PSEUDOS = new Set([
  "not", "is", "where", "first-child", "last-child", "only-child",
  "first-of-type", "last-of-type", "only-of-type", "empty",
]);
const ALLOWED_COMBINATORS = new Set(["descendant", "child", "adjacent", "sibling"]);

function walk(tokens: Selector[]): "not_allowed" | null {
  for (const token of tokens) {
    if (token.type === "pseudo-element") return "not_allowed";
    if (token.type === "parent" || token.type === "column-combinator") return "not_allowed";
    if (["descendant", "child", "adjacent", "sibling"].includes(token.type)) {
      if (!ALLOWED_COMBINATORS.has(token.type)) return "not_allowed";
      continue;
    }
    if (token.type === "pseudo") {
      if (!ALLOWED_PSEUDOS.has(token.name)) return "not_allowed";
      if (Array.isArray(token.data)) {
        for (const inner of token.data) if (walk(inner)) return "not_allowed";
      } else if (token.data !== null) {
        return "not_allowed";
      }
    }
  }
  return null;
}

function compoundCount(tokens: Selector[]): number {
  let count = 1;
  for (const token of tokens) {
    if (["descendant", "child", "adjacent", "sibling"].includes(token.type)) count += 1;
  }
  return count;
}

export function checkSelector(selector: string): { ok: true } | { ok: false; reason: SelectorProblem } {
  const trimmed = selector.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };
  if (selector.length > MAX_SELECTOR_LENGTH) return { ok: false, reason: "too_long" };
  let parsed: Selector[][];
  try {
    parsed = parse(trimmed);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (parsed.length !== 1 || parsed[0]!.length === 0) return { ok: false, reason: "list" };
  const tokens = parsed[0]!;
  if (walk(tokens)) return { ok: false, reason: "not_allowed" };
  if (compoundCount(tokens) > MAX_COMPOUNDS) return { ok: false, reason: "too_complex" };
  return { ok: true };
}
```

Adapt token type names to the installed css-what's `Selector` union (`descendant`, `child`, `adjacent`, `sibling`, `parent`, `column-combinator`, `pseudo`, `pseudo-element`, `attribute`, `tag`, `universal`); the test table is the contract.

- [ ] **Step 5: Run tests, lint, typecheck → PASS. Commit**

```bash
git branch --show-current   # must print feat/collector-page-list
git add package.json pnpm-lock.yaml src/lib/collectors/selector-policy.ts src/lib/collectors/selector-policy.test.ts
git commit -m "Collectors: CSS selector allowlist for the page-list collector"
```

---

### Task 2: Pure list extraction

**Files:** Create `src/server/collectors/extract/protocol.ts`, `src/server/collectors/extract/extract-list.ts`, `src/server/collectors/extract/extract-list.test.ts`.

**Interfaces:**
- Produces (protocol.ts):
  - `type ExtractSpec = { baseUrl: string; itemSelector: string; fields: { name: string; selector: string; attribute?: string }[]; nextPageSelector?: string }`
  - `type ExtractResult = { rows: Record<string, string | null>[]; nextUrl: string | null }`
  - `type ExtractErrorCode = "page_too_deep" | "page_too_slow" | "selector_not_allowed" | "extract_failed"`
  - `class ExtractError extends Error { code: ExtractErrorCode }`
  - `MAX_DEPTH = 512`, `MAX_ROWS_PER_PAGE = 5_000`, `MAX_CELL_CHARS = 2_000`
- Produces (extract-list.ts): `extractList(html: string, spec: ExtractSpec): ExtractResult`

Rules: every selector passes `checkSelector` (else `ExtractError("selector_not_allowed")`); depth measured iteratively over the parsed tree (no recursion) and > 512 → `ExtractError("page_too_deep")`; for each item (≤ 5 000): each field = the first match of its selector inside the item; value = attribute when given, else text; `href`/`src`/`action` attribute values resolved against `baseUrl` and kept only when http(s) (else null); text trimmed, whitespace collapsed, capped at 2 000 chars; missing match → null. `nextUrl` = first match of `nextPageSelector` with an `href`, resolved, http(s) only, else null. Text extraction must be iterative (collect text nodes with a stack), not cheerio's recursive `.text()`, because the depth cap is the only bound and recursion would still be the riskiest path.

- [ ] **Step 1: Write the failing tests** — fixtures inline: a speaker list (`<ul class="speakers"><li class="speaker"><a href="/s/ada">Ada</a><span class="role">CTO</span></li>…</ul><a class="next" href="?page=2">Next</a>`) asserting rows `[{ name: "Ada", link: "https://conf.example/s/ada", role: "CTO" }, …]` and `nextUrl: "https://conf.example/talks?page=2"` for `baseUrl: "https://conf.example/talks"`; missing column → null; whitespace collapsed; cell capped at 2 000 chars; `javascript:` / `mailto:` link → null; next link absent → null; `div:has(p)` field → `ExtractError` code `selector_not_allowed`; a page of 600 nested `<div>` → `page_too_deep`; a page of 300 nested divs → fine; 6 000 items → 5 000 rows.

- [ ] **Step 2: Run to verify failure.**

- [ ] **Step 3: Implement** with `import { load } from "cheerio"` (default parse5), the protocol module, and `checkSelector` from `@/lib/collectors/selector-policy`. Use relative or `@/` imports that esbuild resolves through `tsconfig` paths (esbuild reads `tsconfig.json` `paths` by default; verify in Task 3).

- [ ] **Step 4: Tests, lint, typecheck → PASS. Commit** `"Collectors: pure list extraction with selector and depth limits"` (stage the three files by name).

---

### Task 3: Worker entry, bundle, and tracing

**Files:** Create `workers/html-extract.worker.ts`, `scripts/build-workers.mjs`, `scripts/build-workers.test.ts` (or `workers/html-extract.worker.test.ts`); modify `package.json` (scripts), `.gitignore`, `next.config.js`.

**Interfaces:**
- Worker protocol (in `protocol.ts`, extend): main → worker `{ id: number; html: string; spec: ExtractSpec }`; worker → main `{ type: "ready" }` once, then `{ id; ok: true; result: ExtractResult } | { id; ok: false; code: ExtractErrorCode }`.
- `pnpm build:workers` writes `workers/dist/html-extract.bundle.cjs`.
- `HTML_EXTRACT_BUNDLE = "workers/dist/html-extract.bundle.cjs"` exported from `src/server/collectors/extract/sandbox-paths.ts` (one constant shared by `next.config.js` reading it as a string literal — keep both in sync with a test).

- [ ] **Step 1: Write the failing test** — runs `node scripts/build-workers.mjs` into a temp out dir (the script accepts `--outfile`), spawns the bundle with `new Worker(outfile)`, waits for `ready`, posts a small page + spec, and asserts the rows; posts a `div:has(p)` spec and asserts `{ ok: false, code: "selector_not_allowed" }`. Also asserts `next.config.js` contains `outputFileTracingIncludes` with key `/api/cron/collector-worker` listing `./workers/dist/html-extract.bundle.cjs`, and that the string equals `./${HTML_EXTRACT_BUNDLE}`.

- [ ] **Step 2: Implement**
  - `workers/html-extract.worker.ts`: `parentPort.postMessage({ type: "ready" })`; on message run `extractList` in try/catch; `ExtractError` → `{ ok: false, code }`; anything else → `{ ok: false, code: "extract_failed" }`.
  - `scripts/build-workers.mjs`: esbuild `bundle: true, platform: "node", target: "node20", format: "cjs", minify: true, outfile` (default `workers/dist/html-extract.bundle.cjs`, overridable by `--outfile`), `tsconfig: "tsconfig.json"`; exit non-zero on error.
  - `package.json`: `"build:workers": "node scripts/build-workers.mjs"`, `"build": "pnpm build:workers && tsx scripts/db-apply-on-deploy.ts && next build"`, `"dev": "pnpm build:workers && next dev --turbo"`.
  - `.gitignore`: `/workers/dist/`.
  - `next.config.js`: `outputFileTracingIncludes: { "/api/cron/collector-worker": ["./workers/dist/html-extract.bundle.cjs"] }` with a comment: the worker's own requires are not traced, so it ships as one pre-bundled file (spike result).

- [ ] **Step 3: Run tests (local Node and Node 20) → PASS. Commit** `"Collectors: HTML extraction worker, its bundle, and tracing for the worker route"`.

---

### Task 4: Extraction sandbox

**Files:** Create `src/server/collectors/extract/sandbox.ts`, `src/server/collectors/extract/sandbox.test.ts`.

**Interfaces:** Produces `createExtractSandbox(options: { workerPath: string; execArgv?: string[]; deadlineMs?: number; maxOldGenerationSizeMb?: number }): ExtractSandbox` where `interface ExtractSandbox { extract(html: string, spec: ExtractSpec): Promise<ExtractResult>; close(): Promise<void> }`. Defaults: `deadlineMs` 5 000, heap 256 MB. Rejects with `ExtractError` (`page_too_slow` on deadline, worker's own codes, `extract_failed` on worker crash/exit).

Behaviour: lazily spawn one Worker on first `extract`, wait for `ready` (the ready wait counts toward the first call's deadline); one call at a time (queue); on deadline: `await worker.terminate()`, drop it, reject with `page_too_slow`, next call spawns a fresh worker; on `error`/`exit` of the worker: reject the pending call with `extract_failed`, drop the worker; `close()` terminates and makes later calls reject with `extract_failed`.

- [ ] **Step 1: Write the failing tests** (`// @vitest-environment node`) running the TS worker source directly: `workerPath: path.resolve("workers/html-extract.worker.ts")`, `execArgv: ["--import", "tsx"]`:
  - extracts a small page;
  - a hostile page (`"<b><i><u><s><em><strong><font><nobr>x</p>".repeat(N)`, N chosen so parsing takes > 3 s locally) with `deadlineMs: 400` rejects with `page_too_slow` in < 1 500 ms, and the next call on the same sandbox succeeds (fresh worker);
  - while a hostile parse runs, a `setTimeout(…, 10)` on the main thread fires on time (event loop not blocked);
  - two concurrent calls resolve in order (queue);
  - after `close()`, `extract` rejects with `extract_failed`.

- [ ] **Step 2: Implement; run on local Node and Node 20 → PASS. Commit** `"Collectors: per-run extraction sandbox with a hard deadline"`.

---

### Task 5: The `extractList` context capability

**Files:** Modify `src/server/collectors/collector.ts`, `context/collector-context.ts`, `context/collector-context.test.ts`, `context/live.ts`, `executor.ts`, `collectors.integration.test.ts`, `errors.ts`, `testing/fake-context.ts`, `messages/en.json`, `messages/nl.json`, `src/lib/collectors/collectors-messages.test.ts`.

**Interfaces:**
- `CollectorContext.extractList(page: { html: string; url: string }, spec: Omit<ExtractSpec, "baseUrl">): Promise<ExtractResult>` (baseUrl = `page.url`).
- `ContextDeps.extractor: { extract(html: string, spec: ExtractSpec): Promise<ExtractResult> }`.
- `ExecutorDeps.buildContext` may return `dispose?: () => Promise<void>`; the executor awaits it in `finally` (errors logged, never thrown).
- New `FailureCode`s: `page_too_slow`, `page_too_deep`, `selector_not_allowed`, `not_a_page` (+ `FAILURE_CODES`), with EN/NL `collectors.failure.*` copy (everyday words, e.g. EN "This page took too long to read, so we stopped.", "This page is nested too deeply to read safely.", "One of the selectors uses a feature we don't allow.", "This address is not a web page.").

Mapping in the context: `ExtractError` → `CollectorStop("error", "failed", <English text>, { code })` with the matching failure code; `extract_failed` → `generic`.

- [ ] **Step 1: Write failing tests** — context: `extractList` passes `baseUrl: page.url` to the extractor; each `ExtractError` code maps to the right failure detail; executor (DB suite): `dispose` is awaited after a run, and a throwing `dispose` is logged, not thrown; fake context gains `extractList` backed by the real pure `extractList` (so collector tests exercise real extraction without a worker); copy parity covers the new codes.
- [ ] **Step 2: Implement.** `live.ts`: `buildLiveContext` creates `createExtractSandbox({ workerPath: path.join(process.cwd(), HTML_EXTRACT_BUNDLE) })` and returns `dispose: () => sandbox.close()` alongside `ctx`/`meter`.
- [ ] **Step 3: Unit + DB tests, lint, typecheck → PASS. Commit** `"Collectors: the extractList capability, served by the sandbox and disposed after each run"`.

---

### Task 6: The `page-list` collector

**Files:** Create `src/server/collectors/collectors/page-list.ts`, `page-list.test.ts`; modify `catalog.ts`, `catalog.test.ts`, `collector.ts` (`FieldHint.columns`), `eslint.config.js`.

**Interfaces:**
- Input (Zod): `url` (https, ≤ 2 048), `itemSelector` (string, `checkSelector` refine), `fields` (array 1–20 of `{ name, selector, attribute? }` with the name/attribute regexes from Global Constraints, selector refine, unique names), `nextPageSelector` (optional, refine), `maxPages` (int 1–20, default 5).
- Item schema: `z.record(z.string(), z.string().nullable())` — columns come from the member's input; `columnsOf` returns null and exports use the first row's keys (already supported).
- `FieldHint` gains optional `columns?: Record<string, FieldHint>` (hints for an array-of-rows field's columns); `fieldHints.fields.columns` covers `name`, `selector`, `attribute`.
- `limits: { maxPages: 20, maxItems: 5_000, maxDurationMs: 120_000 }`.

`run`: for each page up to `input.maxPages`: `ctx.fetch(url, { accept: "text/html,application/xhtml+xml" })`; non-2xx → `CollectorStop("error", "failed", …, { code: "page_status", params: { status } })` — this task adds the `page_status` failure code (+ `FAILURE_CODES`, EN "The page answered with error {status}." and natural NL copy); content type not HTML → `not_a_page`; `ctx.extractList({ html, url: res.url }, spec)`; yield each row; `ctx.log("Page N: R items.")`; follow `nextUrl` only if it is http(s) and not already visited (normalised without hash); stop otherwise.

- [ ] **Step 1: Failing tests** (fake context with real `extractList`): two pages joined by a next link; next link loops back → stops after the visited page; `mailto:`/`javascript:` next link → stops; `maxPages: 1` stops after one page; non-HTML content type → `not_a_page`; 404 → `page_status` with `{ status: 404 }`; input schema refuses `li:nth-child(2)`, duplicate column names, 21 columns, `http://` URL, an attribute like `on click`. Catalog test: allows a `ZodRecord` item schema (dynamic columns) and then skips the column-order assertion; every catalog collector still has EN/NL text and complete hints including `columns` for array fields.
- [ ] **Step 2: Implement; register in `COLLECTORS`; extend the ESLint boundary (Global Constraints) and prove it with a temporary probe file (delete it).**
- [ ] **Step 3: Tests, lint, typecheck → PASS. Commit** `"Collectors: page-list collector (list on a web page)"`.

---

### Task 7: "Rows" field kind in the start form

**Files:** Modify `src/server/collectors/runs.ts` (`CollectorSummary.fields[].columns`), `src/lib/collectors/form-fields.ts` + test, `src/components/collectors/field-renderers.tsx` + test, `src/components/collectors/start-run-form.tsx` + test, `messages/en.json`, `messages/nl.json`.

**Interfaces:**
- `CollectorSummary.fields[i].columns: { name: string; label: string; help: string | null; placeholder: string | null }[] | null` (localised from `FieldHint.columns`).
- `FieldShape` gains `{ kind: "rows"; min: number; max: number; columns: FormColumn[] }` where `FormColumn = FieldBase & ({ kind: "text" } | { kind: "url" } | { kind: "number"; integer: boolean })` — scalar kinds only; nested rows or unsupported column types refuse the whole field.
- `FieldValue = string | boolean | RowValue[]`, `RowValue = Record<string, string>`.
- `coerceInput`: rows → array of objects; trim cells; drop empty optional cells; drop rows whose cells are all empty; numbers converted per column.

`drawnAs`: `type === "array"` with `items.type === "object"` → rows; `min = minItems ?? 0`, `max = maxItems ?? 20`; columns from `items.properties` in hint order; `required` from `items.required`. JSON shape reference (zod 4.3.6 output): `{ type: "array", minItems, maxItems, items: { type: "object", properties: { name: {type:"string", minLength, maxLength}, selector: {...}, attribute: {...} }, required: ["name","selector"], additionalProperties: false } }`.

Renderer `RowsField`: a fieldset with a legend (field label) and help; one row per entry with a labelled input per column (visible column headings on wide screens; each input keeps its own `<label>` for screen readers, visually hidden on wide screens); "Add column" (outline) disabled at `max`; "Remove" (ghost, icon + accessible name "Remove row N") disabled at `min`; field-level error shown under the fieldset (`aria-describedby`). Start with `min` rows (at least one). New copy: `collectors.start.addRow`, `collectors.start.removeRow` (with `{n}`), EN/NL. DESIGN.md: no orange here (Start run stays the one orange action); full borders, no nested cards.

- [ ] **Step 1: Failing tests** — `formFieldsFor` maps the reference schema to a rows field with three columns and the right required flags; refuses arrays of scalars and nested rows; `coerceInput` trims, drops empty optional cells and empty rows; renderer adds/removes rows within min/max and labels every input; start form submits `fields: [{ name, selector }]` for a filled page-list form (assert the mutate call).
- [ ] **Step 2: Implement. Tests, lint, typecheck → PASS. Commit** `"Collectors: rows field kind for column lists in the start form"`.

---

### Task 8: Run page and history fit dynamic columns

**Files:** Modify only if needed: `src/components/collectors/collector-run.tsx` (+ test).

The run page already takes columns from the union of the rows' keys and history shows the first string input as the target. Add one test with a page-list run (dynamic columns, a null cell) and fix only if it fails. If nothing changes, record "no change needed" in the report and commit nothing.

---

### Task 9: ADR-0041 and spec

**Files:** Create `docs/adr/0041-html-extraction-runs-in-a-deadline-bound-worker-with-a-selector-allowlist.md`; modify the collectors spec.

ADR (status: accepted): context (hostile HTML and selectors can freeze or crash the parser: measured numbers), decision (worker per run, 5 s per-page deadline, replace on timeout; pure extraction function; selector allowlist; depth cap 512; pre-bundled worker shipped via `outputFileTracingIncludes`), rejected options (node-html-parser — cubic parse and wrong trees; parsing on the main thread with only limits — no limit bounds the parse itself; `new URL("./worker", import.meta.url)` and eval/plain-file workers — fail in isolated builds), consequences (esbuild step in `build`/`dev`; one worker start per run ≈ 35–55 ms; the worker shares the function's CPU and memory; re-verify packaging on a Next major upgrade).

Spec: `page-list` section rewritten to what ships (inputs, limits, allowlist, paging rules, failure codes), extraction sandbox described under the context, failure-code table extended, "Gate before enabling" updated (page-list's sandbox condition met), slice 3 entry updated. Grep for old claims about page-list and fix them in place.

Commit `"docs: ADR-0041 extraction sandbox; spec for the page-list collector"`.

---

### Task 10: Verification, including the packaging proof

- [ ] `git status --short` empty after the last commit.
- [ ] `pnpm check`; `SKIP_ENV_VALIDATION=1 pnpm test`; DB prefix run of `src/server/collectors`; Node 20 run of `src/lib/collectors src/server/collectors/extract src/server/collectors/collectors`.
- [ ] Packaging proof (local): `pnpm build:workers`, then the exact local build command from Global Constraints. Assert `.next/server/app/api/cron/collector-worker/route.js.nft.json` lists a path ending in `workers/dist/html-extract.bundle.cjs`. Then copy only the bundle into a temp dir outside the repo (no `node_modules` in reach) and run one extraction through a `Worker` there, proving the bundle is self-contained. Report the commands and outputs.
- [ ] Report everything with outputs; do not push.

**Owner check after deploy (manual, not part of the build):** with `FEATURE_COLLECTORS` still off in production, the owner may enable it for the Preview environment only and run "List on a web page" against a known public page and a hostile test page on the preview, to confirm the worker on real Vercel. The plan does not change any environment variable.

---

### Task 11: Real-world test on startup careers pages

**Purpose:** prove the collector on real, messy HTML against known answers: the roles our startup jobs scan already collected.

**Input (prepared by the controller, not in the repo):** a JSON file in the controller's scratch folder with ~30 startups sampled read-only from production: `{ slug, jobsUrl, board, knownTitles: string[] }`. Mix: ~20 "own website", 4 Personio, 3 Greenhouse, 3 Lever, 2 Ashby, 1 Workable. Ashby and Workable are expected to fail (JavaScript-rendered boards) and are included to document the limit.

**Steps (no repo commits except the report summary in the spec):**
- [ ] For each page: fetch it once through `safeFetch` with the collector user agent (respect robots.txt via the collector context — run through the real engine, not a raw fetch), inspect the HTML, and write the `page-list` input a member would write (item selector, columns `title` and `link` at least, next-page selector if any). Selectors must pass the allowlist; if a page needs a refused feature, record that as a finding — do not loosen the allowlist.
- [ ] Run each input through the real engine locally (`createCollectorRuns` + `runWorkerTick` with live context wiring, the built worker bundle, `FEATURE_COLLECTORS=on`, DATABASE_URL = the local test database only), so robots.txt, the per-site limit, budgets and the sandbox all apply.
- [ ] Compare extracted titles with `knownTitles` (case- and whitespace-insensitive): recall (known found / known), noise (extracted not known), and outcome per page: works (recall ≥ 0.9) / partial / blocked by site rules / needs JavaScript / selector feature refused / other failure.
- [ ] Write the full per-page results to the controller's scratch folder (not the repo). Add a short aggregate to the spec under the page-list section ("Real-world check, 2026-10"): counts per outcome and per board, and any limit that blocked real pages. Commit only that spec change: `"docs: page-list real-world check results"`.
- [ ] Never write to production; never run against `.env`'s `DATABASE_URL`.

## Self-review

- Spec coverage: page-list inputs/limits (Task 6), extraction safety (Tasks 1–4), capability + failure codes (Task 5), form (Task 7), screens (Task 8), docs (Task 9), packaging proof (Tasks 3, 10).
- Review Focus 1–5 owned by Tasks 4/6, 1/2/6, 2, 6, 3/10. Real-world behaviour: Task 11.
- Types: `ExtractSpec`/`ExtractResult` defined once in `protocol.ts` and reused by worker, sandbox, context and collector.
