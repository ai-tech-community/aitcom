# Collector Presets and Workspace (Slice A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every collector run starts from a preset (`feed`, `custom-page`), chosen in one full-width collector workspace with a persistent left rail and a paste box, and every run records the preset it came from.

**Architecture:** Presets are typed data in code (`src/server/collectors/presets/catalog.ts`), each a *Prototype*: a prototype input (`base`) the member copies and adjusts, plus the fields asked up front (`ask`). The `CollectorRuns` facade gains a preset port, `listPresets`, `recognize` (a pure scan of each preset's `recognize`, falling back to `custom-page`) and starts by preset; `collector_run.preset_id` records it. The member dashboard frame (greeting + tabs) becomes `MemberDashboardFrame`, shared by the `(member)` route group (with the side panel) and a new `(member-wide)` group (without it) that holds the collector routes; a `collectors/layout.tsx` mounts `CollectorWorkspace` once, so the rail persists across start, My runs and run pages.

**Tech Stack:** Next 15.4 app router (route groups, async server components), next-intl 4, tRPC 11 + TanStack Query 5, Zod 4, Drizzle (raw `app.collector_run` table) with hand-written Payload migrations, Vitest 4 + Testing Library, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-04-collector-presets-design.md` (Slice A), building on `docs/superpowers/specs/2026-10-03-data-collectors-design.md`, ADR-0040 (collector catalog, facade, protection proxy) and ADR-0041 (extraction sandbox). Design rules: `PRODUCT.md`, `DESIGN.md`.

## Global Constraints

- Branch `feat/collector-presets` (PR #424 holds the spec). Every commit step starts with `git branch --show-current` and stops if it is not `feat/collector-presets`. Never `git checkout`/`switch`/`stash`/`add -A`/`add .`; stage files by name and confirm `git diff --cached --name-only` lists only this task's files (an unrelated `.superpowers/brainstorm/` folder sits untracked in the tree — never stage it).
- Commits: plain descriptive messages in the repo's `Collectors: …` style. No `Co-Authored-By`, no "Generated with", no AI credit line of any kind.
- Migrations are hand-written Payload migrations in `src/migrations/*.ts`, registered in `src/migrations/index.ts`. Never `drizzle-kit push`, never `pnpm db:push`. `drizzle/` is vestigial.
- `.env`'s `DATABASE_URL` is PRODUCTION. Never run `pnpm build`, `pnpm db:apply`, `pnpm db:push`, or any script without an explicit test `DATABASE_URL`. The production build applies migrations on merge — that is the only way `20261004a` reaches production.
- DB tests only with the prefix `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test` (never port 5432 — it is an SSH tunnel to a remote database). The test database gets the new column only through the guarded migration test of Task 3, which refuses any database but `aitcom_test`. A DB suite that reports *skipped* is a setup failure: fix the environment, do not continue.
- Unit test prefix: `SKIP_ENV_VALIDATION=1 pnpm vitest run <paths>`.
- `collector_run` is a raw Drizzle table (`src/server/db/schema.ts`, typed via `CollectorDb` in `src/server/collectors/db.ts`), **not** a Payload collection: no `payload generate:types` is needed. Only `schema.ts` and the migration change.
- CI runs Node 20; local is Node 26. Final verification includes a Node 20 run: `SKIP_ENV_VALIDATION=1 npx -y node@20 node_modules/vitest/vitest.mjs run <paths>`.
- Feature flag `FEATURE_COLLECTORS` and `COLLECTORS_DISABLED` stay exactly as they are. Every collector route still calls `collectorsEnabled()` and `requireDashboardSession()`.
- Member copy in everyday words, EN + NL, in `messages/en.json` and `messages/nl.json` (key parity is checked by `src/lib/collectors/collectors-messages.test.ts` and `scripts/check-i18n-parity.mjs`). Preset titles and summaries are `LocalizedText` in code, like collector titles.
- Design (DESIGN.md): **One Voice** — the Start run button stays the screen's only orange; the rail's active entry is ink (`bg-secondary text-foreground font-medium`, `aria-current="page"`), never orange. **House Kicker** — no `/ LABEL` kickers and no breadcrumbs on collector pages (no `DashboardSection` titles, no `SectionLabel`); use `SectionBody` for the data states. **Flat-by-default** — full hairline borders, no new shadows, no side stripes. **Mono-is-machine** — Geist Mono only for addresses, counts, timestamps; preset titles, group names and help are Geist Sans. Use `src/components/ui` primitives (`Button`, `Input`, `Label`, `EmptyState`, `Alert`, `Checkbox`).
- Patterns: **Prototype** (presets: `base` copied and adjusted), **Strategy** (collectors, unchanged), **Protection Proxy** (`CollectorContext`, unchanged — recognition never fetches). **Facade** (`createCollectorRuns`) stays the one entry point; the tRPC router stays a thin adapter.
- Every task ends green on: its own tests, `pnpm typecheck`, and `pnpm lint` for the files it touched.

## Review Focus

1. **The server refuses a value the member cannot see** (a field behind "Show settings", e.g. a preset's saved item selector) → the settings open by themselves and the message sits at that field; the member is never left with "Some fields need attention." and nothing marked. Task 9.
2. **An old bookmarked address** (`/dashboard/collectors/new/page-list?url=…`, `/new/feed-items`) → a permanent redirect to the preset that replaced it, query kept; an id that only looks special (`constructor`, `__proto__`) → the "does not exist" state, never a crash and never a redirect. Tasks 1 and 9.
3. **Pasted text that is not a web address** (`hello world`, `javascript:alert(1)`, `mailto:a@b.nl`, `localhost:3000`, 5 000 characters) → an inline message under the box, no request and no navigation; the server refuses the same text if it is sent anyway. Tasks 2, 4 and 7.
4. **Moving from one preset to another in the rail** (the workspace layout stays mounted, the page component is reused) → the new start page shows only its own preset's values; nothing typed for the previous preset carries over. Task 9.
5. **Runs from before this change** (`preset_id` null) **and runs whose preset is gone or whose collector is switched off** → still named, e.g. "Custom page · jobs.example.com/careers" or the collector's title; never a blank or raw-id heading when a better name exists. Tasks 6 and 10.

---

## File map

| File | Responsibility |
|---|---|
| `src/server/collectors/presets/preset.ts` | `CollectorPreset<I>` (Prototype), `definePreset`, `PRESET_GROUPS`, `CUSTOM_PAGE_PRESET_ID` (client-safe: type-only imports) |
| `src/server/collectors/presets/catalog.ts` | the preset entries (`feed`, `custom-page`), `allPresets`, `getPreset` |
| `src/server/collectors/presets/former-start-ids.ts` | frozen map: collector ids that used to be start ids → their preset (old addresses, old runs) |
| `src/server/collectors/presets/recognize.ts` | `recognizePreset(url, presets)`: ordered scan, Custom page fallback, never fetches |
| `src/lib/collectors/address.ts` | `parseAddress(text)`: pasted text → `URL` or null (client pre-check and server rule) |
| `src/lib/collectors/start-address.ts` | `startHref`, `readStartQuery`: the one encoding of a start page's prefill in the URL |
| `src/lib/collectors/run-name.ts` | `formatTarget`, `runTarget` (moved), `mainInput`, `runName`: what a run is called |
| `src/lib/collectors/preset-form.ts` | `splitFields`, `formValueOf`, `presetInitialValues`, `hasProblemIn` |
| `src/migrations/20261004a_collector_run_preset.ts` (+ `index.ts`), `src/server/db/schema.ts` | `collector_run.preset_id` |
| `src/server/collectors/runs.ts`, `live.ts` | facade: preset port, start by preset, `presetId` on `RunView`, `listPresets`, `recognize` |
| `src/server/api/routers/collectors.ts` | `overview.presets`, last 5 runs, `recognize` query, `start` by `presetId` |
| `src/components/dashboard/member-dashboard-frame.tsx` | greeting + tabs, shared by both member route groups |
| `src/app/[locale]/dashboard/(member)/layout.tsx`, `(member-wide)/layout.tsx` | frame with / without side panel |
| `src/app/[locale]/dashboard/(member-wide)/collectors/**` | the moved collector routes, `collectors/layout.tsx` (workspace), `new/[presetId]` |
| `src/components/collectors/collector-workspace.tsx` | two-column workspace, rail, narrow-screen picker, `activeEntry`, `railGroups` |
| `src/components/collectors/paste-box.tsx` | the rail's paste box and paste flow |
| `src/components/collectors/use-run-namer.ts` | hook: names runs from the cached overview |
| `src/components/collectors/collectors-landing.tsx` | replaces `collectors-home.tsx`: the line + last 5 runs |
| `src/components/collectors/start-run-form.tsx`, `run-history.tsx`, `collector-run.tsx` | start by preset with "Show settings"; My runs and run page without breadcrumbs/kickers |
| `src/i18n/navigation.ts` | also export `permanentRedirect` |
| `messages/en.json`, `messages/nl.json` | `collectors.workspace.*`, new `start.*` keys, removed dead keys |
| `DESIGN.md`, the spec | named "Page frame" exception; spec brought in line with the decisions below |

## Decisions this plan takes (the spec left them open)

- **Old start addresses redirect (308), they are not aliases.** `new/[presetId]/page.tsx` sends `feed-items` → `feed` and `page-list` → `custom-page` with `permanentRedirect`, keeping the query. One address per preset keeps the rail's active mark, the recorded `presetId` and shared links in agreement; an alias would render one page under two addresses that the rail cannot mark, and would keep collector ids alive as if they were preset ids. Permanent is safe because the map is frozen and a test forbids a former id from ever becoming a preset id.
- **The same frozen map names old runs.** A run with `preset_id` null takes the preset that replaced its collector, so "page-list" runs read "Custom page · …".
- **The facade starts by preset *or* by collector id** (`StartRunArgs` is a union). The web always sends `presetId`; the agent (MCP slice, ADR-0040) will keep starting by collector id with `preset_id` null. The tRPC `start` takes only `presetId` (the feature is flag-off in production, so no open tab sends the old shape).
- **The server does not merge `base` into the input.** The start form pre-fills every field from `base`; what the member submits (edited or not) is the input, validated by the collector's schema as today.
- **`recognize` returns `{ presetId, prefill, matched }`.** `matched` decides whether the start page says "Recognised as …"; the Custom page fallback is not a recognition. It returns `no_preset` when even the Custom page is unavailable (`COLLECTORS_DISABLED=page-list`). A recognizer that throws counts as no match. Text without a scheme gets `https://`.
- **Prefill travels as query parameters** named after input fields, plus the reserved `recognised=1`; only names that are fields of the preset are used. A catalog test forbids an input field named `recognised`.
- **The rail persists via `collectors/layout.tsx`**; the active entry comes from the pathname. The run page marks "My runs" as active.
- **Narrow-screen picker** = a `<details>` disclosure above the content naming the open entry, containing the same list. No JavaScript menu, nothing to clip.
- **Usage line and "How our collector visits sites" link move to the rail footer** (the landing loses the old intro and catalog list).
- **`preset_id` is `varchar(64)`**, like `collector_id` and the tRPC id limit (the spec says `text`).
- **Landing line** is "Pick a site from the list, or paste a link." — the spec's "on the left" is wrong on narrow screens, where the picker sits above.
- **The kind badge leaves the start page**; the preset title and summary say what it reads.

---

### Task 1: Preset model and catalog

**Files:**
- Create: `src/server/collectors/presets/preset.ts`, `src/server/collectors/presets/former-start-ids.ts`, `src/server/collectors/presets/catalog.ts`
- Test: `src/server/collectors/presets/catalog.test.ts`

**Interfaces:**
- Consumes: `Collector`, `FieldHint`, `LocalizedText` from `src/server/collectors/collector.ts`; `feedItems`, `pageList`; `allCollectors`, `getCollector` from `src/server/collectors/catalog.ts`; `checkSelector` from `src/lib/collectors/selector-policy.ts`.
- Produces:
  - `PRESET_GROUPS = ["jobs", "research", "custom"] as const`; `type PresetGroup`
  - `CUSTOM_PAGE_PRESET_ID = "custom-page"`
  - `interface CollectorPreset<I> { id; group: PresetGroup; title: LocalizedText; summary: LocalizedText; collectorId: string; base: Partial<I>; ask: readonly (keyof I & string)[]; hints?: Partial<Record<keyof I & string, FieldHint>>; recognize?(url: URL): Partial<I> | null }`; `type AnyPreset = CollectorPreset<any>`
  - `definePreset<I, R>(collector: Collector<I, R>, preset: Omit<CollectorPreset<I>, "collectorId">): CollectorPreset<I>`
  - `allPresets(): readonly AnyPreset[]`; `getPreset(id: string): AnyPreset | undefined`
  - `formerStartIds(): Readonly<Record<string, string>>`; `presetIdForFormerId(id: string): string | null`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/collectors/presets/catalog.test.ts
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import { checkSelector } from "@/lib/collectors/selector-policy";

import { allCollectors, getCollector } from "../catalog";
import { allPresets, getPreset } from "./catalog";
import { formerStartIds, presetIdForFormerId } from "./former-start-ids";
import { CUSTOM_PAGE_PRESET_ID, PRESET_GROUPS } from "./preset";

/**
 * What a member would type into each preset's asked fields. Every preset
 * needs an entry: the test proves `base` plus these answers is a valid input.
 */
const ASK_SAMPLES: Record<string, Record<string, unknown>> = {
  feed: { url: "https://example.com/feed.xml" },
  "custom-page": {
    url: "https://example.com/jobs",
    itemSelector: "li.job",
    fields: [{ name: "title", selector: "h3" }],
  },
};

function inputNames(collectorId: string): string[] {
  const collector = getCollector(collectorId)!;
  return Object.keys((collector.inputSchema as z.ZodObject).shape);
}

/** Every selector a page-list input gives the allowlist. */
function selectorsOf(input: Record<string, unknown>): string[] {
  const out: string[] = [];
  for (const key of ["itemSelector", "nextPageSelector"]) {
    const value = input[key];
    if (typeof value === "string") out.push(value);
  }
  if (Array.isArray(input.fields)) {
    for (const field of input.fields as { selector?: unknown }[]) {
      if (typeof field.selector === "string" && field.selector.trim()) {
        out.push(field.selector);
      }
    }
  }
  return out;
}

describe("preset catalog", () => {
  const presets = allPresets();

  it("has unique kebab-case ids", () => {
    const ids = presets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it.each(presets.map((p) => [p.id, p] as const))(
    "%s is complete and consistent",
    (id, preset) => {
      const collector = getCollector(preset.collectorId);
      expect(collector, "collectorId names a collector").toBeDefined();
      for (const text of [preset.title, preset.summary]) {
        expect(text.en.trim()).not.toBe("");
        expect(text.nl.trim()).not.toBe("");
      }
      expect(PRESET_GROUPS).toContain(preset.group);

      const names = inputNames(preset.collectorId);
      expect(preset.ask.length).toBeGreaterThan(0);
      for (const name of preset.ask) expect(names).toContain(name);
      for (const name of Object.keys(preset.base)) expect(names).toContain(name);
      for (const name of Object.keys(preset.hints ?? {})) {
        expect(names).toContain(name);
      }

      const sample = ASK_SAMPLES[id];
      expect(sample, `add ${id} to ASK_SAMPLES`).toBeDefined();
      for (const name of Object.keys(sample!)) {
        expect(preset.ask).toContain(name);
      }
      const parsed = collector!.inputSchema.safeParse({
        ...preset.base,
        ...sample,
      });
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);

      if (preset.collectorId === "page-list") {
        for (const selector of selectorsOf(
          preset.base as Record<string, unknown>,
        )) {
          expect(checkSelector(selector), selector).toEqual({ ok: true });
        }
      }
    },
  );

  it("ends with one Custom page that asks for every page-list input", () => {
    expect(
      presets.filter((p) => p.group === "custom").map((p) => p.id),
    ).toEqual([CUSTOM_PAGE_PRESET_ID]);
    expect(presets.at(-1)?.id).toBe(CUSTOM_PAGE_PRESET_ID);
    const custom = getPreset(CUSTOM_PAGE_PRESET_ID)!;
    expect(custom.collectorId).toBe("page-list");
    expect([...custom.ask].sort()).toEqual(inputNames("page-list").sort());
    expect(custom.recognize).toBeUndefined();
  });

  it("offers a start for every collector", () => {
    for (const collector of allCollectors()) {
      expect(
        presets.some((p) => p.collectorId === collector.id),
        collector.id,
      ).toBe(true);
    }
  });

  it("maps every former start id to a preset of that same collector", () => {
    for (const [former, presetId] of Object.entries(formerStartIds())) {
      expect(getCollector(former), former).toBeDefined();
      expect(getPreset(presetId)?.collectorId).toBe(former);
      // A former id must never become a preset id: its address redirects.
      expect(getPreset(former)).toBeUndefined();
    }
  });

  it("reads only its own entries as former ids", () => {
    expect(presetIdForFormerId("feed-items")).toBe("feed");
    expect(presetIdForFormerId("page-list")).toBe("custom-page");
    expect(presetIdForFormerId("feed")).toBeNull();
    expect(presetIdForFormerId("constructor")).toBeNull();
    expect(presetIdForFormerId("__proto__")).toBeNull();
    expect(presetIdForFormerId("toString")).toBeNull();
  });

  it("finds nothing for an unknown id", () => {
    expect(getPreset("nope")).toBeUndefined();
    expect(getPreset("constructor")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/collectors/presets/catalog.test.ts`
Expected: FAIL — `Failed to resolve import "./catalog"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/server/collectors/presets/preset.ts
import type { Collector, FieldHint, LocalizedText } from "../collector";

/** Rail groups, in rail order. The Custom page is always last. */
export const PRESET_GROUPS = ["jobs", "research", "custom"] as const;
export type PresetGroup = (typeof PRESET_GROUPS)[number];

/** The preset every unrecognised address opens: page-list, member's selectors. */
export const CUSTOM_PAGE_PRESET_ID = "custom-page";

/**
 * A named, ready-made start for one collector (Prototype): a prototype input
 * the member copies and adjusts. Presets are reviewed code, like the collector
 * catalog (ADR-0040); every run they start goes through the same guarded
 * context as any other run.
 */
export interface CollectorPreset<I> {
  /** URL slug, e.g. "greenhouse-board". */
  id: string;
  group: PresetGroup;
  title: LocalizedText;
  /** One sentence: what it reads. */
  summary: LocalizedText;
  /** Must exist in the collector catalog. */
  collectorId: string;
  /** The full input, minus the fields the member must give. */
  base: Partial<I>;
  /** Input fields shown up front; everything else sits behind "Show settings". */
  ask: readonly (keyof I & string)[];
  /** Field hints that replace the collector's own for this preset. */
  hints?: Partial<Record<keyof I & string, FieldHint>>;
  /**
   * Recognise a pasted address; return the input to pre-fill, or null.
   * Pure: never fetches, so pasting a link sends nothing to that site.
   */
  recognize?(url: URL): Partial<I> | null;
}

// A catalog of presets for different collectors needs `any` (as AnyCollector).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyPreset = CollectorPreset<any>;

/**
 * A preset for `collector`, typed by that collector's input, so `base`, `ask`
 * and `hints` can only name fields the collector has.
 */
export function definePreset<I, R extends Record<string, unknown>>(
  collector: Collector<I, R>,
  preset: NoInfer<Omit<CollectorPreset<I>, "collectorId">>,
): CollectorPreset<I> {
  return { ...preset, collectorId: collector.id };
}
```

```ts
// src/server/collectors/presets/former-start-ids.ts

/**
 * Before presets, a start address and a run named a collector
 * (`/dashboard/collectors/new/feed-items`). Each such collector id maps to the
 * preset that replaced it: old addresses redirect there, and old runs (no
 * preset recorded) are named after it. Frozen — new presets never need an
 * entry. No imports, so screens can use it.
 */
const FORMER_START_IDS: Readonly<Record<string, string>> = Object.freeze({
  "feed-items": "feed",
  "page-list": "custom-page",
});

export function formerStartIds(): Readonly<Record<string, string>> {
  return FORMER_START_IDS;
}

/** The preset that replaced a former start id, or null for any other id. */
export function presetIdForFormerId(id: string): string | null {
  return Object.hasOwn(FORMER_START_IDS, id) ? FORMER_START_IDS[id]! : null;
}
```

```ts
// src/server/collectors/presets/catalog.ts
import { feedItems } from "../collectors/feed-items";
import { pageList } from "../collectors/page-list";
import { type AnyPreset, CUSTOM_PAGE_PRESET_ID, definePreset } from "./preset";

const feed = definePreset(feedItems, {
  id: "feed",
  group: "research",
  title: { en: "News or blog feed", nl: "Nieuws- of blogfeed" },
  summary: {
    en: "The latest items of an RSS or Atom feed: title, link, date, author and a short summary.",
    nl: "De nieuwste items van een RSS- of Atom-feed: titel, link, datum, auteur en een korte samenvatting.",
  },
  base: {},
  ask: ["url"],
});

const customPage = definePreset(pageList, {
  id: CUSTOM_PAGE_PRESET_ID,
  group: "custom",
  title: { en: "Custom page", nl: "Eigen pagina" },
  summary: {
    en: "Any list on a web page, read with the CSS selectors you give. For sites we don't know yet.",
    nl: "Elke lijst op een webpagina, gelezen met de CSS-selectors die jij opgeeft. Voor sites die we nog niet kennen.",
  },
  base: {},
  ask: ["url", "itemSelector", "fields", "nextPageSelector", "maxPages"],
});

/**
 * Every preset, as typed data in code (Prototype; same approach as the
 * collector catalog, ADR-0040). Order is rail order within a group and
 * recognition order. Adding a preset = one entry here.
 */
const PRESETS: readonly AnyPreset[] = [feed, customPage];

export function allPresets(): readonly AnyPreset[] {
  return PRESETS;
}

export function getPreset(id: string): AnyPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/collectors/presets/catalog.test.ts && pnpm typecheck`
Expected: PASS; typecheck clean. (If `NoInfer` makes `ask` widen, keep it — it exists in TS 5.9; the point is that `I` is inferred from `collector` only.)

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/collector-presets
git add src/server/collectors/presets/preset.ts src/server/collectors/presets/former-start-ids.ts src/server/collectors/presets/catalog.ts src/server/collectors/presets/catalog.test.ts
git diff --cached --name-only
git commit -m "Collectors: preset model and catalog (feed, custom page)"
```

---

### Task 2: Address parsing, preset recognition and start addresses

**Files:**
- Create: `src/lib/collectors/address.ts`, `src/server/collectors/presets/recognize.ts`, `src/lib/collectors/start-address.ts`
- Test: `src/lib/collectors/address.test.ts`, `src/server/collectors/presets/recognize.test.ts`, `src/lib/collectors/start-address.test.ts`
- Modify: `src/server/collectors/presets/catalog.test.ts` (one test)

**Interfaces:**
- Consumes: `AnyPreset`, `CUSTOM_PAGE_PRESET_ID` (Task 1); `allPresets` (Task 1).
- Produces:
  - `MAX_ADDRESS_LENGTH = 2_048`; `parseAddress(text: string): URL | null`
  - `type PresetMatch = { presetId: string; input: Record<string, unknown>; matched: boolean }`; `recognizePreset(url: URL, presets: readonly AnyPreset[]): PresetMatch | null`
  - `RECOGNISED_PARAM = "recognised"`; `startHref(presetId: string, opts?: { prefill?: Record<string, string>; recognised?: boolean }): string`; `type StartQuery = { prefill: Record<string, string>; recognised: boolean }`; `readStartQuery(query: Record<string, string | string[] | undefined>): StartQuery`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/collectors/address.test.ts
import { describe, expect, it } from "vitest";

import { MAX_ADDRESS_LENGTH, parseAddress } from "./address";

describe("parseAddress", () => {
  it.each([
    ["https://example.com/jobs", "https://example.com/jobs"],
    ["  https://example.com/jobs  ", "https://example.com/jobs"],
    ["example.com/jobs", "https://example.com/jobs"],
    ["boards.greenhouse.io/acme", "https://boards.greenhouse.io/acme"],
    ["http://example.com/", "http://example.com/"],
    ["HTTPS://Example.COM/a?b=1#c", "https://example.com/a?b=1#c"],
  ])("reads %j as %s", (text, href) => {
    expect(parseAddress(text)?.href).toBe(href);
  });

  it.each([
    "",
    "   ",
    "hello world",
    "javascript:alert(1)",
    "mailto:a@b.nl",
    "ftp://example.com/file",
    "localhost:3000",
    "https://localhost/",
    "https://user:pw@example.com/",
    "https://exa mple.com/",
    `https://example.com/${"a".repeat(MAX_ADDRESS_LENGTH)}`,
  ])("refuses %j", (text) => {
    expect(parseAddress(text)).toBeNull();
  });
});
```

```ts
// src/server/collectors/presets/recognize.test.ts
import { afterEach, describe, expect, it, vi } from "vitest";

import { allPresets } from "./catalog";
import type { AnyPreset } from "./preset";
import { recognizePreset } from "./recognize";

function preset(
  id: string,
  recognize?: (url: URL) => Record<string, unknown> | null,
): AnyPreset {
  return {
    id,
    group: id === "custom-page" ? "custom" : "research",
    title: { en: id, nl: id },
    summary: { en: id, nl: id },
    collectorId: "feed-items",
    base: {},
    ask: ["url"],
    ...(recognize ? { recognize } : {}),
  };
}

const custom = preset("custom-page");
const url = (href: string) => new URL(href);

afterEach(() => vi.restoreAllMocks());

describe("recognizePreset", () => {
  it("takes the first preset, in catalog order, that recognises the address", () => {
    const presets = [
      preset("no", () => null),
      preset("first", (u) => (u.hostname === "boards.example.com" ? { name: "acme" } : null)),
      preset("second", () => ({ name: "other" })),
      custom,
    ];
    expect(recognizePreset(url("https://boards.example.com/acme"), presets)).toEqual({
      presetId: "first",
      input: { name: "acme" },
      matched: true,
    });
  });

  it("opens the Custom page with the address when nothing recognises it", () => {
    expect(
      recognizePreset(url("https://example.com/jobs?page=2"), [preset("no", () => null), custom]),
    ).toEqual({
      presetId: "custom-page",
      input: { url: "https://example.com/jobs?page=2" },
      matched: false,
    });
  });

  it("skips a recognizer that throws, and says so in the log", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const presets = [
      preset("broken", () => {
        throw new Error("boom");
      }),
      custom,
    ];
    expect(recognizePreset(url("https://example.com/"), presets)?.presetId).toBe("custom-page");
    expect(log).toHaveBeenCalledOnce();
  });

  it("gives each recognizer its own copy of the address", () => {
    const presets = [
      preset("mutates", (u) => {
        u.hostname = "evil.example";
        return null;
      }),
      preset("reads", (u) => ({ host: u.hostname })),
      custom,
    ];
    expect(recognizePreset(url("https://example.com/"), presets)?.input).toEqual({
      host: "example.com",
    });
  });

  it("has nowhere to go when the Custom page is unavailable", () => {
    expect(recognizePreset(url("https://example.com/"), [preset("no", () => null)])).toBeNull();
  });

  it("sends every address to the Custom page in this slice", () => {
    expect(recognizePreset(url("https://boards.greenhouse.io/acme"), allPresets())).toEqual({
      presetId: "custom-page",
      input: { url: "https://boards.greenhouse.io/acme" },
      matched: false,
    });
  });
});
```

```ts
// src/lib/collectors/start-address.test.ts
import { describe, expect, it } from "vitest";

import { RECOGNISED_PARAM, readStartQuery, startHref } from "./start-address";

describe("startHref", () => {
  it("is the preset's start page", () => {
    expect(startHref("feed")).toBe("/dashboard/collectors/new/feed");
  });

  it("carries the prefill and the recognised mark in the query", () => {
    expect(
      startHref("custom-page", {
        prefill: { url: "https://example.com/jobs?a=1&b=2" },
        recognised: true,
      }),
    ).toBe(
      "/dashboard/collectors/new/custom-page?url=https%3A%2F%2Fexample.com%2Fjobs%3Fa%3D1%26b%3D2&recognised=1",
    );
  });

  it("never lets a prefill value pose as the recognised mark", () => {
    expect(startHref("feed", { prefill: { [RECOGNISED_PARAM]: "1" } })).toBe(
      "/dashboard/collectors/new/feed",
    );
  });
});

describe("readStartQuery", () => {
  it("reads back what startHref wrote", () => {
    const href = startHref("custom-page", {
      prefill: { url: "https://example.com/jobs?a=1&b=2", name: "acme" },
      recognised: true,
    });
    const query = Object.fromEntries(new URL(href, "https://x.test").searchParams);
    expect(readStartQuery(query)).toEqual({
      prefill: { url: "https://example.com/jobs?a=1&b=2", name: "acme" },
      recognised: true,
    });
  });

  it("takes the first of repeated values and ignores missing ones", () => {
    expect(readStartQuery({ url: ["https://a.example/", "https://b.example/"], none: undefined })).toEqual({
      prefill: { url: "https://a.example/" },
      recognised: false,
    });
  });

  it("keeps odd names as plain data", () => {
    const { prefill } = readStartQuery({ __proto__: "x", constructor: "y" } as never);
    expect(Object.getPrototypeOf(prefill)).toBe(Object.prototype);
    expect(prefill.constructor).toBe("y");
  });

  it("is not recognised unless the mark says exactly 1", () => {
    expect(readStartQuery({ recognised: "true" }).recognised).toBe(false);
  });
});
```

Add to `src/server/collectors/presets/catalog.test.ts` (import `RECOGNISED_PARAM` from `@/lib/collectors/start-address`):

```ts
  it("names no collector input like the start page's reserved query key", () => {
    for (const collector of allCollectors()) {
      expect(inputNames(collector.id), collector.id).not.toContain(RECOGNISED_PARAM);
    }
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/collectors/address.test.ts src/server/collectors/presets src/lib/collectors/start-address.test.ts`
Expected: FAIL — modules `./address`, `./recognize`, `./start-address` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/collectors/address.ts

/** The longest address a member may paste (the collectors' own URL limit). */
export const MAX_ADDRESS_LENGTH = 2_048;

const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * Pasted or typed text as a web address, or null. Text without a scheme is
 * read as https ("example.com/jobs"). Only http(s), a host with a dot, and no
 * user name or password. Used by the paste box (no request for text that is
 * not an address) and again by the server.
 */
export function parseAddress(text: string): URL | null {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed.length > MAX_ADDRESS_LENGTH) return null;
  if (/\s/.test(trimmed)) return null;
  let url: URL;
  try {
    url = new URL(SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.hostname.includes(".") || url.username || url.password) return null;
  if (url.href.length > MAX_ADDRESS_LENGTH) return null;
  return url;
}
```

```ts
// src/server/collectors/presets/recognize.ts
import { type AnyPreset, CUSTOM_PAGE_PRESET_ID } from "./preset";

export type PresetMatch = {
  presetId: string;
  /** The input to pre-fill. */
  input: Record<string, unknown>;
  /** False for the Custom page fallback: nothing recognised the address. */
  matched: boolean;
};

/**
 * Which preset a pasted address belongs to: each preset's `recognize`, in
 * catalog order, first answer wins (an ordered scan; a Chain of
 * Responsibility object would be the same behaviour with more code). No
 * answer → the Custom page with the address filled in. Never fetches.
 * Null only when the Custom page itself is unavailable.
 */
export function recognizePreset(
  url: URL,
  presets: readonly AnyPreset[],
): PresetMatch | null {
  for (const preset of presets) {
    if (!preset.recognize) continue;
    let input: Record<string, unknown> | null;
    try {
      // Its own copy: a recognizer that changes the URL cannot affect the next.
      input = preset.recognize(new URL(url.href)) as Record<
        string,
        unknown
      > | null;
    } catch (err) {
      // A broken recognizer must not stop pasting: count it as no match.
      console.error(
        `[collectors] preset ${preset.id} failed to recognise an address`,
        err,
      );
      continue;
    }
    if (input) return { presetId: preset.id, input: { ...input }, matched: true };
  }
  const custom = presets.find((p) => p.id === CUSTOM_PAGE_PRESET_ID);
  return custom
    ? { presetId: custom.id, input: { url: url.href }, matched: false }
    : null;
}
```

```ts
// src/lib/collectors/start-address.ts

/** Query key that marks a start page opened by a recognised paste. */
export const RECOGNISED_PARAM = "recognised";

const START_PATH = "/dashboard/collectors/new";

/**
 * A preset's start page, optionally pre-filled. The one place that encodes a
 * prefill into the address (`readStartQuery` reads it back): one query
 * parameter per input field, plus `recognised=1`.
 */
export function startHref(
  presetId: string,
  opts: { prefill?: Record<string, string>; recognised?: boolean } = {},
): string {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(opts.prefill ?? {})) {
    if (name !== RECOGNISED_PARAM) query.append(name, value);
  }
  if (opts.recognised) query.set(RECOGNISED_PARAM, "1");
  const qs = query.toString();
  return `${START_PATH}/${encodeURIComponent(presetId)}${qs ? `?${qs}` : ""}`;
}

export type StartQuery = {
  /** Values by input field name; the form keeps only its own fields. */
  prefill: Record<string, string>;
  recognised: boolean;
};

/** A start page's query (Next's `searchParams`) as prefill. */
export function readStartQuery(
  query: Record<string, string | string[] | undefined>,
): StartQuery {
  const entries: [string, string][] = [];
  for (const [name, value] of Object.entries(query)) {
    if (name === RECOGNISED_PARAM) continue;
    const first = Array.isArray(value) ? value[0] : value;
    if (typeof first === "string") entries.push([name, first]);
  }
  return {
    // fromEntries defines own properties: "__proto__" stays plain data.
    prefill: Object.fromEntries(entries),
    recognised: query[RECOGNISED_PARAM] === "1",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/collectors/address.test.ts src/server/collectors/presets src/lib/collectors/start-address.test.ts && pnpm typecheck`
Expected: PASS. (In the `__proto__` test, an object literal `{ __proto__: "x" }` sets nothing because the value is not an object; the assertion still proves the result has the normal prototype.)

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/lib/collectors/address.ts src/lib/collectors/address.test.ts src/server/collectors/presets/recognize.ts src/server/collectors/presets/recognize.test.ts src/lib/collectors/start-address.ts src/lib/collectors/start-address.test.ts src/server/collectors/presets/catalog.test.ts
git diff --cached --name-only
git commit -m "Collectors: recognise a pasted address as a preset (Custom page for now)"
```

---

### Task 3: Record the preset of every run (migration)

**Files:**
- Create: `src/migrations/20261004a_collector_run_preset.ts`, `src/migrations/collector-run-preset.integration.test.ts`
- Modify: `src/migrations/index.ts`, `src/server/db/schema.ts` (`collectorRuns`), `src/server/collectors/runs.ts`, `src/server/collectors/live.ts`, `src/server/collectors/collectors.integration.test.ts` (facade helper ~line 884 and new tests); test fixtures that build a `RunView` (add `presetId: null` where `pnpm typecheck` asks).

**Interfaces:**
- Consumes: `AnyPreset` (Task 1), `allPresets`, `getPreset` (Task 1).
- Produces:
  - `collectorRuns.presetId: varchar(64) | null`
  - `interface PresetCatalogPort { all(): readonly AnyPreset[]; get(id: string): AnyPreset | undefined }`; `CollectorRunsDeps.presets: PresetCatalogPort`
  - `type StartRunArgs = { userId; agentId?; origin; input } & ({ presetId: string; collectorId?: never } | { collectorId: string; presetId?: never })`; `startRun(args: StartRunArgs): Promise<StartRunResult>`
  - `RunView.presetId: string | null`

- [ ] **Step 1: Write the failing tests**

```ts
// src/migrations/collector-run-preset.integration.test.ts
// @vitest-environment node
// DB integration for migration 20261004a, called like the deploy runner
// (`{ db }` only) and twice, since a failed deploy re-runs it. This is also
// how the local test database gets the column: it refuses any database but
// aitcom_test. Auto-skips unless RUN_DB_TESTS=1 and a local database is set.
import type { sql as Sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import type { db as Db } from "@/server/db";

import type { up as Up } from "./20261004a_collector_run_preset";

function looksLikeCloudNeon(url: string): boolean {
  return /neon\.tech|neon\.build|pooler\.[^/]*\.neon/i.test(url);
}
function isLocalDbConfigured(): boolean {
  if (process.env.RUN_DB_TESTS !== "1") return false;
  const dbUrl = process.env.DATABASE_URL?.trim() ?? "";
  if (dbUrl && looksLikeCloudNeon(dbUrl)) return false;
  return /(@|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0|db|postgres|host\.docker\.internal)(:|\/)/i.test(
    dbUrl,
  );
}

describe.skipIf(!isLocalDbConfigured())(
  "migration 20261004a collector run preset [DB integration]",
  () => {
    let db: typeof Db;
    let sql: typeof Sql;
    let up: typeof Up;

    beforeAll(async () => {
      const [dbMod, drizzle, runs, detail, migration] = await Promise.all([
        import("@/server/db"),
        import("drizzle-orm"),
        import("./20261003a_collector_runs"),
        import("./20261003b_collector_run_error_detail"),
        import("./20261004a_collector_run_preset"),
      ]);
      db = dbMod.db;
      sql = drizzle.sql;
      up = migration.up;
      const { rows } = await db.execute<{ name: string }>(
        sql`select current_database() as name`,
      );
      if (rows[0]?.name !== "aitcom_test") {
        throw new Error(
          `Refusing to migrate "${rows[0]?.name}"; use aitcom_test.`,
        );
      }
      await runs.up({ db } as never);
      await detail.up({ db } as never);
    }, 120_000);

    it("adds a nullable varchar(64) preset_id column and can run again", async () => {
      await up({ db } as never);
      await up({ db } as never);

      const result = await db.execute(sql`
        SELECT data_type, character_maximum_length, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'app'
          AND table_name = 'collector_run'
          AND column_name = 'preset_id'
      `);
      const rows = ((result as { rows?: unknown }).rows ?? result) as {
        data_type: string;
        character_maximum_length: number;
        is_nullable: string;
      }[];
      expect(rows).toEqual([
        {
          data_type: "character varying",
          character_maximum_length: 64,
          is_nullable: "YES",
        },
      ]);
    });
  },
);
```

In `src/server/collectors/collectors.integration.test.ts`, inside the facade `describe` (the `function facade(over)` at ~line 884): import `getPreset` from `./presets/catalog` at the top of the file, add the preset port to the deps, and add these tests after "refuses an unknown collector and invalid input, storing nothing":

```ts
      const runs = m.runs.createCollectorRuns({
        db: m.db,
        enabled: () => true,
        catalog: {
          all: () => [collector],
          get: (id) => (id === collector.id ? collector : undefined),
        },
        presets: {
          all: () => [getPreset("feed")!],
          get: (id) => (id === "feed" ? getPreset("feed") : undefined),
        },
        kick: () => kicks.push(1),
        now: () => new Date("2026-10-03T12:00:00Z"),
        quota: { runsPerDay: 20, activePerUser: 2, activePlatform: 1_000 },
        ...over,
      });
```

```ts
    it("records the preset a run was started from", async () => {
      const userId = await makeUser();
      const { runs } = facade();
      const started = await runs.startRun({
        userId,
        origin: "web",
        presetId: "feed",
        input: feedInput,
      });
      expect(started).toMatchObject({ ok: true });
      const view = await runs.getRun(userId, (started as { runId: string }).runId);
      expect(view).toMatchObject({ presetId: "feed", collectorId: "feed-items" });
    });

    it("records no preset for a run started by collector id", async () => {
      const userId = await makeUser();
      const { runs } = facade();
      const started = await runs.startRun({
        userId,
        origin: "mcp",
        collectorId: "feed-items",
        input: feedInput,
      });
      const view = await runs.getRun(userId, (started as { runId: string }).runId);
      expect(view?.presetId).toBeNull();
    });

    it("refuses an unknown preset, or one whose collector is off, storing nothing", async () => {
      const userId = await makeUser();
      const { runs } = facade();
      expect(
        await runs.startRun({ userId, origin: "web", presetId: "nope", input: feedInput }),
      ).toMatchObject({ ok: false, reason: "unknown_collector" });
      const { runs: off } = facade({
        catalog: { all: () => [], get: () => undefined },
      });
      expect(
        await off.startRun({ userId, origin: "web", presetId: "feed", input: feedInput }),
      ).toMatchObject({ ok: false, reason: "unknown_collector" });
      expect((await runs.listRuns(userId)).runs).toEqual([]);
    });
```

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/migrations/collector-run-preset.integration.test.ts` → skipped without the DB prefix; then with the DB prefix (Global Constraints) → FAIL: `Failed to resolve import "./20261004a_collector_run_preset"`. `pnpm typecheck` → FAIL on `presets` / `presetId` in the integration test.

- [ ] **Step 3: Write the migration, schema and facade changes**

```ts
// src/migrations/20261004a_collector_run_preset.ts
// Collector presets: the preset a run was started from (spec
// 2026-10-04-collector-presets-design). Additive and nullable: runs from
// before presets, and runs started by collector id (the agent), have none.
// varchar(64) like collector_id.
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."collector_run"
      ADD COLUMN IF NOT EXISTS "preset_id" varchar(64);
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "app"."collector_run" DROP COLUMN IF EXISTS "preset_id";
  `);
}
```

`src/migrations/index.ts`: add `import * as migration_20261004a_collector_run_preset from "./20261004a_collector_run_preset";` after the `20261003b` import, and append to the array after the `20261003b` entry:

```ts
  {
    up: migration_20261004a_collector_run_preset.up,
    down: migration_20261004a_collector_run_preset.down,
    name: "20261004a_collector_run_preset",
  },
```

`src/server/db/schema.ts`, in `collectorRuns` after `errorDetail`:

```ts
    /** Migration 20261004a: the preset the run was started from; null before presets and for starts by collector id. */
    presetId: d.varchar({ length: 64 }),
```

`src/server/collectors/runs.ts`:

```ts
// imports: add
import type { AnyPreset } from "./presets/preset";

export interface PresetCatalogPort {
  all(): readonly AnyPreset[];
  get(id: string): AnyPreset | undefined;
}

export interface CollectorRunsDeps {
  db: typeof appDb;
  enabled(): boolean;
  catalog: CollectorCatalogPort;
  /** Presets; a preset whose collector the catalog hides is hidden too. */
  presets: PresetCatalogPort;
  /** Best-effort wake of the worker; the per-minute cron is the guarantee. */
  kick(): void;
  now(): Date;
  quota?: QuotaLimits;
}

/**
 * A start names a preset (the web: every start goes through one) or a
 * collector (the agent, ADR-0040; no preset is recorded).
 */
export type StartRunArgs = {
  userId: string;
  agentId?: string | null;
  origin: "web" | "mcp";
  input: unknown;
} & (
  | { presetId: string; collectorId?: never }
  | { collectorId: string; presetId?: never }
);
```

`RunView` gains, after `collectorVersion`:

```ts
  /** The preset the run was started from; null before presets and for agent starts. */
  presetId: string | null;
```

`toView` gains `presetId: row.presetId ?? null,` after `collectorVersion`.

Inside `createCollectorRuns`, before `return {`:

```ts
  /** The collector a start names, and the preset it came through. */
  function resolveStart(
    args: StartRunArgs,
  ): { collector: AnyCollector; presetId: string | null } | null {
    if (args.presetId !== undefined) {
      const preset = deps.presets.get(args.presetId);
      const collector = preset ? deps.catalog.get(preset.collectorId) : undefined;
      return preset && collector ? { collector, presetId: preset.id } : null;
    }
    const collector = deps.catalog.get(args.collectorId);
    return collector ? { collector, presetId: null } : null;
  }
```

`startRun` becomes `async startRun(args: StartRunArgs): Promise<StartRunResult>`; replace the `const collector = deps.catalog.get(args.collectorId); if (!collector) {…}` block with:

```ts
      const resolved = resolveStart(args);
      if (!resolved) {
        return {
          ok: false,
          reason: "unknown_collector",
          message: "This collector does not exist.",
        };
      }
      const { collector, presetId } = resolved;
```

and add `presetId,` to the `.values({ … })` of the insert, after `collectorVersion: collector.version,`.

`src/server/collectors/live.ts`: import `{ allPresets, getPreset } from "./presets/catalog"` and add to the deps:

```ts
    presets: { all: allPresets, get: getPreset },
```

- [ ] **Step 4: Apply to the test database and run the tests**

1. `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm vitest run src/migrations/collector-run-preset.integration.test.ts` → PASS (this run adds the column to `aitcom_test`; it must run on its own, before the collectors suite, because Vitest runs files in parallel).
2. Same prefix, `pnpm vitest run src/server/collectors/collectors.integration.test.ts` → PASS, including the three new tests.
3. `pnpm typecheck`. Wherever a test fixture builds a run view or a `collector_run` row by hand and typecheck asks, add `presetId: null` (expected: `src/components/collectors/collector-run.test.tsx`, `run-history.test.tsx`, `collectors-home.test.tsx`). Then `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/collectors src/components/collectors src/server/api/routers/collectors.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/migrations/20261004a_collector_run_preset.ts src/migrations/collector-run-preset.integration.test.ts src/migrations/index.ts src/server/db/schema.ts src/server/collectors/runs.ts src/server/collectors/live.ts src/server/collectors/collectors.integration.test.ts
# plus each fixture file typecheck made you touch, by name
git diff --cached --name-only
git commit -m "Collectors: record the preset a run was started from (migration)"
```

---

### Task 4: Presets and recognition through the facade and tRPC

**Files:**
- Modify: `src/server/collectors/runs.ts`, `src/server/api/routers/collectors.ts`, `src/server/api/routers/collectors.test.ts`
- Create: `src/server/collectors/runs.presets.test.ts`

**Interfaces:**
- Consumes: `parseAddress`, `MAX_ADDRESS_LENGTH` (Task 2), `recognizePreset` (Task 2), `PresetCatalogPort` (Task 3), `PresetGroup` (Task 1).
- Produces:
  - `type PresetSummary = { id: string; group: PresetGroup; title: string; summary: string; collectorId: string; base: Record<string, unknown>; ask: string[]; fields: CollectorSummary["fields"] }` — `fields` are the collector's fields with the preset's hints applied, in the collector's order.
  - `type RecognizeResult = { ok: true; presetId: string; matched: boolean; prefill: Record<string, string> } | { ok: false; reason: "not_an_address" | "no_preset" }`
  - facade `listPresets(locale: "en" | "nl"): PresetSummary[]`, `recognize(text: string): RecognizeResult`
  - tRPC `collectors.overview` returns `{ collectors, presets, recentRuns (last 5), usage, needsAcknowledgement }`; `collectors.recognize({ address: string ≤ 4096 }) → RecognizeResult`

- [ ] **Step 1: Write the failing tests**

```ts
// src/server/collectors/runs.presets.test.ts
import { describe, expect, it, vi } from "vitest";

import { getCollector } from "./catalog";
import { allPresets, getPreset } from "./presets/catalog";
import { type AnyPreset, definePreset } from "./presets/preset";
import { type CollectorRunsDeps, createCollectorRuns } from "./runs";

const feedItems = getCollector("feed-items")!;
const pageList = getCollector("page-list")!;

function facade(over: Partial<CollectorRunsDeps> = {}) {
  const collectors = [feedItems, pageList];
  return createCollectorRuns({
    // listPresets and recognize never touch the database.
    db: {} as never,
    enabled: () => true,
    catalog: {
      all: () => collectors,
      get: (id) => collectors.find((c) => c.id === id),
    },
    presets: { all: allPresets, get: getPreset },
    kick: vi.fn(),
    now: () => new Date("2026-10-04T12:00:00Z"),
    ...over,
  });
}

describe("listPresets", () => {
  it("lists presets in the member's language with their collector's fields", () => {
    const [feed] = facade().listPresets("nl");
    expect(feed).toEqual({
      id: "feed",
      group: "research",
      title: "Nieuws- of blogfeed",
      summary: expect.stringContaining("RSS"),
      collectorId: "feed-items",
      base: {},
      ask: ["url"],
      fields: [
        {
          name: "url",
          label: "Feedadres",
          help: "Het webadres van de RSS- of Atom-feed.",
          placeholder: "https://example.com/feed.xml",
          columns: null,
        },
      ],
    });
  });

  it("lets a preset's hint replace the collector's hint for that field", () => {
    const hinted = definePreset(feedItems, {
      id: "hinted",
      group: "research",
      title: { en: "Hinted", nl: "Hinted" },
      summary: { en: "x", nl: "x" },
      base: {},
      ask: ["url"],
      hints: { url: { label: { en: "Board address", nl: "Adres van het bord" } } },
    });
    const [summary] = facade({
      presets: { all: () => [hinted], get: () => hinted },
    }).listPresets("en");
    expect(summary?.fields).toEqual([
      { name: "url", label: "Board address", help: null, placeholder: null, columns: null },
    ]);
  });

  it("hides presets whose collector is switched off", () => {
    const runs = facade({
      catalog: { all: () => [feedItems], get: (id) => (id === "feed-items" ? feedItems : undefined) },
    });
    expect(runs.listPresets("en").map((p) => p.id)).toEqual(["feed"]);
    expect(runs.recognize("https://example.com/jobs")).toEqual({
      ok: false,
      reason: "no_preset",
    });
  });
});

describe("recognize", () => {
  it("opens the Custom page with a pasted address it does not know", () => {
    expect(facade().recognize("  example.com/jobs ")).toEqual({
      ok: true,
      presetId: "custom-page",
      matched: false,
      prefill: { url: "https://example.com/jobs" },
    });
  });

  it.each(["hello world", "javascript:alert(1)", "x".repeat(5_000)])(
    "refuses %j as not an address",
    (text) => {
      expect(facade().recognize(text)).toEqual({ ok: false, reason: "not_an_address" });
    },
  );

  it("passes on single values as text and drops anything else", () => {
    const board = {
      id: "board",
      group: "jobs",
      title: { en: "Board", nl: "Bord" },
      summary: { en: "x", nl: "x" },
      collectorId: "feed-items",
      base: {},
      ask: ["url"],
      recognize: () => ({ url: "https://b.example/f", limit: 30, flag: true, nested: { a: 1 } }),
    } as AnyPreset;
    expect(
      facade({ presets: { all: () => [board], get: () => board } }).recognize("b.example"),
    ).toEqual({
      ok: true,
      presetId: "board",
      matched: true,
      prefill: { url: "https://b.example/f", limit: "30", flag: "true" },
    });
  });
});
```

In `src/server/api/routers/collectors.test.ts`:
- add `listPresets: vi.fn()` and `recognize: vi.fn()` to `h.facade`; in `beforeEach`: `h.facade.listPresets.mockReturnValue([{ id: "feed" }]);` and `h.facade.recognize.mockReturnValue({ ok: true, presetId: "custom-page", matched: false, prefill: { url: "https://e.com/" } });`
- add `["recognize", (c) => c.collectors.recognize({ address: "e.com" })]` to the "not found while the feature is off" table;
- replace the overview test with:

```ts
  it("overview combines collectors, presets, the last five runs, usage and the first-use flag", async () => {
    const result = await caller().collectors.overview({ locale: "nl" });
    expect(h.facade.listCollectors).toHaveBeenCalledWith("nl");
    expect(h.facade.listPresets).toHaveBeenCalledWith("nl");
    expect(h.facade.listRuns).toHaveBeenCalledWith("user-1", { limit: 5 });
    expect(h.facade.usage).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({
      collectors: [{ id: "feed-items" }],
      presets: [{ id: "feed" }],
      recentRuns: [run],
      usage: { runsToday: 1, runsPerDay: 20 },
      needsAcknowledgement: false,
    });
  });
```

- and add:

```ts
  it("recognises a pasted address through the facade", async () => {
    await expect(
      caller().collectors.recognize({ address: "e.com" }),
    ).resolves.toEqual({
      ok: true,
      presetId: "custom-page",
      matched: false,
      prefill: { url: "https://e.com/" },
    });
    expect(h.facade.recognize).toHaveBeenCalledWith("e.com");
  });

  it("refuses absurdly long text before it reaches the facade", async () => {
    await expect(
      caller().collectors.recognize({ address: "x".repeat(4_097) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(h.facade.recognize).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/collectors/runs.presets.test.ts src/server/api/routers/collectors.test.ts`
Expected: FAIL — `listPresets is not a function`, `recognize` missing on the router.

- [ ] **Step 3: Implement**

`src/server/collectors/runs.ts` — add imports:

```ts
import { parseAddress } from "@/lib/collectors/address";
import { recognizePreset } from "./presets/recognize";
import type { PresetGroup } from "./presets/preset";
```

Add types after `CollectorSummary`:

```ts
export type PresetSummary = {
  id: string;
  group: PresetGroup;
  title: string;
  summary: string;
  collectorId: string;
  /** The prototype input the start form pre-fills. */
  base: Record<string, unknown>;
  /** Fields shown up front, in this order; the rest sit behind "Show settings". */
  ask: string[];
  /** The collector's fields, with this preset's hints applied. */
  fields: CollectorSummary["fields"];
};

export type RecognizeResult =
  | {
      ok: true;
      presetId: string;
      /** False when nothing recognised the address (the Custom page). */
      matched: boolean;
      /** Input to pre-fill, as text for the start page's address. */
      prefill: Record<string, string>;
    }
  | { ok: false; reason: "not_an_address" | "no_preset" };

/** Field hints as the start form reads them, in the member's language. */
function fieldSummaries(
  hints: Record<string, FieldHint>,
  locale: "en" | "nl",
): CollectorSummary["fields"] {
  return Object.entries(hints).map(([name, hint]) => ({
    ...localiseHint(name, hint, locale),
    columns: hint.columns
      ? Object.entries(hint.columns).map(([column, columnHint]) =>
          localiseHint(column, columnHint, locale),
        )
      : null,
  }));
}

/** A recognised input as text; values that are not single values are dropped. */
function asPrefill(input: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(input).flatMap(([name, value]) =>
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
        ? [[name, String(value)]]
        : [],
    ),
  );
}
```

In `listCollectors`, replace the `fields: Object.entries(...).map(...)` expression with `fields: fieldSummaries(c.fieldHints as Record<string, FieldHint>, locale),`.

Inside `createCollectorRuns`, next to `resolveStart`:

```ts
  /** Presets whose collector is available (a switched-off collector hides them). */
  function availablePresets(): AnyPreset[] {
    return deps.presets
      .all()
      .filter((p) => deps.catalog.get(p.collectorId) !== undefined);
  }
```

(import `type AnyPreset` from `./presets/preset`). Add to the returned object, after `listCollectors`:

```ts
    listPresets(locale: "en" | "nl"): PresetSummary[] {
      return availablePresets().map((p) => {
        const collector = deps.catalog.get(p.collectorId)!;
        const hints = { ...(collector.fieldHints as Record<string, FieldHint>) };
        for (const [name, hint] of Object.entries(
          (p.hints ?? {}) as Record<string, FieldHint | undefined>,
        )) {
          if (hint) hints[name] = hint;
        }
        return {
          id: p.id,
          group: p.group,
          title: p.title[locale],
          summary: p.summary[locale],
          collectorId: p.collectorId,
          base: { ...(p.base as Record<string, unknown>) },
          ask: [...p.ask],
          fields: fieldSummaries(hints, locale),
        };
      });
    },

    /** Which preset a pasted address opens. Pure: sends nothing to the site. */
    recognize(text: string): RecognizeResult {
      const url = parseAddress(text);
      if (!url) return { ok: false, reason: "not_an_address" };
      const match = recognizePreset(url, availablePresets());
      if (!match) return { ok: false, reason: "no_preset" };
      return {
        ok: true,
        presetId: match.presetId,
        matched: match.matched,
        prefill: asPrefill(match.input),
      };
    },
```

`src/server/api/routers/collectors.ts`:

```ts
/** How many recent runs the landing shows. */
const RECENT_RUNS = 5;
```

In `overview`: `runs.listRuns(userId, { limit: RECENT_RUNS })` and return `presets: runs.listPresets(input.locale),` after `collectors`. Add the procedure:

```ts
  /** Which preset a pasted address opens. Never fetches the address. */
  recognize: protectedProcedure
    .input(z.object({ address: z.string().max(4_096) }))
    .query(({ input }) => facade().recognize(input.address)),
```

- [ ] **Step 4: Run tests**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/collectors src/server/api/routers/collectors.test.ts src/components/collectors && pnpm typecheck`
Expected: PASS (screens ignore the new `presets` field until Task 7).

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/server/collectors/runs.ts src/server/collectors/runs.presets.test.ts src/server/api/routers/collectors.ts src/server/api/routers/collectors.test.ts
git diff --cached --name-only
git commit -m "Collectors: list presets and recognise pasted links over tRPC"
```

---

### Task 5: Layout seam — the frame without the side panel for collectors

**Files:**
- Create: `src/components/dashboard/member-dashboard-frame.tsx` (+ `member-dashboard-frame.test.tsx`), `src/app/[locale]/dashboard/(member-wide)/layout.tsx` (+ `layout.test.tsx`), `src/app/[locale]/dashboard/(member)/layout.test.tsx`
- Move: `src/app/[locale]/dashboard/(member)/collectors/` → `src/app/[locale]/dashboard/(member-wide)/collectors/` (all four pages, unchanged)
- Modify: `src/app/[locale]/dashboard/(member)/layout.tsx`, `DESIGN.md` ("Page frame")

**Interfaces:**
- Produces: `MemberDashboardFrame({ name: string; children: React.ReactNode }): Promise<JSX.Element>` (async server component: greeting `h1`, `DashboardTabs`, then children in `mt-8`).

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/dashboard/member-dashboard-frame.test.tsx
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages: en, namespace: namespace as never }),
  };
});
vi.mock("@/server/collectors/flags", () => ({ collectorsEnabled: () => true }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => "/dashboard/collectors/runs",
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { MemberDashboardFrame } from "./member-dashboard-frame";

describe("MemberDashboardFrame", () => {
  it("greets the member, shows the tabs, then the content", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        {await MemberDashboardFrame({ name: "Ada", children: <p>Tab content</p> })}
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      en.dashboard.greeting.replace("{name}", "Ada"),
    );
    const tabs = screen.getByRole("navigation", { name: en.dashboard.tabsLabel });
    expect(
      screen.getByRole("link", { name: en.dashboard.tabs.collectors }),
    ).toHaveAttribute("aria-current", "page");
    expect(tabs).toBeInTheDocument();
    expect(screen.getByText("Tab content")).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
```

```tsx
// src/app/[locale]/dashboard/(member-wide)/layout.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/dashboard/require-dashboard-session", () => ({
  requireDashboardSession: async () => ({ user: { name: "", email: "ada@example.test" } }),
}));
vi.mock("@/components/dashboard/member-dashboard-frame", () => ({
  MemberDashboardFrame: ({ name, children }: { name: string; children: React.ReactNode }) => (
    <div data-testid="frame" data-name={name}>
      {children}
    </div>
  ),
}));

import MemberWideDashboardLayout from "./layout";

describe("member dashboard, full width", () => {
  it("uses the dashboard frame with no side panel", async () => {
    render(await MemberWideDashboardLayout({ children: <p>Workspace</p> }));
    expect(screen.getByTestId("frame")).toHaveAttribute("data-name", "ada@example.test");
    expect(screen.getByText("Workspace")).toBeInTheDocument();
    expect(screen.queryByRole("complementary")).toBeNull();
  });
});
```

```tsx
// src/app/[locale]/dashboard/(member)/layout.test.tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../../messages/en.json";

vi.mock("next-intl/server", async () => {
  const { createTranslator } = await import("next-intl");
  return {
    getTranslations: async (namespace: string) =>
      createTranslator({ locale: "en", messages: en, namespace: namespace as never }),
  };
});
vi.mock("@/server/dashboard/require-dashboard-session", () => ({
  requireDashboardSession: async () => ({
    user: { name: "Ada", email: "ada@example.test", image: null },
  }),
}));
vi.mock("@/components/dashboard/member-dashboard-frame", () => ({
  MemberDashboardFrame: ({ name, children }: { name: string; children: React.ReactNode }) => (
    <div data-testid="frame" data-name={name}>
      {children}
    </div>
  ),
}));
vi.mock("@/components/dashboard/side-panel/dashboard-side-panel", () => ({
  DashboardSidePanel: () => <p>Side panel</p>,
}));

import MemberDashboardLayout from "./layout";

describe("member dashboard", () => {
  it("keeps the side panel beside every other tab", async () => {
    render(await MemberDashboardLayout({ children: <p>Home</p> }));
    expect(screen.getByTestId("frame")).toHaveAttribute("data-name", "Ada");
    expect(
      screen.getByRole("complementary", { name: en.dashboard.sidePanelLabel }),
    ).toHaveTextContent("Side panel");
    expect(screen.getByText("Home")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/dashboard/member-dashboard-frame.test.tsx "src/app/[locale]/dashboard"`
Expected: FAIL — frame module and `(member-wide)/layout` missing; the `(member)` test fails because the layout does not use the frame.

- [ ] **Step 3: Implement**

```tsx
// src/components/dashboard/member-dashboard-frame.tsx
import { getTranslations } from "next-intl/server";

import { DashboardTabs } from "@/components/dashboard/dashboard-tabs";
import { collectorsEnabled } from "@/server/collectors/flags";

/**
 * The member dashboard frame, shared by its route groups: greeting (the
 * page's one h1), the tabs, then the group's content. `(member)` puts the
 * side panel beside its tabs; `(member-wide)` (the collector workspace) uses
 * the full width. Full width on the top nav's `px-4 sm:px-8` gutters — a
 * named exception to the default page frame (DESIGN.md "Page frame").
 */
export async function MemberDashboardFrame({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  const t = await getTranslations("dashboard");
  return (
    <div className="px-4 py-8 sm:px-8">
      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
        {t("greeting", { name })}
      </h1>

      <div className="mt-6">
        <DashboardTabs showCollectors={collectorsEnabled()} />
      </div>

      <div className="mt-8">{children}</div>
    </div>
  );
}
```

```tsx
// src/app/[locale]/dashboard/(member)/layout.tsx
import { getTranslations } from "next-intl/server";

import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";
import { getAvatarUrl } from "@/lib/avatar";
import { MemberDashboardFrame } from "@/components/dashboard/member-dashboard-frame";
import { DashboardSidePanel } from "@/components/dashboard/side-panel/dashboard-side-panel";

/**
 * The member dashboard tabs with the side panel: the shared frame, then the
 * tab's own content beside the panel. Pages render only their main column,
 * so no tab can drift from the frame. Collector pages use `(member-wide)`.
 */
export default async function MemberDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, t] = await Promise.all([
    requireDashboardSession(),
    getTranslations("dashboard"),
  ]);
  const user = session.user;
  const name = user.name || user.email;

  return (
    <MemberDashboardFrame name={name}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Not <main>: the root layout already provides the main landmark. */}
        <div className="min-w-0">{children}</div>
        <aside
          aria-label={t("sidePanelLabel")}
          className="lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-width:thin]"
        >
          <DashboardSidePanel
            fallbackName={name}
            avatarUrl={getAvatarUrl(user.email, user.image)}
          />
        </aside>
      </div>
    </MemberDashboardFrame>
  );
}
```

```tsx
// src/app/[locale]/dashboard/(member-wide)/layout.tsx
import { MemberDashboardFrame } from "@/components/dashboard/member-dashboard-frame";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

/**
 * Member dashboard tabs that need the full width (the data collectors
 * workspace): the same greeting and tabs, no side panel. A named exception
 * (DESIGN.md "Page frame").
 */
export default async function MemberWideDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireDashboardSession();
  const name = session.user.name || session.user.email;
  return <MemberDashboardFrame name={name}>{children}</MemberDashboardFrame>;
}
```

Move the routes (quote the brackets and parentheses):

```bash
mkdir -p "src/app/[locale]/dashboard/(member-wide)"
git mv "src/app/[locale]/dashboard/(member)/collectors" "src/app/[locale]/dashboard/(member-wide)/collectors"
```

`DESIGN.md` "Page frame": in the member dashboard bullet replace "the frame (`dashboard/(member)/layout.tsx`)" with "the frame (`MemberDashboardFrame`: greeting and tabs, used by `dashboard/(member)/layout.tsx` with the side panel)", and add after it:

```markdown
- **Named exception — the data collectors workspace (`/dashboard/collectors` and below):** the same `MemberDashboardFrame` without the side panel (`dashboard/(member-wide)/layout.tsx`), so the collector pages use the full width. Inside, one persistent left rail (`grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]`, sticky from `lg`): the paste box, presets by group, "Custom page" last, "My runs". Below `lg` the rail's list becomes a compact disclosure picker above the content. The right side has one heading and no breadcrumbs or section kickers; the rail's active entry is ink, never orange (the Start run button keeps the one orange).
```

Grep for other claims about the member frame and fix them: `grep -rn "(member)/layout" DESIGN.md PRODUCT.md docs/adr src --include=*.md --include=*.tsx`.

- [ ] **Step 4: Run tests**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/dashboard "src/app/[locale]/dashboard" src/components/collectors && pnpm typecheck && pnpm lint`
Expected: PASS. Confirm the old folder is gone: `ls "src/app/[locale]/dashboard/(member)"` shows no `collectors`.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/components/dashboard/member-dashboard-frame.tsx src/components/dashboard/member-dashboard-frame.test.tsx "src/app/[locale]/dashboard/(member)/layout.tsx" "src/app/[locale]/dashboard/(member)/layout.test.tsx" "src/app/[locale]/dashboard/(member-wide)/layout.tsx" "src/app/[locale]/dashboard/(member-wide)/layout.test.tsx" "src/app/[locale]/dashboard/(member)/collectors" "src/app/[locale]/dashboard/(member-wide)/collectors" DESIGN.md
git diff --cached --name-only   # the four moved pages show as renames
git commit -m "Collectors: full-width dashboard frame without the side panel"
```

---

### Task 6: Run names and preset form values

**Files:**
- Create: `src/lib/collectors/run-name.ts` (+ `run-name.test.ts`), `src/lib/collectors/preset-form.ts` (+ `preset-form.test.ts`), `src/components/collectors/use-run-namer.ts`
- Modify: `src/components/collectors/collectors-home.tsx` (drop its `runTarget`, import from lib), `collectors-home.test.tsx` (drop the `runTarget` describe — it moves), `collector-run.tsx`, `run-history.tsx` (import `runTarget` from `@/lib/collectors/run-name`)

**Interfaces:**
- Consumes: `presetIdForFormerId` (Task 1); `FormField`, `FieldValue`, `initialValue`, `newRow` from `form-fields.ts`; `PlacedProblems` from `input-problems.ts`.
- Produces:
  - `formatTarget(value: string): string`; `runTarget(input: unknown): string | null`; `mainInput(input: unknown, field: string | undefined): string | null`; `presetIdOfRun(run: { presetId: string | null; collectorId: string }): string | null`; `type RunName = { title: string; detail: string | null }`; `runName(run: { presetId: string | null; collectorId: string; input: unknown }, presets: readonly { id: string; title: string; ask: readonly string[] }[], collectorTitles: ReadonlyMap<string, string>): RunName`
  - `splitFields(fields: readonly FormField[], ask: readonly string[]): { asked: FormField[]; settings: FormField[] }`; `formValueOf(field: FormField, raw: unknown): FieldValue`; `presetInitialValues(fields: readonly FormField[], base: Record<string, unknown>, prefill: Record<string, string>): Record<string, FieldValue>`; `hasProblemIn(fields: readonly FormField[], placed: PlacedProblems): boolean`
  - `useRunNamer(): (run) => RunName` (reads `api.collectors.overview` for the member's locale)

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/collectors/run-name.test.ts
import { describe, expect, it } from "vitest";

import { mainInput, presetIdOfRun, runName, runTarget } from "./run-name";

const presets = [
  { id: "feed", title: "News or blog feed", ask: ["url"] },
  { id: "custom-page", title: "Custom page", ask: ["url", "itemSelector"] },
  { id: "hn", title: "Hacker News", ask: ["list"] },
];
const titles = new Map([
  ["feed-items", "Feed items"],
  ["job-board", "Job board"],
]);

describe("runTarget", () => {
  it("returns null for input that is not an object", () => {
    expect(runTarget(null)).toBeNull();
    expect(runTarget("https://example.com")).toBeNull();
  });
  it("returns null when no input value is a string", () => {
    expect(runTarget({ limit: 3 })).toBeNull();
  });
  it("shows only the host for a URL whose path is /", () => {
    expect(runTarget({ url: "https://example.com/" })).toBe("example.com");
  });
  it("shows host and path for a URL with a path", () => {
    expect(runTarget({ url: "https://example.com/blog/feed.xml" })).toBe(
      "example.com/blog/feed.xml",
    );
  });
  it("returns a non-URL string as it is", () => {
    expect(runTarget({ name: "acme" })).toBe("acme");
  });
});

describe("mainInput", () => {
  it("reads the named field as a label", () => {
    expect(mainInput({ url: "https://jobs.example.com/careers" }, "url")).toBe(
      "jobs.example.com/careers",
    );
    expect(mainInput({ limit: 30 }, "limit")).toBe("30");
    expect(mainInput({ name: "acme" }, "name")).toBe("acme");
  });
  it("is null for an empty, missing, list or inherited field", () => {
    expect(mainInput({ url: "  " }, "url")).toBeNull();
    expect(mainInput({}, "url")).toBeNull();
    expect(mainInput({ fields: [{ name: "a" }] }, "fields")).toBeNull();
    expect(mainInput({}, "constructor")).toBeNull();
    expect(mainInput({ url: "x" }, undefined)).toBeNull();
  });
});

describe("runName", () => {
  it("names a run by its preset and the preset's first asked input", () => {
    expect(
      runName(
        {
          presetId: "custom-page",
          collectorId: "page-list",
          input: { url: "https://jobs.example.com/careers", itemSelector: "li" },
        },
        presets,
        titles,
      ),
    ).toEqual({ title: "Custom page", detail: "jobs.example.com/careers" });
  });

  it("names a run from before presets by the preset that replaced its collector", () => {
    const run = { presetId: null, collectorId: "feed-items", input: { url: "https://example.com/feed.xml" } };
    expect(presetIdOfRun(run)).toBe("feed");
    expect(runName(run, presets, titles)).toEqual({
      title: "News or blog feed",
      detail: "example.com/feed.xml",
    });
  });

  it("falls back to the collector's title and first address when the preset is gone", () => {
    expect(
      runName(
        { presetId: "greenhouse-board", collectorId: "job-board", input: { board: "greenhouse", name: "acme" } },
        presets,
        titles,
      ),
    ).toEqual({ title: "Job board", detail: "greenhouse" });
  });

  it("uses the collector id only when nothing better is known", () => {
    expect(runName({ presetId: null, collectorId: "mystery", input: {} }, [], new Map())).toEqual({
      title: "mystery",
      detail: null,
    });
  });

  it("shows a number as the main input", () => {
    expect(runName({ presetId: "hn", collectorId: "hacker-news", input: { list: "top", limit: 30 } }, presets, titles))
      .toEqual({ title: "Hacker News", detail: "top" });
  });
});
```

```ts
// src/lib/collectors/preset-form.test.ts
import { describe, expect, it } from "vitest";

import type { FormField } from "./form-fields";
import { formValueOf, hasProblemIn, presetInitialValues, splitFields } from "./preset-form";

const base = { help: null, placeholder: null, required: false } as const;
const url: FormField = { ...base, name: "url", label: "Page address", kind: "url", required: true };
const item: FormField = { ...base, name: "itemSelector", label: "Item selector", kind: "text" };
const pages: FormField = { ...base, name: "maxPages", label: "Pages", kind: "number", integer: true };
const strict: FormField = { ...base, name: "strict", label: "Strict", kind: "checkbox" };
const columns: FormField = {
  ...base,
  name: "fields",
  label: "Columns",
  kind: "rows",
  min: 1,
  max: 20,
  columns: [
    { ...base, name: "name", label: "Name", kind: "text", required: true },
    { ...base, name: "selector", label: "Selector", kind: "text" },
  ],
};
const all = [url, item, columns, pages, strict];

describe("splitFields", () => {
  it("asks the preset's fields in its order and keeps the rest, in form order, as settings", () => {
    const { asked, settings } = splitFields(all, ["itemSelector", "url"]);
    expect(asked.map((f) => f.name)).toEqual(["itemSelector", "url"]);
    expect(settings.map((f) => f.name)).toEqual(["fields", "maxPages", "strict"]);
  });
  it("ignores asked names the form does not have", () => {
    expect(splitFields([url], ["url", "ghost"]).asked).toEqual([url]);
  });
});

describe("formValueOf", () => {
  it("turns stored values into what each field holds", () => {
    expect(formValueOf(url, "https://example.com")).toBe("https://example.com");
    expect(formValueOf(pages, 2)).toBe("2");
    expect(formValueOf(strict, true)).toBe(true);
    expect(formValueOf(strict, "true")).toBe(true);
    expect(formValueOf(strict, "false")).toBe(false);
    const rows = formValueOf(columns, [{ name: "title", selector: "h3" }, { name: "link" }]);
    expect(Array.isArray(rows) && rows.map((r) => r.cells)).toEqual([
      { name: "title", selector: "h3" },
      { name: "link" },
    ]);
  });
  it("starts a field empty when the value does not fit it", () => {
    expect(formValueOf(url, { a: 1 })).toBe("");
    expect(formValueOf(pages, null)).toBe("");
    const rows = formValueOf(columns, "title");
    expect(Array.isArray(rows) && rows.length).toBe(1);
  });
});

describe("presetInitialValues", () => {
  it("prefers the pasted value, then the preset's base, then empty", () => {
    const values = presetInitialValues(
      all,
      { url: "https://base.example/", itemSelector: "li.job", maxPages: 2 },
      { url: "https://pasted.example/jobs", bogus: "x" },
    );
    expect(values.url).toBe("https://pasted.example/jobs");
    expect(values.itemSelector).toBe("li.job");
    expect(values.maxPages).toBe("2");
    expect(values.strict).toBe(false);
    expect(values).not.toHaveProperty("bogus");
  });
  it("ignores inherited names", () => {
    expect(presetInitialValues([url], {}, {}).url).toBe("");
  });
});

describe("hasProblemIn", () => {
  it("sees a problem under a field or at one of its cells", () => {
    expect(hasProblemIn([item], { fields: { itemSelector: ["x"] }, cells: {} })).toBe(true);
    expect(hasProblemIn([columns], { fields: {}, cells: { fields: { "row-1": { name: ["x"] } } } })).toBe(true);
    expect(hasProblemIn([pages], { fields: { url: ["x"] }, cells: {} })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/collectors/run-name.test.ts src/lib/collectors/preset-form.test.ts`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

```ts
// src/lib/collectors/run-name.ts
import { presetIdForFormerId } from "@/server/collectors/presets/former-start-ids";

/** An address as a short label (host and path); any other text as it is. */
export function formatTarget(value: string): string {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}

/** A short, human label for what a run was pointed at: its first string input. */
export function runTarget(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const first = Object.values(input).find((v) => typeof v === "string");
  return typeof first === "string" ? formatTarget(first) : null;
}

/** One input field as a label, or null when it is empty or not a single value. */
export function mainInput(
  input: unknown,
  field: string | undefined,
): string | null {
  if (field === undefined || !input || typeof input !== "object") return null;
  if (!Object.hasOwn(input, field)) return null;
  const value = (input as Record<string, unknown>)[field];
  if (typeof value === "string") {
    return value.trim() ? formatTarget(value.trim()) : null;
  }
  return typeof value === "number" ? String(value) : null;
}

/** The preset a run came from; for a run from before presets, its replacement. */
export function presetIdOfRun(run: {
  presetId: string | null;
  collectorId: string;
}): string | null {
  return run.presetId ?? presetIdForFormerId(run.collectorId);
}

export type RunName = { title: string; detail: string | null };

type NamingPreset = { id: string; title: string; ask: readonly string[] };
type NamedRun = { presetId: string | null; collectorId: string; input: unknown };

/**
 * What a run is called on every screen: its preset's title and the preset's
 * main (first asked) input, e.g. "Greenhouse board · acme". A run whose
 * preset is gone falls back to its collector's title and first address.
 */
export function runName(
  run: NamedRun,
  presets: readonly NamingPreset[],
  collectorTitles: ReadonlyMap<string, string>,
): RunName {
  const presetId = presetIdOfRun(run);
  const preset = presets.find((p) => p.id === presetId);
  return {
    title:
      preset?.title ?? collectorTitles.get(run.collectorId) ?? run.collectorId,
    detail: mainInput(run.input, preset?.ask[0]) ?? runTarget(run.input),
  };
}
```

```ts
// src/lib/collectors/preset-form.ts
import {
  type FieldValue,
  type FormField,
  initialValue,
  newRow,
} from "./form-fields";
import type { PlacedProblems } from "./input-problems";

/**
 * A preset's fields split for the start page: the asked ones up front (in
 * the preset's order) and the rest behind "Show settings" (in form order).
 */
export function splitFields(
  fields: readonly FormField[],
  ask: readonly string[],
): { asked: FormField[]; settings: FormField[] } {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const asked = ask.flatMap((name) => {
    const field = byName.get(name);
    return field ? [field] : [];
  });
  const askedNames = new Set(asked.map((f) => f.name));
  return { asked, settings: fields.filter((f) => !askedNames.has(f.name)) };
}

/** A stored or pasted value as the form holds it; a value that does not fit starts empty. */
export function formValueOf(field: FormField, raw: unknown): FieldValue {
  switch (field.kind) {
    case "checkbox":
      return raw === true || raw === "true";
    case "rows": {
      if (!Array.isArray(raw)) return initialValue(field);
      const rows = raw
        .filter(
          (r): r is Record<string, unknown> => r !== null && typeof r === "object",
        )
        .map((r) => {
          const row = newRow();
          for (const column of field.columns) {
            const value = r[column.name];
            if (typeof value === "string" || typeof value === "number") {
              row.cells[column.name] = String(value);
            }
          }
          return row;
        });
      return rows.length > 0 ? rows : initialValue(field);
    }
    default:
      return typeof raw === "string" || typeof raw === "number"
        ? String(raw)
        : initialValue(field);
  }
}

/**
 * What each field holds when a preset's start page opens: the pasted value,
 * else the preset's own (Prototype: the member copies `base` and adjusts),
 * else empty. Only the preset's own field names are read.
 */
export function presetInitialValues(
  fields: readonly FormField[],
  base: Record<string, unknown>,
  prefill: Record<string, string>,
): Record<string, FieldValue> {
  return Object.fromEntries(
    fields.map((field) => {
      if (Object.hasOwn(prefill, field.name)) {
        return [field.name, formValueOf(field, prefill[field.name])];
      }
      if (Object.hasOwn(base, field.name)) {
        return [field.name, formValueOf(field, base[field.name])];
      }
      return [field.name, initialValue(field)];
    }),
  );
}

/** Whether the server placed a problem on any of these fields or their cells. */
export function hasProblemIn(
  fields: readonly FormField[],
  placed: PlacedProblems,
): boolean {
  return fields.some(
    (f) =>
      (placed.fields[f.name]?.length ?? 0) > 0 ||
      placed.cells[f.name] !== undefined,
  );
}
```

```ts
// src/components/collectors/use-run-namer.ts
"use client";

import * as React from "react";
import { useLocale } from "next-intl";

import { type RunName, runName } from "@/lib/collectors/run-name";
import { api } from "@/trpc/react";

type NamedRun = Parameters<typeof runName>[0];

/** Names runs from the overview's presets and collectors (one cached query). */
export function useRunNamer(): (run: NamedRun) => RunName {
  const locale = useLocale() === "nl" ? "nl" : "en";
  const overview = api.collectors.overview.useQuery({ locale });
  const presets = overview.data?.presets;
  const collectors = overview.data?.collectors;
  return React.useMemo(() => {
    const titles = new Map((collectors ?? []).map((c) => [c.id, c.title]));
    return (run: NamedRun) => runName(run, presets ?? [], titles);
  }, [presets, collectors]);
}
```

In `collectors-home.tsx` delete the exported `runTarget` function and add `import { runTarget } from "@/lib/collectors/run-name";`. In `collector-run.tsx` and `run-history.tsx` change `import { runTarget } from "@/components/collectors/collectors-home";` to `import { runTarget } from "@/lib/collectors/run-name";`. In `collectors-home.test.tsx` delete the `describe("runTarget", …)` block and `runTarget` from its import (those cases now live in `run-name.test.ts`).

- [ ] **Step 4: Run tests**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/collectors src/components/collectors && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/lib/collectors/run-name.ts src/lib/collectors/run-name.test.ts src/lib/collectors/preset-form.ts src/lib/collectors/preset-form.test.ts src/components/collectors/use-run-namer.ts src/components/collectors/collectors-home.tsx src/components/collectors/collectors-home.test.tsx src/components/collectors/collector-run.tsx src/components/collectors/run-history.tsx
git diff --cached --name-only
git commit -m "Collectors: run names from presets, and preset values for the start form"
```

---

### Task 7: The collector workspace — rail, paste box, narrow-screen picker

**Files:**
- Create: `src/components/collectors/collector-workspace.tsx` (+ `collector-workspace.test.tsx`), `src/components/collectors/paste-box.tsx` (+ `paste-box.test.tsx`), `src/app/[locale]/dashboard/(member-wide)/collectors/layout.tsx`
- Modify: `messages/en.json`, `messages/nl.json` (`collectors.workspace`)

**Interfaces:**
- Consumes: `api.collectors.overview` (`presets`, `usage`), `api.useUtils().collectors.recognize.fetch` (Task 4); `parseAddress` (Task 2); `startHref` (Task 2); `PRESET_GROUPS`, `PresetGroup` (Task 1); `SectionBody`, `statusFromQueries`; `COLLECTOR_ABOUT_PATH`.
- Produces:
  - `type WorkspaceEntry = { kind: "home" } | { kind: "runs" } | { kind: "preset"; presetId: string }`; `activeEntry(pathname: string): WorkspaceEntry`; `railGroups<P extends { group: PresetGroup }>(presets: readonly P[]): { group: PresetGroup; presets: P[] }[]`; `CollectorWorkspace({ children })`
  - `PasteBox({ focusOnShow: boolean })`

Copy to add under `collectors` — EN:

```json
"workspace": {
  "railLabel": "Sites to collect from",
  "group": { "jobs": "Jobs", "research": "Research" },
  "myRuns": "My runs",
  "picker": "Collect from:",
  "pickerNone": "Choose a site",
  "landing": "Pick a site from the list, or paste a link.",
  "latestRuns": "Your latest runs",
  "paste": {
    "label": "Paste a link",
    "help": "We'll open the right collector for it.",
    "submit": "Open link",
    "checking": "Checking the link…",
    "invalid": "This isn't a web address. Paste a full link, such as https://example.com/jobs.",
    "noPreset": "We can't collect from this address right now.",
    "failed": "We couldn't check this link. Try again."
  }
}
```

NL:

```json
"workspace": {
  "railLabel": "Sites om van te verzamelen",
  "group": { "jobs": "Vacatures", "research": "Onderzoek" },
  "myRuns": "Mijn runs",
  "picker": "Verzamel van:",
  "pickerNone": "Kies een site",
  "landing": "Kies een site uit de lijst, of plak een link.",
  "latestRuns": "Je laatste runs",
  "paste": {
    "label": "Plak een link",
    "help": "Wij openen er de juiste verzamelaar bij.",
    "submit": "Link openen",
    "checking": "Link controleren…",
    "invalid": "Dit is geen webadres. Plak een volledige link, zoals https://example.com/jobs.",
    "noPreset": "We kunnen op dit moment niet van dit adres verzamelen.",
    "failed": "We konden deze link niet controleren. Probeer het opnieuw."
  }
}
```

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/collectors/collector-workspace.test.tsx
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { COLLECTOR_ABOUT_PATH } from "@/server/collectors/identity";

import en from "../../../messages/en.json";

const h = vi.hoisted(() => ({
  overview: vi.fn(),
  fetch: vi.fn(),
  push: vi.fn(),
  pathname: "/dashboard/collectors",
}));

vi.mock("@/trpc/react", () => ({
  api: {
    collectors: { overview: { useQuery: h.overview } },
    useUtils: () => ({ collectors: { recognize: { fetch: h.fetch } } }),
  },
}));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => h.pathname,
  useRouter: () => ({ push: h.push }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { activeEntry, CollectorWorkspace, railGroups } from "./collector-workspace";

const preset = (id: string, group: "jobs" | "research" | "custom", title: string) => ({
  id,
  group,
  title,
  summary: "",
  collectorId: "x",
  base: {},
  ask: ["url"],
  fields: [],
});
const presets = [
  preset("feed", "research", "News or blog feed"),
  preset("custom-page", "custom", "Custom page"),
  preset("greenhouse-board", "jobs", "Greenhouse board"),
];

function renderWorkspace(pathname = "/dashboard/collectors") {
  h.pathname = pathname;
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <CollectorWorkspace>
        <p>Page content</p>
      </CollectorWorkspace>
    </NextIntlClientProvider>,
  );
}

const wide = () => within(document.querySelector<HTMLElement>('[data-slot="rail-wide"]')!);
const picker = () => document.querySelector<HTMLElement>('[data-slot="rail-picker"]')!;

beforeEach(() => {
  vi.clearAllMocks();
  h.overview.mockReturnValue({
    data: {
      collectors: [],
      presets,
      recentRuns: [],
      usage: { runsToday: 1, runsPerDay: 20 },
      needsAcknowledgement: false,
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
});

describe("activeEntry", () => {
  it.each([
    ["/dashboard/collectors", { kind: "home" }],
    ["/dashboard/collectors/runs", { kind: "runs" }],
    ["/dashboard/collectors/runs/abc", { kind: "runs" }],
    ["/dashboard/collectors/new/feed", { kind: "preset", presetId: "feed" }],
    ["/dashboard/collectors/new/a%20b", { kind: "preset", presetId: "a b" }],
    ["/dashboard/collectors/new/%E0%A4%A", { kind: "preset", presetId: "%E0%A4%A" }],
    ["/dashboard/collectors/elsewhere", { kind: "home" }],
  ])("reads %s", (pathname, entry) => {
    expect(activeEntry(pathname)).toEqual(entry);
  });
});

describe("railGroups", () => {
  it("orders jobs, research, then custom, and drops empty groups", () => {
    expect(railGroups(presets).map((g) => g.group)).toEqual(["jobs", "research", "custom"]);
    expect(railGroups(presets.slice(0, 2)).map((g) => g.group)).toEqual(["research", "custom"]);
  });
});

describe("CollectorWorkspace", () => {
  it("lists sites by group with Custom page last and My runs after it", () => {
    renderWorkspace();
    expect(wide().getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Greenhouse board",
      "News or blog feed",
      "Custom page",
      en.collectors.workspace.myRuns,
    ]);
    expect(wide().getByText(en.collectors.workspace.group.jobs)).toBeInTheDocument();
    expect(wide().getByText(en.collectors.workspace.group.research)).toBeInTheDocument();
    expect(wide().getByRole("link", { name: "Custom page" })).toHaveAttribute(
      "href",
      "/dashboard/collectors/new/custom-page",
    );
  });

  it("marks the open preset as the current page, and only that one", () => {
    renderWorkspace("/dashboard/collectors/new/feed");
    const current = wide()
      .getAllByRole("link")
      .filter((a) => a.getAttribute("aria-current") === "page");
    expect(current.map((a) => a.textContent)).toEqual(["News or blog feed"]);
  });

  it("marks My runs on a run page", () => {
    renderWorkspace("/dashboard/collectors/runs/abc");
    expect(wide().getByRole("link", { name: en.collectors.workspace.myRuns })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("names the open entry in the narrow-screen picker", () => {
    renderWorkspace("/dashboard/collectors/new/feed");
    expect(picker().tagName).toBe("DETAILS");
    expect(picker().querySelector("summary")).toHaveTextContent(
      `${en.collectors.workspace.picker} News or blog feed`,
    );
    expect(within(picker()).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Greenhouse board",
      "News or blog feed",
      "Custom page",
      en.collectors.workspace.myRuns,
    ]);
  });

  it("asks the member to choose in the picker on the landing", () => {
    renderWorkspace("/dashboard/collectors");
    expect(picker().querySelector("summary")).toHaveTextContent(
      en.collectors.workspace.pickerNone,
    );
  });

  it("shows the page beside the rail, with no breadcrumb or kicker", () => {
    renderWorkspace();
    expect(screen.getByText("Page content")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    expect(document.querySelector('[data-slot="section-label"]')).toBeNull();
  });

  it("shows the member's usage and how collecting works under the list", () => {
    renderWorkspace();
    expect(screen.getByText("1 of 20 runs used · last 24 hours")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: en.collectors.aboutLink })).toHaveAttribute(
      "href",
      COLLECTOR_ABOUT_PATH,
    );
  });

  it("offers a retry in the rail when the sites can't load", () => {
    const refetch = vi.fn();
    h.overview.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch });
    renderWorkspace();
    expect(wide().getByRole("alert")).toBeInTheDocument();
  });
});
```

```tsx
// src/components/collectors/paste-box.test.tsx
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

const h = vi.hoisted(() => ({ fetch: vi.fn(), push: vi.fn() }));

vi.mock("@/trpc/react", () => ({
  api: { useUtils: () => ({ collectors: { recognize: { fetch: h.fetch } } }) },
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ push: h.push }) }));

import { PasteBox } from "./paste-box";

const copy = en.collectors.workspace.paste;

function renderBox(focusOnShow = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <PasteBox focusOnShow={focusOnShow} />
    </NextIntlClientProvider>,
  );
}
const box = () => screen.getByRole("textbox", { name: copy.label });
const submit = () => fireEvent.click(screen.getByRole("button", { name: copy.submit }));

beforeEach(() => {
  vi.clearAllMocks();
  h.fetch.mockResolvedValue({
    ok: true,
    presetId: "custom-page",
    matched: false,
    prefill: { url: "https://example.com/jobs" },
  });
});

describe("PasteBox", () => {
  it("takes focus on the landing, and only there", () => {
    renderBox(true);
    expect(box()).toHaveFocus();
  });

  it("leaves focus alone elsewhere", () => {
    renderBox(false);
    expect(box()).not.toHaveFocus();
  });

  it("opens the Custom page with the address when nothing recognises it", async () => {
    renderBox();
    fireEvent.change(box(), { target: { value: "example.com/jobs" } });
    submit();
    expect(h.fetch).toHaveBeenCalledWith({ address: "example.com/jobs" });
    await waitFor(() =>
      expect(h.push).toHaveBeenCalledWith(
        "/dashboard/collectors/new/custom-page?url=https%3A%2F%2Fexample.com%2Fjobs",
      ),
    );
  });

  it("marks the start page as recognised when a preset matched", async () => {
    h.fetch.mockResolvedValue({ ok: true, presetId: "greenhouse-board", matched: true, prefill: { name: "acme" } });
    renderBox();
    fireEvent.change(box(), { target: { value: "https://boards.greenhouse.io/acme" } });
    submit();
    await waitFor(() =>
      expect(h.push).toHaveBeenCalledWith("/dashboard/collectors/new/greenhouse-board?name=acme&recognised=1"),
    );
  });

  it.each(["hello world", "javascript:alert(1)", "mailto:a@b.nl", "localhost:3000"])(
    "keeps %j in the box with a message, and asks nothing",
    (text) => {
      renderBox();
      fireEvent.change(box(), { target: { value: text } });
      submit();
      expect(screen.getByRole("alert")).toHaveTextContent(copy.invalid);
      expect(box()).toHaveAttribute("aria-invalid", "true");
      expect(box()).toHaveValue(text);
      expect(h.fetch).not.toHaveBeenCalled();
      expect(h.push).not.toHaveBeenCalled();
    },
  );

  it("starts as soon as a link is pasted into the empty box", async () => {
    renderBox();
    fireEvent.paste(box(), { clipboardData: { getData: () => "https://example.com/jobs" } });
    expect(h.fetch).toHaveBeenCalledWith({ address: "https://example.com/jobs" });
    await waitFor(() => expect(h.push).toHaveBeenCalled());
  });

  it("says when the address can't be collected right now", async () => {
    h.fetch.mockResolvedValue({ ok: false, reason: "no_preset" });
    renderBox();
    fireEvent.change(box(), { target: { value: "example.com" } });
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.noPreset);
    expect(h.push).not.toHaveBeenCalled();
  });

  it("says the check failed when the request fails, keeping the text", async () => {
    h.fetch.mockRejectedValue(new Error("network"));
    renderBox();
    fireEvent.change(box(), { target: { value: "example.com" } });
    submit();
    expect(await screen.findByRole("alert")).toHaveTextContent(copy.failed);
    expect(box()).toHaveValue("example.com");
  });

  it("asks once while a check is on its way", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    h.fetch.mockReturnValue(new Promise((r) => (resolve = r)));
    renderBox();
    fireEvent.change(box(), { target: { value: "example.com" } });
    submit();
    fireEvent.submit(box().closest("form")!);
    expect(h.fetch).toHaveBeenCalledOnce();
    expect(screen.getByText(copy.checking)).toBeInTheDocument();
    await act(async () => resolve({ ok: false, reason: "no_preset" }));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/collectors/collector-workspace.test.tsx src/components/collectors/paste-box.test.tsx`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement** (add the copy above to both catalogs first)

```tsx
// src/components/collectors/paste-box.tsx
"use client";

import * as React from "react";
import { ArrowRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { parseAddress } from "@/lib/collectors/address";
import { startHref } from "@/lib/collectors/start-address";
import { api } from "@/trpc/react";

type Problem = "invalid" | "noPreset" | "failed";

/** Not translated: an address looks the same in every language. */
const PLACEHOLDER = "https://example.com/jobs";

/**
 * The rail's paste box: an address in, the matching preset's start page out
 * (pre-filled). Text that is not an address never leaves the browser; the
 * server checks again and never fetches the address.
 */
export function PasteBox({ focusOnShow }: { focusOnShow: boolean }) {
  const t = useTranslations("collectors.workspace.paste");
  const router = useRouter();
  const utils = api.useUtils();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const pending = React.useRef(false);
  const [text, setText] = React.useState("");
  const [checking, setChecking] = React.useState(false);
  const [problem, setProblem] = React.useState<Problem | null>(null);
  const id = React.useId();

  React.useEffect(() => {
    if (focusOnShow) inputRef.current?.focus();
  }, [focusOnShow]);

  async function open(address: string) {
    if (pending.current) return;
    setProblem(null);
    if (!parseAddress(address)) {
      setProblem("invalid");
      return;
    }
    pending.current = true;
    setChecking(true);
    try {
      const result = await utils.collectors.recognize.fetch({ address });
      if (!result.ok) {
        setProblem(result.reason === "not_an_address" ? "invalid" : "noPreset");
        return;
      }
      setText("");
      router.push(
        startHref(result.presetId, {
          prefill: result.prefill,
          recognised: result.matched,
        }),
      );
    } catch {
      setProblem("failed");
    } finally {
      pending.current = false;
      setChecking(false);
    }
  }

  return (
    <form
      noValidate
      className="flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        void open(text);
      }}
    >
      <Label htmlFor={id}>{t("label")}</Label>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder={PLACEHOLDER}
          value={text}
          aria-invalid={problem === "invalid" || undefined}
          aria-describedby={problem ? `${id}-problem` : `${id}-help`}
          onChange={(e) => {
            setText(e.target.value);
            setProblem(null);
          }}
          onPaste={(e) => {
            const pasted = e.clipboardData.getData("text");
            // A paste into an empty box is the whole address: go at once.
            if (text.trim() === "" && pasted.trim() !== "") {
              e.preventDefault();
              setText(pasted);
              void open(pasted);
            }
          }}
        />
        <Button
          type="submit"
          variant="outline"
          size="icon"
          aria-label={t("submit")}
          disabled={checking}
        >
          <ArrowRightIcon aria-hidden="true" />
        </Button>
      </div>
      {problem ? (
        <p id={`${id}-problem`} role="alert" className="text-destructive text-[13px]">
          {t(problem)}
        </p>
      ) : (
        <p id={`${id}-help`} className="text-muted-foreground text-[13px]" aria-live="polite">
          {checking ? t("checking") : t("help")}
        </p>
      )}
    </form>
  );
}
```

```tsx
// src/components/collectors/collector-workspace.tsx
"use client";

import * as React from "react";
import { ChevronDownIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { PasteBox } from "@/components/collectors/paste-box";
import {
  SectionBody,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { Link, usePathname } from "@/i18n/navigation";
import { startHref } from "@/lib/collectors/start-address";
import { cn } from "@/lib/utils";
import { COLLECTOR_ABOUT_PATH } from "@/server/collectors/identity";
import {
  PRESET_GROUPS,
  type PresetGroup,
} from "@/server/collectors/presets/preset";
import { api, type RouterOutputs } from "@/trpc/react";

type Preset = RouterOutputs["collectors"]["overview"]["presets"][number];

export type WorkspaceEntry =
  | { kind: "home" }
  | { kind: "runs" }
  | { kind: "preset"; presetId: string };

const BASE = "/dashboard/collectors";

function decoded(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** Which rail entry a collector page belongs to. Run pages belong to My runs. */
export function activeEntry(pathname: string): WorkspaceEntry {
  const rest = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : "";
  if (rest === "/runs" || rest.startsWith("/runs/")) return { kind: "runs" };
  const start = /^\/new\/([^/]+)\/?$/.exec(rest);
  if (start) return { kind: "preset", presetId: decoded(start[1]!) };
  return { kind: "home" };
}

/** Presets by rail group, in rail order (custom last), empty groups left out. */
export function railGroups<P extends { group: PresetGroup }>(
  presets: readonly P[],
): { group: PresetGroup; presets: P[] }[] {
  return PRESET_GROUPS.map((group) => ({
    group,
    presets: presets.filter((p) => p.group === group),
  })).filter((g) => g.presets.length > 0);
}

function RailLink({
  href,
  current,
  children,
}: {
  href: string;
  current: boolean;
  children: React.ReactNode;
}) {
  // Active is ink plus weight and a bed (DESIGN.md: the Start run button
  // keeps the screen's one orange).
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={cn(
        "focus-visible:ring-ring/50 block rounded-md px-3 py-1.5 text-sm transition-colors outline-none focus-visible:ring-[3px]",
        current
          ? "bg-secondary text-foreground font-medium"
          : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}

function RailGroup({
  group,
  presets,
  active,
}: {
  group: PresetGroup;
  presets: Preset[];
  active: WorkspaceEntry;
}) {
  const t = useTranslations("collectors.workspace");
  const labelId = React.useId();
  const labelled = group !== "custom";
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        !labelled && "border-border border-t pt-3",
      )}
    >
      {labelled ? (
        <p id={labelId} className="text-muted-foreground px-3 text-xs font-medium">
          {/* The Custom page group has no label, so it has no message key. */}
          {t(`group.${group as Exclude<PresetGroup, "custom">}`)}
        </p>
      ) : null}
      <ul aria-labelledby={labelled ? labelId : undefined} className="flex flex-col gap-0.5">
        {presets.map((p) => (
          <li key={p.id}>
            <RailLink
              href={startHref(p.id)}
              current={active.kind === "preset" && active.presetId === p.id}
            >
              {p.title}
            </RailLink>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RailList({
  presets,
  active,
}: {
  presets: readonly Preset[];
  active: WorkspaceEntry;
}) {
  const t = useTranslations("collectors.workspace");
  return (
    <div className="flex flex-col gap-3">
      {railGroups(presets).map(({ group, presets: members }) => (
        <RailGroup key={group} group={group} presets={members} active={active} />
      ))}
      <div className="border-border border-t pt-3">
        <RailLink href={`${BASE}/runs`} current={active.kind === "runs"}>
          {t("myRuns")}
        </RailLink>
      </div>
    </div>
  );
}

/**
 * The collector workspace (spec "Collector workspace"): one persistent left
 * rail — paste box, presets by group, Custom page last, My runs — beside the
 * page. Mounted once by `collectors/layout.tsx`, so the rail keeps its state
 * while the member moves between pages. Below `lg` the list folds into a
 * disclosure picker above the page.
 */
export function CollectorWorkspace({ children }: { children: React.ReactNode }) {
  const t = useTranslations("collectors");
  const locale = useLocale() === "nl" ? "nl" : "en";
  const pathname = usePathname();
  const active = activeEntry(pathname);
  const overview = api.collectors.overview.useQuery({ locale });
  const presets = overview.data?.presets ?? [];
  const status = statusFromQueries(overview);
  const currentLabel =
    active.kind === "runs"
      ? t("workspace.myRuns")
      : active.kind === "preset"
        ? (presets.find((p) => p.id === active.presetId)?.title ??
          t("workspace.pickerNone"))
        : t("workspace.pickerNone");

  return (
    <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
        <PasteBox focusOnShow={active.kind === "home"} />

        <nav
          aria-label={t("workspace.railLabel")}
          data-slot="rail-wide"
          className="hidden lg:block"
        >
          <SectionBody status={status} size="compact">
            <RailList presets={presets} active={active} />
          </SectionBody>
        </nav>

        {/* Keyed by page, so it folds shut after each choice. */}
        <details
          key={pathname}
          data-slot="rail-picker"
          className="border-border rounded-md border lg:hidden"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
            <span className="min-w-0 truncate">
              <span className="text-muted-foreground">{t("workspace.picker")} </span>
              <span className="font-medium">{currentLabel}</span>
            </span>
            <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0" />
          </summary>
          <nav aria-label={t("workspace.railLabel")} className="border-border border-t p-2">
            <SectionBody status={status} size="compact">
              <RailList presets={presets} active={active} />
            </SectionBody>
          </nav>
        </details>

        {overview.data ? (
          <div className="border-border flex flex-col gap-1.5 border-t pt-3 text-[13px]">
            <span className="text-muted-foreground font-mono text-xs">
              {t("usage", {
                used: overview.data.usage.runsToday,
                limit: overview.data.usage.runsPerDay,
              })}
            </span>
            <Link
              href={COLLECTOR_ABOUT_PATH}
              className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              {t("aboutLink")}
            </Link>
          </div>
        ) : null}
      </div>

      <div className="min-w-0">{children}</div>
    </div>
  );
}
```

```tsx
// src/app/[locale]/dashboard/(member-wide)/collectors/layout.tsx
import { notFound } from "next/navigation";

import { CollectorWorkspace } from "@/components/collectors/collector-workspace";
import { collectorsEnabled } from "@/server/collectors/flags";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

/**
 * Every collector page sits in one workspace; the rail stays mounted while
 * the member moves between presets, My runs and runs. Pages keep their own
 * flag and session checks (layouts do not re-run on navigation).
 */
export default async function CollectorsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!collectorsEnabled()) notFound();
  await requireDashboardSession();
  return <CollectorWorkspace>{children}</CollectorWorkspace>;
}
```

- [ ] **Step 4: Run tests**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/collectors src/lib/collectors/collectors-messages.test.ts && node scripts/check-i18n-parity.mjs && pnpm typecheck && pnpm lint`
Expected: PASS. (The old pages still render their own breadcrumbs inside the workspace until Tasks 8–10.)

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/components/collectors/collector-workspace.tsx src/components/collectors/collector-workspace.test.tsx src/components/collectors/paste-box.tsx src/components/collectors/paste-box.test.tsx "src/app/[locale]/dashboard/(member-wide)/collectors/layout.tsx" messages/en.json messages/nl.json
git diff --cached --name-only
git commit -m "Collectors: workspace with a site rail and a paste box"
```

---

### Task 8: The collectors landing

**Files:**
- Create: `src/components/collectors/collectors-landing.tsx` (+ `collectors-landing.test.tsx`)
- Delete: `src/components/collectors/collectors-home.tsx`, `src/components/collectors/collectors-home.test.tsx`
- Modify: `src/app/[locale]/dashboard/(member-wide)/collectors/page.tsx`

**Interfaces:**
- Consumes: `api.collectors.overview` (`recentRuns`, last 5 — Task 4), `useRunNamer` (Task 6), `runListPollInterval`, `RunStatusBadge`, `RelativeTime`, `SectionBody`.
- Produces: `CollectorsLanding()`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/collectors/collectors-landing.test.tsx
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

const { overview } = vi.hoisted(() => ({ overview: vi.fn() }));

vi.mock("@/trpc/react", () => ({
  api: { collectors: { overview: { useQuery: overview } } },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { CollectorsLanding } from "./collectors-landing";

const run = {
  id: "run-1",
  collectorId: "feed-items",
  presetId: "feed",
  input: { url: "https://example.com/feed.xml" },
  status: "succeeded",
  stopReason: "complete",
  createdAt: "2026-10-04T10:00:00.000Z",
};

function withData(recentRuns: unknown[], extra: object = {}) {
  overview.mockReturnValue({
    data: {
      collectors: [{ id: "feed-items", title: "Feed items" }],
      presets: [{ id: "feed", title: "News or blog feed", ask: ["url"] }],
      recentRuns,
      usage: { runsToday: 0, runsPerDay: 20 },
      needsAcknowledgement: recentRuns.length === 0,
    },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
    ...extra,
  });
}

function renderLanding() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC" now={new Date("2026-10-04T12:00:00Z")}>
      <CollectorsLanding />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("CollectorsLanding", () => {
  it("says how to start as its one heading, with no kicker", () => {
    withData([]);
    renderLanding();
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
      en.collectors.workspace.landing,
    ]);
    expect(document.querySelector('[data-slot="section-label"]')).toBeNull();
  });

  it("shows only the line when there are no runs", () => {
    withData([]);
    renderLanding();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("lists the latest runs by name, with status and a link to each", () => {
    withData([run]);
    renderLanding();
    const list = screen.getByRole("list", { name: en.collectors.workspace.latestRuns });
    expect(list).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "News or blog feed · example.com/feed.xml" })).toHaveAttribute(
      "href",
      "/dashboard/collectors/runs/run-1",
    );
    expect(screen.getByText(en.collectors.status.finished)).toBeInTheDocument();
  });

  it("polls every 5 seconds while a listed run is active", () => {
    withData([{ ...run, status: "running", stopReason: null }]);
    renderLanding();
    const options = overview.mock.calls.find(([, o]) => o?.refetchInterval)![1] as {
      refetchInterval: (q: { state: { data: unknown } }) => number | false;
    };
    expect(options.refetchInterval({ state: { data: { recentRuns: [{ status: "running" }] } } })).toBe(5000);
    expect(options.refetchInterval({ state: { data: { recentRuns: [{ status: "failed" }] } } })).toBe(false);
  });

  it("keeps the line and stays quiet when the runs can't load", () => {
    overview.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch: vi.fn() });
    renderLanding();
    expect(screen.getByRole("heading", { name: en.collectors.workspace.landing })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/collectors/collectors-landing.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```tsx
// src/components/collectors/collectors-landing.tsx
"use client";

import { useLocale, useTranslations } from "next-intl";

import { RunStatusBadge } from "@/components/collectors/run-status-badge";
import { useRunNamer } from "@/components/collectors/use-run-namer";
import {
  SectionBody,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { RelativeTime } from "@/components/ui/relative-time";
import { Link } from "@/i18n/navigation";
import { runListPollInterval } from "@/lib/collectors/run-presentation";
import { api } from "@/trpc/react";

/**
 * `/dashboard/collectors` with no preset open: one line that says how to
 * start (the rail's paste box has focus) and the member's last runs. No runs
 * → only the line; the runs are supplementary, so a failed load hides them.
 */
export function CollectorsLanding() {
  const t = useTranslations("collectors");
  const locale = useLocale() === "nl" ? "nl" : "en";
  const overview = api.collectors.overview.useQuery(
    { locale },
    {
      refetchInterval: (query) =>
        runListPollInterval(query.state.data?.recentRuns),
    },
  );
  const nameOf = useRunNamer();
  const runs = overview.data?.recentRuns ?? [];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <h2 className="text-xl font-semibold tracking-tight text-balance">
        {t("workspace.landing")}
      </h2>
      <SectionBody
        status={statusFromQueries(overview, { isEmpty: runs.length === 0 })}
        optional
      >
        <ul
          aria-label={t("workspace.latestRuns")}
          className="divide-border border-border divide-y border-y"
        >
          {runs.map((run) => {
            const name = nameOf(run);
            return (
              <li key={run.id} className="flex flex-wrap items-center gap-3 py-3">
                <Link
                  href={`/dashboard/collectors/runs/${run.id}`}
                  className="min-w-0 flex-1 font-medium hover:underline"
                >
                  {name.title}
                  {name.detail ? (
                    <span className="text-muted-foreground font-mono text-xs">
                      {" "}
                      · {name.detail}
                    </span>
                  ) : null}
                </Link>
                <RunStatusBadge status={run.status} stopReason={run.stopReason} />
                <RelativeTime
                  date={run.createdAt}
                  className="text-muted-foreground w-28 text-right font-mono text-xs"
                />
              </li>
            );
          })}
        </ul>
      </SectionBody>
    </div>
  );
}
```

`src/app/[locale]/dashboard/(member-wide)/collectors/page.tsx`: import `CollectorsLanding` from `@/components/collectors/collectors-landing`, render `<CollectorsLanding />`, doc comment "Data collectors tab: the workspace with no site open." Then `git rm src/components/collectors/collectors-home.tsx src/components/collectors/collectors-home.test.tsx` and `grep -rn "collectors-home" src` → no hits.

- [ ] **Step 4: Run tests**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/collectors && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/components/collectors/collectors-landing.tsx src/components/collectors/collectors-landing.test.tsx "src/app/[locale]/dashboard/(member-wide)/collectors/page.tsx" src/components/collectors/collectors-home.tsx src/components/collectors/collectors-home.test.tsx
git diff --cached --name-only   # collectors-home.* show as deleted
git commit -m "Collectors: landing with the member's latest runs"
```

---

### Task 9: Start page by preset, with "Show settings" and old addresses redirected

**Files:**
- Move: `src/app/[locale]/dashboard/(member-wide)/collectors/new/[collectorId]/page.tsx` → `.../new/[presetId]/page.tsx`
- Create: `.../new/[presetId]/page.test.tsx`
- Modify: `src/i18n/navigation.ts`, `src/components/collectors/start-run-form.tsx` (rewrite), `src/components/collectors/start-run-form.test.tsx`, `src/server/api/routers/collectors.ts` (`start`), `src/server/api/routers/collectors.test.ts`, `messages/en.json`, `messages/nl.json` (`collectors.start`)

**Interfaces:**
- Consumes: `presetIdForFormerId` (Task 1), `readStartQuery`, `startHref` (Task 2), `StartRunArgs` (Task 3), `PresetSummary` via overview (Task 4), `splitFields`, `presetInitialValues`, `hasProblemIn`, `mainInput` (Task 6).
- Produces: `StartRunForm({ presetId: string; prefill: Record<string, string>; recognised: boolean })`; tRPC `collectors.start({ presetId, input, acknowledged })`; `permanentRedirect` exported from `@/i18n/navigation`.

Copy to add under `collectors.start` — EN: `"recognised": "Recognised as {name}."`, `"pickAnother": "Not right? Pick another."`, `"showSettings": "Show settings"`, `"hideSettings": "Hide settings"`. NL: `"recognised": "Herkend als {name}."`, `"pickAnother": "Klopt dit niet? Kies een andere."`, `"showSettings": "Toon instellingen"`, `"hideSettings": "Verberg instellingen"`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/app/[locale]/dashboard/(member-wide)/collectors/new/[presetId]/page.test.tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  enabled: true,
  redirect: vi.fn((): never => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn((): never => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/server/collectors/flags", () => ({ collectorsEnabled: () => h.enabled }));
vi.mock("@/server/dashboard/require-dashboard-session", () => ({
  requireDashboardSession: async () => ({ user: { id: "u" } }),
}));
vi.mock("next-intl/server", () => ({ getLocale: async () => "nl" }));
vi.mock("next/navigation", () => ({ notFound: h.notFound }));
vi.mock("@/i18n/navigation", () => ({ permanentRedirect: h.redirect }));
vi.mock("@/components/collectors/start-run-form", () => ({
  StartRunForm: (props: object) => <pre data-testid="form">{JSON.stringify(props)}</pre>,
}));

import StartCollectorRunPage from "./page";

const page = (presetId: string, query: Record<string, string | string[] | undefined> = {}) =>
  StartCollectorRunPage({
    params: Promise.resolve({ presetId }),
    searchParams: Promise.resolve(query),
  });

beforeEach(() => {
  vi.clearAllMocks();
  h.enabled = true;
});

describe("start page", () => {
  it.each([
    ["feed-items", "/dashboard/collectors/new/feed"],
    ["page-list", "/dashboard/collectors/new/custom-page?url=https%3A%2F%2Fe.com%2Fjobs"],
  ])("sends the old address /new/%s to its preset, keeping the query", async (former, href) => {
    const query = former === "page-list" ? { url: "https://e.com/jobs" } : {};
    await expect(page(former, query)).rejects.toThrow("NEXT_REDIRECT");
    expect(h.redirect).toHaveBeenCalledWith({ href, locale: "nl" });
  });

  it("opens the preset with the pasted values and the recognised mark", async () => {
    render(await page("feed", { url: ["https://e.com/feed.xml", "x"], recognised: "1" }));
    expect(JSON.parse(screen.getByTestId("form").textContent!)).toEqual({
      presetId: "feed",
      prefill: { url: "https://e.com/feed.xml" },
      recognised: true,
    });
  });

  it.each(["constructor", "__proto__", "nope"])("treats %j as an ordinary unknown preset", async (id) => {
    render(await page(id));
    expect(JSON.parse(screen.getByTestId("form").textContent!).presetId).toBe(id);
    expect(h.redirect).not.toHaveBeenCalled();
  });

  it("is not found while collectors are off", async () => {
    h.enabled = false;
    await expect(page("feed")).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
```

Rewrite the setup of `src/components/collectors/start-run-form.test.tsx`: keep the mocks, `feed`, `plain` and `pageList` fixtures as they are, and replace `overview` and `renderForm` with:

```tsx
import type { CollectorSummary, PresetSummary } from "@/server/collectors/runs";

const feedPreset: PresetSummary = {
  id: "feed",
  group: "research",
  title: "News or blog feed",
  summary: "The latest items of a feed.",
  collectorId: "feed-items",
  base: {},
  ask: ["url"],
  fields: feed.fields,
};
const customPagePreset: PresetSummary = {
  id: "custom-page",
  group: "custom",
  title: "Custom page",
  summary: "Any list on a web page.",
  collectorId: "page-list",
  base: {},
  ask: ["url", "itemSelector", "fields", "nextPageSelector", "maxPages"],
  fields: pageList.fields,
};
/** Asks only the address; its saved selectors sit behind "Show settings". */
const savedPage: PresetSummary = {
  ...customPagePreset,
  id: "saved-page",
  group: "research",
  title: "Saved page",
  summary: "A page we know.",
  ask: ["url"],
  base: { itemSelector: "li.job", fields: [{ name: "title", selector: "h3" }], maxPages: 2 },
};

function overview(
  needsAcknowledgement: boolean,
  collectors: CollectorSummary[] = [feed, pageList],
  presets: PresetSummary[] = [feedPreset, customPagePreset, savedPage],
) {
  const refetch = vi.fn();
  h.overview.mockReturnValue({
    data: {
      collectors,
      presets,
      recentRuns: [],
      usage: { runsToday: 0, runsPerDay: 20 },
      needsAcknowledgement,
    },
    isPending: false,
    isError: false,
    refetch,
  });
  return { refetch };
}

function form(presetId: string, prefill: Record<string, string> = {}, recognised = false) {
  return (
    <NextIntlClientProvider
      locale="en"
      messages={en}
      now={new Date("2026-10-03T12:00:00Z")}
      timeZone="UTC"
    >
      <StartRunForm presetId={presetId} prefill={prefill} recognised={recognised} />
    </NextIntlClientProvider>
  );
}

function renderForm(presetId = "feed", prefill: Record<string, string> = {}, recognised = false) {
  return render(form(presetId, prefill, recognised));
}
```

Then mechanically across the existing tests: `renderForm("page-list")` → `renderForm("custom-page")`; `overview(x, [pageList])` → `overview(x)`; every expected `mutate` payload `collectorId: "feed-items"` → `presetId: "feed"` and `collectorId: "page-list"` → `presetId: "custom-page"`; "shows a way back when the collector does not exist" renders `renderForm("nope")`; "shows an error instead of a broken form…" passes its unsupported collector and a preset pointing at it (`{ ...feedPreset, id: "odd", collectorId: <its id>, fields: <its fields> }`) and renders `renderForm("odd")`. Add these tests:

```tsx
  it("shows the preset's title as the one heading, with its summary and no breadcrumb or kicker", () => {
    overview(false);
    renderForm("feed");
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual(["News or blog feed"]);
    expect(screen.getByText("The latest items of a feed.")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    expect(document.querySelector('[data-slot="section-label"]')).toBeNull();
  });

  it("asks only the preset's fields up front and keeps the rest, pre-filled, behind Show settings", () => {
    overview(false);
    renderForm("saved-page");
    expect(screen.getByRole("textbox", { name: "Page address" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Item selector" })).toBeNull();
    const toggle = screen.getByRole("button", { name: en.collectors.start.showSettings });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: en.collectors.start.hideSettings })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("textbox", { name: "Item selector" })).toHaveValue("li.job");
    expect(screen.getByRole("spinbutton", { name: "Pages to read" })).toHaveValue(2);
  });

  it("has no Show settings when the preset asks for everything", () => {
    overview(false);
    renderForm("custom-page");
    expect(screen.queryByRole("button", { name: en.collectors.start.showSettings })).toBeNull();
  });

  it("sends the preset's settings with the member's answers while the settings stay closed", () => {
    overview(false);
    renderForm("saved-page");
    fireEvent.change(screen.getByRole("textbox", { name: "Page address" }), {
      target: { value: "https://jobs.example.com/" },
    });
    fireEvent.click(startButton());
    expect(h.mutate).toHaveBeenCalledWith({
      presetId: "saved-page",
      input: {
        url: "https://jobs.example.com/",
        itemSelector: "li.job",
        fields: [{ name: "title", selector: "h3" }],
        maxPages: 2,
      },
      acknowledged: false,
    });
  });

  it("opens the settings when the server refuses a value hidden there", () => {
    overview(false);
    renderForm("saved-page");
    fireEvent.click(startButton());
    act(() =>
      h.options.onSuccess!({
        ok: false,
        reason: "invalid_input",
        message: "x",
        fieldErrors: { itemSelector: ["selector_not_allowed/not_allowed"] },
      }),
    );
    expect(screen.getByRole("button", { name: en.collectors.start.hideSettings })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(en.collectors.start.problem.selector.not_allowed)).toBeVisible();
  });

  it("fills the fields from a pasted link and says what it recognised", () => {
    overview(false);
    renderForm("feed", { url: "https://example.com/feed.xml", bogus: "x" }, true);
    expect(screen.getByRole("textbox", { name: "Feed address" })).toHaveValue("https://example.com/feed.xml");
    expect(screen.getByText("Recognised as News or blog feed (example.com/feed.xml).", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: en.collectors.start.pickAnother })).toHaveAttribute("href", "/dashboard/collectors");
    fireEvent.click(startButton());
    expect(h.mutate).toHaveBeenCalledWith({
      presetId: "feed",
      input: { url: "https://example.com/feed.xml" },
      acknowledged: false,
    });
  });

  it("says nothing about recognising for a plain start", () => {
    overview(false);
    renderForm("custom-page", { url: "https://example.com/jobs" });
    expect(screen.queryByText(/Recognised as/)).toBeNull();
    expect(screen.getByRole("textbox", { name: "Page address" })).toHaveValue("https://example.com/jobs");
  });

  it("starts afresh when the member moves to another preset", () => {
    overview(false);
    const { rerender } = renderForm("feed");
    fireEvent.change(screen.getByRole("textbox", { name: "Feed address" }), {
      target: { value: "https://typed.example/feed" },
    });
    rerender(form("custom-page"));
    expect(screen.getByRole("textbox", { name: "Page address" })).toHaveValue("");
  });
```

(import `act` from `@testing-library/react`.)

`src/server/api/routers/collectors.test.ts`: in every `c.collectors.start({ collectorId: "feed-items", … })` call use `presetId: "feed"`, and every `startRun` expectation becomes `{ userId: "user-1", origin: "web", presetId: "feed", input }`.

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run "src/app/[locale]/dashboard/(member-wide)/collectors" src/components/collectors/start-run-form.test.tsx src/server/api/routers/collectors.test.ts`
Expected: FAIL — `./page` under `[presetId]` missing, `StartRunForm` has no `presetId`, router `start` refuses `presetId`.

- [ ] **Step 3: Implement**

`src/i18n/navigation.ts`:

```ts
export const {
  Link,
  redirect,
  permanentRedirect,
  usePathname,
  useRouter,
  getPathname,
} = createNavigation(routing);
```

Move and rewrite the page:

```bash
git mv "src/app/[locale]/dashboard/(member-wide)/collectors/new/[collectorId]" "src/app/[locale]/dashboard/(member-wide)/collectors/new/[presetId]"
```

```tsx
// src/app/[locale]/dashboard/(member-wide)/collectors/new/[presetId]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";

import { StartRunForm } from "@/components/collectors/start-run-form";
import { permanentRedirect } from "@/i18n/navigation";
import { readStartQuery, startHref } from "@/lib/collectors/start-address";
import { collectorsEnabled } from "@/server/collectors/flags";
import { presetIdForFormerId } from "@/server/collectors/presets/former-start-ids";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Start a run from one preset, pre-filled from the query (a pasted link).
 * Addresses from before presets named a collector (`/new/feed-items`); they
 * redirect permanently, query kept, to the preset that replaced it, so each
 * preset has one address.
 */
export default async function StartCollectorRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ presetId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!collectorsEnabled()) notFound();
  await requireDashboardSession();
  const [{ presetId }, query] = await Promise.all([params, searchParams]);
  const { prefill, recognised } = readStartQuery(query);
  const current = presetIdForFormerId(presetId);
  if (current) {
    permanentRedirect({
      href: startHref(current, { prefill, recognised }),
      locale: await getLocale(),
    });
  }
  return (
    <StartRunForm presetId={presetId} prefill={prefill} recognised={recognised} />
  );
}
```

`src/server/api/routers/collectors.ts` — `start`:

```ts
  start: protectedProcedure
    .input(
      z.object({
        presetId: z.string().min(1).max(64),
        input: z.unknown(),
        acknowledged: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const runs = facade();
      const userId = ctx.session.user.id;
      if (!input.acknowledged && (await isFirstTime(runs, userId))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "ACKNOWLEDGEMENT_REQUIRED",
        });
      }
      return runs.startRun({
        userId,
        origin: "web",
        presetId: input.presetId,
        input: input.input,
      });
    }),
```

`src/components/collectors/start-run-form.tsx` (full file):

```tsx
"use client";

import * as React from "react";
import { ChevronDownIcon, CircleAlertIcon, InfoIcon } from "lucide-react";
import { useFormatter, useLocale, useNow, useTranslations } from "next-intl";

import {
  FIELD_REJECTION_KEYS,
  FIELD_RENDERERS,
} from "@/components/collectors/field-renderers";
import {
  SectionBody,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import {
  coerceInput,
  type FieldValue,
  type FormField,
  formFieldsFor,
  initialValue,
} from "@/lib/collectors/form-fields";
import {
  type PlacedProblems,
  placeProblems,
  problemCopy,
} from "@/lib/collectors/input-problems";
import {
  hasProblemIn,
  presetInitialValues,
  splitFields,
} from "@/lib/collectors/preset-form";
import { mainInput } from "@/lib/collectors/run-name";
import { cn } from "@/lib/utils";
import { api, type RouterOutputs } from "@/trpc/react";

type StartResult = RouterOutputs["collectors"]["start"];
type QuotaReason = NonNullable<
  Extract<StartResult, { ok: false }>["quotaReason"]
>;

/**
 * Why the last start did not go through. Kept as data, not as a sentence, so
 * the message is written at render time (the relative "in 3 hours" stays
 * current while the member waits on the page).
 */
type Problem =
  | { kind: "fields" }
  | { kind: "quota"; reason: QuotaReason; retryAt: string | null }
  | { kind: "unavailable" }
  | { kind: "failed" };

function problemOf(result: Extract<StartResult, { ok: false }>): Problem {
  switch (result.reason) {
    case "invalid_input":
      return { kind: "fields" };
    case "quota":
      return {
        kind: "quota",
        reason: result.quotaReason ?? "platform_busy",
        retryAt: result.retryAt ?? null,
      };
    case "disabled":
    case "unknown_collector":
      return { kind: "unavailable" };
  }
}

const NO_FIELDS: FormField[] = [];
const NO_ASK: string[] = [];
const NO_BASE: Record<string, unknown> = {};

export type StartRunFormProps = {
  presetId: string;
  /** Values from a pasted link, by input field name. */
  prefill: Record<string, string>;
  /** The paste was recognised as this preset (not the Custom page fallback). */
  recognised: boolean;
};

/**
 * A preset's start page. Keyed by preset: the workspace layout stays mounted
 * and Next reuses this page between presets, so without the key typed values
 * would carry over to the next preset.
 */
export function StartRunForm(props: StartRunFormProps) {
  return <PresetStart key={props.presetId} {...props} />;
}

function PresetStart({ presetId, prefill, recognised }: StartRunFormProps) {
  const t = useTranslations("collectors");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const router = useRouter();
  const locale = useLocale() === "nl" ? "nl" : "en";
  const overview = api.collectors.overview.useQuery({ locale });
  const data = overview.data;
  const preset = data?.presets.find((p) => p.id === presetId);
  const collector = preset
    ? data?.collectors.find((c) => c.id === preset.collectorId)
    : undefined;
  const fields = React.useMemo(
    () =>
      preset && collector
        ? formFieldsFor({
            fields: preset.fields,
            inputJsonSchema: collector.inputJsonSchema,
          })
        : null,
    [preset, collector],
  );
  const formFields = fields?.ok ? fields.fields : NO_FIELDS;
  const ask = preset?.ask ?? NO_ASK;
  const base = preset?.base ?? NO_BASE;
  const { asked, settings } = React.useMemo(
    () => splitFields(formFields, ask),
    [formFields, ask],
  );
  // Made once per form: a rows field's starting rows carry ids, and new ids
  // on every render would remount their inputs.
  const initialValues = React.useMemo(
    () => presetInitialValues(formFields, base, prefill),
    [formFields, base, prefill],
  );

  const [values, setValues] = React.useState<Record<string, FieldValue>>({});
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [placed, setPlaced] = React.useState<PlacedProblems | null>(null);
  const [problem, setProblem] = React.useState<Problem | null>(null);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const settingsId = React.useId();
  // What the last start sent: the server names rows by their place in it.
  const sent = React.useRef<Record<string, FieldValue> | null>(null);

  const valueOf = (field: FormField): FieldValue =>
    values[field.name] ?? initialValues[field.name] ?? initialValue(field);
  const currentValues = () =>
    Object.fromEntries(formFields.map((f) => [f.name, valueOf(f)]));

  const start = api.collectors.start.useMutation({
    onSuccess: (result: StartResult) => {
      if (result.ok) {
        router.push(`/dashboard/collectors/runs/${result.runId}`);
        return;
      }
      const where = placeProblems(
        formFields,
        sent.current ?? currentValues(),
        result.fieldErrors ?? {},
      );
      setPlaced(where);
      // A refused value behind "Show settings" must not stay hidden.
      if (hasProblemIn(settings, where)) setSettingsOpen(true);
      setProblem(problemOf(result));
    },
    onError: (error) => {
      // The server saw no earlier run, but this screen did not ask for the
      // first-use note: reload so the note (and its checkbox) shows up.
      if (error.message === "ACKNOWLEDGEMENT_REQUIRED") void overview.refetch();
      setProblem({ kind: "failed" });
    },
  });

  const needsAck = data?.needsAcknowledgement ?? false;
  const runsPerDay = data?.usage.runsPerDay ?? 0;

  /** A server problem in words: its own, else the field's general note. */
  function problemWords(code: string | undefined, field: FormField) {
    if (code === undefined) return null;
    const copy = problemCopy(code);
    return copy
      ? t(copy.key, copy.values)
      : t(FIELD_REJECTION_KEYS[field.kind]);
  }

  function cellErrorsOf(field: FormField) {
    const rows = placed?.cells[field.name];
    if (!rows) return undefined;
    return Object.fromEntries(
      Object.entries(rows).map(([rowId, columns]) => [
        rowId,
        Object.fromEntries(
          Object.entries(columns).map(([column, codes]) => [
            column,
            problemWords(codes[0], field) ?? "",
          ]),
        ),
      ]),
    );
  }

  function problemMessage(p: Problem): string {
    switch (p.kind) {
      case "fields":
        return t("start.fixFields");
      case "quota":
        return p.reason === "daily_limit" && p.retryAt
          ? t("start.quota.daily_limit_retry", {
              limit: runsPerDay,
              when: format.relativeTime(new Date(p.retryAt), now),
            })
          : t(`start.quota.${p.reason}`, { limit: runsPerDay });
      case "unavailable":
        return t("start.notFound");
      case "failed":
        return t("start.failed");
    }
  }

  function renderField(field: FormField) {
    const Render = FIELD_RENDERERS[field.kind];
    return (
      <Render
        key={field.name}
        field={field}
        id={`field-${field.name}`}
        value={valueOf(field)}
        error={problemWords(placed?.fields[field.name]?.[0], field)}
        cellErrors={cellErrorsOf(field)}
        onChange={(v) => setValues((prev) => ({ ...prev, [field.name]: v }))}
      />
    );
  }

  const backToList = (
    <Button asChild variant="outline">
      <Link href="/dashboard/collectors">{t("start.backToList")}</Link>
    </Button>
  );

  const detail = preset ? mainInput(prefill, preset.ask[0]) : null;
  const recognisedName = preset
    ? detail
      ? `${preset.title} (${detail})`
      : preset.title
    : "";

  return (
    <SectionBody
      status={statusFromQueries(overview, { isEmpty: !preset || !collector })}
      empty={<EmptyState title={t("start.notFound")} action={backToList} />}
    >
      {!preset || !collector ? null : !fields?.ok ? (
        <EmptyState title={t("start.unsupported")} action={backToList} />
      ) : (
        <div className="flex max-w-3xl flex-col gap-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl font-semibold tracking-tight">
              {preset.title}
            </h2>
            <p className="text-muted-foreground max-w-prose text-[15px] leading-relaxed">
              {preset.summary}
            </p>
            {recognised ? (
              <p className="text-sm">
                {t("start.recognised", { name: recognisedName })}{" "}
                <Link
                  href="/dashboard/collectors"
                  className="font-medium underline underline-offset-4"
                >
                  {t("start.pickAnother")}
                </Link>
              </p>
            ) : null}
          </div>

          {needsAck ? (
            <section
              aria-labelledby="collectors-first-use"
              className="bg-sidebar border-border flex flex-col gap-3 rounded-xl border px-6 py-5"
            >
              <div className="flex items-center gap-2.5">
                <InfoIcon aria-hidden="true" className="text-info size-[18px]" />
                <h3
                  id="collectors-first-use"
                  className="text-[15px] font-semibold"
                >
                  {t("start.firstUseTitle")}
                </h3>
              </div>
              <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
                <li>{t("start.firstUse1")}</li>
                <li>{t("start.firstUse2")}</li>
                <li>{t("start.firstUse3")}</li>
                <li>{t("start.firstUse4")}</li>
              </ul>
              <div className="flex items-start gap-2.5 pt-1">
                <Checkbox
                  id="collectors-acknowledge"
                  tone="ink"
                  checked={acknowledged}
                  onCheckedChange={(c) => setAcknowledged(c === true)}
                />
                <Label
                  htmlFor="collectors-acknowledge"
                  className="text-sm font-normal"
                >
                  {t("start.acknowledge")}
                </Label>
              </div>
            </section>
          ) : null}

          <form
            noValidate
            className="border-border flex flex-col gap-5 rounded-xl border p-6 shadow-sm"
            onSubmit={(e) => {
              e.preventDefault();
              setPlaced(null);
              setProblem(null);
              sent.current = currentValues();
              start.mutate({
                presetId,
                input: coerceInput(formFields, sent.current),
                acknowledged,
              });
            }}
          >
            {asked.map(renderField)}

            {settings.length > 0 ? (
              <div className="flex flex-col gap-5">
                <div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-expanded={settingsOpen}
                    aria-controls={settingsId}
                    onClick={() => setSettingsOpen((open) => !open)}
                  >
                    <ChevronDownIcon
                      aria-hidden="true"
                      className={cn(
                        "transition-transform motion-reduce:transition-none",
                        settingsOpen && "rotate-180",
                      )}
                    />
                    {settingsOpen
                      ? t("start.hideSettings")
                      : t("start.showSettings")}
                  </Button>
                </div>
                <div
                  id={settingsId}
                  hidden={!settingsOpen}
                  className="flex flex-col gap-5"
                >
                  {settings.map(renderField)}
                </div>
              </div>
            ) : null}

            <p className="text-muted-foreground border-border border-t pt-4 font-mono text-xs">
              {t("start.limits", {
                items: format.number(collector.limits.maxItems),
                pages: collector.limits.maxPages,
                seconds: Math.round(collector.limits.maxDurationMs / 1000),
                perDay: runsPerDay,
              })}
            </p>

            {problem ? (
              <Alert variant="destructive">
                <CircleAlertIcon aria-hidden="true" />
                <AlertDescription>{problemMessage(problem)}</AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {/* The screen's one orange action (DESIGN.md One Voice Rule). */}
              <Button
                type="submit"
                disabled={start.isPending || (needsAck && !acknowledged)}
              >
                {start.isPending ? t("start.submitting") : t("start.submit")}
              </Button>
              <Button asChild variant="ghost">
                <Link href="/dashboard/collectors">{t("start.cancel")}</Link>
              </Button>
            </div>
          </form>
        </div>
      )}
    </SectionBody>
  );
}
```

Note: the first-use heading moved from `h4` to `h3` (the page heading is now `h2`). If an existing test looks it up by level, update the level. The "one heading" test runs with `needsAcknowledgement: false`.

- [ ] **Step 4: Run tests**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run "src/app/[locale]/dashboard" src/components/collectors src/server/api/routers/collectors.test.ts src/lib/collectors && node scripts/check-i18n-parity.mjs && pnpm typecheck && pnpm lint`
Expected: PASS. `grep -rn "collectorId=" src/components src/app` → no `StartRunForm collectorId` left.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/i18n/navigation.ts "src/app/[locale]/dashboard/(member-wide)/collectors/new" src/components/collectors/start-run-form.tsx src/components/collectors/start-run-form.test.tsx src/server/api/routers/collectors.ts src/server/api/routers/collectors.test.ts messages/en.json messages/nl.json
git diff --cached --name-only   # [collectorId]/page.tsx shows as renamed to [presetId]
git commit -m "Collectors: start every run from a preset, with settings behind a toggle"
```

---

### Task 10: My runs and the run page inside the workspace; remove dead copy

**Files:**
- Modify: `src/components/collectors/run-history.tsx` (+ test), `src/components/collectors/collector-run.tsx` (+ test), `messages/en.json`, `messages/nl.json`

**Interfaces:**
- Consumes: `useRunNamer` (Task 6), `SectionBody`, `statusFromQueries`.
- Produces: no new exports. `CollectorRun` heading = `h2` "<preset title> · <main input>"; `RunHistory` heading = `h2` "My runs".

- [ ] **Step 1: Write the failing tests**

In `collector-run.test.tsx`, make the default overview mock include `presets: [{ id: "feed", title: "News or blog feed", ask: ["url"] }]` and give the base run `presetId: "feed"`. Replace "leaves the current breadcrumb out until the run's title is known" with:

```tsx
  it("names the run by its preset and main input as the only heading, with no breadcrumb or kicker", () => {
    renderRun();
    expect(screen.getAllByRole("heading").map((h) => h.textContent)).toEqual([
      "News or blog feed · blog.example.org/feed.xml",
    ]);
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    expect(document.querySelector('[data-slot="section-label"]')).toBeNull();
  });

  it("names a run from before presets by the preset that replaced its collector", () => {
    h.run.mockReturnValue(ok({ ...base, presetId: null }));
    renderRun();
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("News or blog feed");
  });

  it("offers My runs when the run is gone", () => {
    h.run.mockReturnValue({ ...ok(undefined), isError: true, error: { data: { code: "NOT_FOUND" } } });
    renderRun();
    expect(screen.getByRole("link", { name: en.collectors.workspace.myRuns })).toHaveAttribute(
      "href",
      "/dashboard/collectors/runs",
    );
  });
```

In "shows a page-list run's member-chosen columns and its page address", add `presets: [{ id: "custom-page", title: "Custom page", ask: ["url", "itemSelector"] }]` to the overview, keep `presetId: null` on the run (a pre-presets run), and replace the last two expectations with:

```tsx
    expect(
      screen.getByRole("heading", { level: 2, name: "Custom page · jobs.example.com/careers" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("table", { name: en.collectors.run.rows })).toBeInTheDocument();
```

In `run-history.test.tsx`, add `presets: [{ id: "feed", title: "News or blog feed", ask: ["url"] }]` to the overview mock data, `presetId: "feed"` to the `run()` fixture, update "lists runs with status, rows and why they ended" to expect the link name `News or blog feed` and the detail `blog.example.org/feed.xml` under it, and add:

```tsx
  it("has My runs as its one heading, with no breadcrumb or kicker", () => {
    renderHistory();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      en.collectors.history.title,
    ]);
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    expect(document.querySelector('[data-slot="section-label"]')).toBeNull();
  });
```

The empty-state test now expects the button `en.collectors.history.chooseCollector` (new text below).

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/collectors/collector-run.test.tsx src/components/collectors/run-history.test.tsx`
Expected: FAIL — breadcrumbs and kickers still render; headings are `h3` collector titles.

- [ ] **Step 3: Implement**

`collector-run.tsx`:
- imports: drop `DashboardSection` (keep `SectionBody`, `statusFromQueries`), drop `runTarget`; add `import { useRunNamer } from "@/components/collectors/use-run-namer";`.
- in the component: `const nameOf = useRunNamer();` and drop `summary`'s use for the title (keep `summary` for `emptyRunHint`); `const name = data ? nameOf(data) : null;`; delete `title` and `target`.
- `runsLink` text: `t("workspace.myRuns")`.
- replace the returned JSX with:

```tsx
  return (
    <SectionBody status={statusFromQueries(run)}>
      {data && name ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="min-w-0 text-2xl font-semibold tracking-tight break-words">
                {name.title}
                {name.detail ? (
                  <span className="text-muted-foreground font-mono text-base font-normal break-all">
                    {" · "}
                    {name.detail}
                  </span>
                ) : null}
              </h2>
              <span role="status">
                <RunStatusBadge status={data.status} stopReason={data.stopReason} />
              </span>
            </div>
            <p className="text-muted-foreground font-mono text-xs">
              {t("run.started")} <RelativeTime date={data.createdAt} />
              {data.durationMs !== null ? (
                <>
                  {" · "}
                  {t("run.took", {
                    seconds: Math.max(1, Math.round(data.durationMs / 1000)),
                  })}
                </>
              ) : null}
              {" · "}
              {t("run.deleted")} <RelativeTime date={data.expiresAt} />
            </p>
          </div>

          <div className="border-border flex flex-col gap-1.5 rounded-xl border px-5 py-4">
            <p className="text-[15px] font-medium">{statusSentence(data)}</p>
            {detail ? (
              <p data-testid="failure-detail" className="text-sm">
                {detail}
              </p>
            ) : null}
            {active ? (
              <p className="text-muted-foreground text-sm">
                {t("run.collectingHelp")}
              </p>
            ) : null}
            <p className="text-muted-foreground mt-1 font-mono text-xs">
              {t("run.counts", {
                rows: data.itemCount,
                pages: data.pagesFetched,
                skipped: data.invalidItemCount,
              })}
            </p>
          </div>

          {data.itemCount > 0 ? (
            <div className="flex flex-col gap-3">
              {/* A file of a half-finished run would mislead: offer the
                  downloads once the run has ended. Two equal peers, so both
                  are ink (DESIGN.md One Voice Rule). */}
              {active ? null : (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button asChild variant="ink" size="sm">
                    <a href={`/api/collectors/runs/${runId}/export?format=csv`}>
                      {t("run.downloadCsv")}
                    </a>
                  </Button>
                  <Button asChild variant="ink" size="sm">
                    <a href={`/api/collectors/runs/${runId}/export?format=json`}>
                      {t("run.downloadJson")}
                    </a>
                  </Button>
                </div>
              )}
              <SectionBody status={statusFromQueries(items)}>
                <div className="border-border overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[640px] border-collapse text-[13px]">
                    <caption className="sr-only">{t("run.rows")}</caption>
                    <thead>
                      <tr>
                        {columns.map((c) => (
                          <th
                            key={c}
                            scope="col"
                            className="text-muted-foreground border-border border-b px-3 py-2.5 text-left font-mono text-xs font-medium whitespace-nowrap"
                          >
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={afterSeq + 1 + i}>
                          {columns.map((c) => (
                            <td
                              key={c}
                              className="border-border border-b px-3 py-2.5 align-top"
                            >
                              {cellText(row[c])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-muted-foreground font-mono text-xs">
                    {t("run.showing", {
                      from,
                      to: from + rows.length - 1,
                      total: data.itemCount,
                    })}
                  </span>
                  <div className="flex gap-2">
                    {pageStarts.length > 1 ? (
                      <Button variant="outline" size="sm" onClick={() => setPageStarts([-1])}>
                        {t("run.firstRows")}
                      </Button>
                    ) : null}
                    {nextSeq !== null ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageStarts((s) => [...s, nextSeq])}
                      >
                        {t("run.nextRows")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              </SectionBody>
            </div>
          ) : active ? (
            <div
              aria-hidden="true"
              className="border-border flex flex-col gap-2.5 rounded-lg border p-4"
            >
              <Skeleton className="h-3.5 w-3/5" />
              <Skeleton className="h-3.5 w-5/6" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          ) : (
            <div className="flex max-w-prose flex-col gap-1.5 text-sm">
              <p className="text-muted-foreground">{t("run.noRows")}</p>
              {emptyHint ? <p>{t(emptyHint)}</p> : null}
            </div>
          )}

          <details className="border-border border-t pt-3">
            <summary className="cursor-pointer text-[13px]">{t("run.log")}</summary>
            <pre className="bg-sidebar border-border mt-2.5 rounded-lg border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
              {data.log.length ? data.log.join("\n") : t("run.emptyLog")}
            </pre>
          </details>
        </div>
      ) : null}
    </SectionBody>
  );
```

`run-history.tsx`:
- imports: drop `DashboardSection`, `runTarget` and `useLocale`; add `import { useRunNamer } from "@/components/collectors/use-run-namer";` and `import type { RunName } from "@/lib/collectors/run-name";`.
- `RunHistory` (whole function; paging state and logic as today, `overview`/`titles` replaced by `nameOf`):

```tsx
export function RunHistory() {
  const t = useTranslations("collectors");
  const nameOf = useRunNamer();
  const first = api.collectors.runs.useQuery(
    { limit: PAGE },
    {
      refetchInterval: (query) => runListPollInterval(query.state.data?.runs),
    },
  );
  // Cursors of the older pages loaded so far, oldest last.
  const [cursors, setCursors] = React.useState<string[]>([]);
  // The last loaded page's next cursor; undefined while that page loads.
  const [tailNext, setTailNext] = React.useState<string | null | undefined>(
    undefined,
  );
  // Older pages are cut relative to the first page. When a new run lands on
  // top, the first page shifts and a run could fall between it and the
  // loaded older pages, so paging starts again from the new first page.
  const newestId = first.data?.runs[0]?.id;
  const [pagedFrom, setPagedFrom] = React.useState(newestId);
  if (newestId !== pagedFrom) {
    setPagedFrom(newestId);
    setCursors([]);
    setTailNext(undefined);
  }
  const ignore = React.useCallback(() => undefined, []);
  const nextCursor = cursors.length ? tailNext : first.data?.nextCursor;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-2xl font-semibold tracking-tight">
          {t("history.title")}
        </h2>
        <span className="text-muted-foreground text-xs">
          {t("history.retention")}
        </span>
      </div>
      <SectionBody
        status={statusFromQueries(first, {
          isEmpty: first.data?.runs.length === 0,
        })}
        empty={
          <EmptyState
            icon={<ListIcon aria-hidden="true" />}
            title={t("history.emptyTitle")}
            description={t("history.emptyText")}
            action={
              // The screen's one orange action (DESIGN.md One Voice Rule).
              <Button asChild>
                <Link href="/dashboard/collectors">
                  {t("history.chooseCollector")}
                </Link>
              </Button>
            }
          />
        }
      >
        <div className="border-border overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr>
                {COLUMNS.map((key) => (
                  <th
                    key={key}
                    scope="col"
                    className="text-muted-foreground border-border border-b px-3 py-2.5 text-left font-mono text-xs font-medium whitespace-nowrap"
                  >
                    {t(`history.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <HistoryRows runs={first.data?.runs ?? []} nameOf={nameOf} />
              {cursors.map((cursor, i) => (
                <HistoryPage
                  key={cursor}
                  cursor={cursor}
                  nameOf={nameOf}
                  onNext={i === cursors.length - 1 ? setTailNext : ignore}
                />
              ))}
            </tbody>
          </table>
        </div>
        {typeof nextCursor === "string" ? (
          <div className="flex justify-end pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCursors((s) => [...s, nextCursor]);
                setTailNext(undefined);
              }}
            >
              {t("history.older")}
            </Button>
          </div>
        ) : null}
      </SectionBody>
    </div>
  );
}
```

- `HistoryPage`: replace its `titles: Map<string, string>` prop with `nameOf: (run: Run) => RunName` and pass `nameOf={nameOf}` to its `HistoryRows`.
- `HistoryRows`: replace the `titles` prop with `nameOf: (run: Run) => RunName`; at the top of each row, replace `const target = runTarget(run.input);` with `const name = nameOf(run);`, and replace the first cell with:

```tsx
            <td className="border-border border-b px-3 py-2.5 align-middle">
              <Link
                href={`/dashboard/collectors/runs/${run.id}`}
                className="font-medium hover:underline"
              >
                {name.title}
              </Link>
              {name.detail ? (
                <div className="text-muted-foreground mt-0.5 font-mono text-xs break-all">
                  {name.detail}
                </div>
              ) : null}
            </td>
```

`useRunNamer` takes `{ presetId, collectorId, input }`; `RunView` (and so `Run`) has all three since Task 3.

Copy changes, EN / NL:
- `history.emptyText`: "Pick a site or paste a link, and your table shows up here." / "Kies een site of plak een link, en je tabel verschijnt hier."
- `history.chooseCollector`: "Choose a site" / "Kies een site"
- `history.collector`: "Run" / "Run"

Remove keys that no screen uses any more, in both catalogs, after confirming each has zero hits with `grep -rnE "t\(\"<key>\"|t\(\`<key>|\"collectors\.<key>" src` (and for nested groups `grep -rn "<group>\." src/components/collectors`): `title`, `intro`, `kind` (group), `youGive`, `youGet`, `exampleRow`, `useCollector`, `recentRuns`, `seeAllRuns`, `noRecentRuns`, `noRecentRunsHint`, `noCollectors`, `breadcrumb` (group), `run.input`. Keep `usage` and `aboutLink` (rail footer). If a key still has a hit, keep it and report it.

- [ ] **Step 4: Run tests**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/collectors src/lib/collectors && node scripts/check-i18n-parity.mjs && pnpm typecheck && pnpm lint`
Expected: PASS. `grep -rn "DashboardSection\|aria-label=\"Breadcrumb\"" src/components/collectors` → no hits outside tests.

- [ ] **Step 5: Commit**

```bash
git branch --show-current
git add src/components/collectors/collector-run.tsx src/components/collectors/collector-run.test.tsx src/components/collectors/run-history.tsx src/components/collectors/run-history.test.tsx messages/en.json messages/nl.json
git diff --cached --name-only
git commit -m "Collectors: My runs and run pages named by preset, without breadcrumbs"
```

---

### Task 11: Bring the spec in line

**Files:**
- Modify: `docs/superpowers/specs/2026-10-04-collector-presets-design.md`

- [ ] **Step 1: Edit the spec** (fix every old claim in place, not only by adding a section; `grep -n "text null\|on the left\|{ presetId, input }\|proposed" docs/superpowers/specs/2026-10-04-collector-presets-design.md` to find them):
  - Status: `proposed` → `accepted — Slice A planned in docs/superpowers/plans/2026-10-04-collector-presets-workspace.md`.
  - "Recognising a pasted link": the result is `{ presetId, input, matched }`; `matched` false for the Custom page fallback (no "Recognised as" line); null when the Custom page itself is unavailable (`COLLECTORS_DISABLED`), shown as "We can't collect from this address right now."; a recognizer that throws counts as no match; text without a scheme is read as `https://`; prefill travels as query parameters named after input fields plus `recognised=1`.
  - Concepts: the facade starts by preset (web) or by collector id (agent, `preset_id` null); the server does not merge `base` — the form pre-fills it.
  - Start page: former start addresses (`/new/feed-items`, `/new/page-list`) redirect permanently, query kept; the same frozen map names runs from before presets.
  - Landing line: "Pick a site from the list, or paste a link."; the rail footer holds the usage line and the "How our collector visits sites" link; the run page marks "My runs" active.
  - Data: `collector_run.preset_id varchar(64) null` (like `collector_id`).
- [ ] **Step 2: Commit**

```bash
git branch --show-current
git add docs/superpowers/specs/2026-10-04-collector-presets-design.md
git commit -m "docs: collector presets spec matches the Slice A decisions"
```

---

### Task 12: Verification

- [ ] **Step 1: Check for parallel work.** `git fetch origin`; `git log --oneline origin/main -10`; `gh pr list --state open`; `git ls-tree --name-only origin/main src/migrations/ | grep 20261004` and `grep -rn "preset" $(git diff --name-only origin/main...HEAD -- src) | head` — if another session shipped presets, a `20261004a` migration or a `(member-wide)` group, stop and report.
- [ ] **Step 2:** `git status --short` → empty (only the untracked `.superpowers/brainstorm/` that is not ours may show; nothing staged or modified).
- [ ] **Step 3:** `pnpm check` → PASS (lint + `tsc --noEmit`). `node scripts/check-i18n-parity.mjs` → OK.
- [ ] **Step 4:** `SKIP_ENV_VALIDATION=1 pnpm test` → the full suite PASS (every workspace the diff touches: `src/server`, `src/lib`, `src/components`, `src/app`).
- [ ] **Step 5: DB.** With the DB prefix from Global Constraints: first `pnpm vitest run src/migrations/collector-run-preset.integration.test.ts` (it must PASS, not skip), then `pnpm vitest run src/server/collectors src/migrations` → PASS, none skipped.
- [ ] **Step 6: Node 20.** `SKIP_ENV_VALIDATION=1 npx -y node@20 node_modules/vitest/vitest.mjs run src/lib/collectors src/components/collectors src/components/dashboard src/server/collectors/presets src/server/collectors/runs.presets.test.ts src/server/api/routers/collectors.test.ts "src/app/[locale]/dashboard"` → PASS. (If a test passes on 26 and fails only on 20, reproduce with `npx -y node@20` before changing anything.)
- [ ] **Step 7: Manual look (optional, local test database only).** Never `pnpm dev` against `.env`. If the owner wants to see the screens, prepare the exact command with `DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test FEATURE_COLLECTORS=on` and let the owner run it; check the rail at desktop and phone width, the picker, the paste flow, "Show settings", an old `/new/page-list` address, and a run page.
- [ ] **Step 8:** Report every command with its output summary. Do not push.

## Self-review

- **Spec coverage (Slice A):** preset model + catalog with `feed` and `custom-page` (Task 1); `recognizePreset` seam with Custom page fallback (Task 2); `collectors.recognize` query (Task 4); layout seam, `MemberDashboardFrame`, `(member-wide)` group, DESIGN.md exception (Task 5); workspace rail with paste box, groups, Custom page last, My runs, narrow picker (Task 7); landing with the line and last 5 runs, paste box focused (Tasks 7, 8); start page `new/[presetId]` with `ask` up front, "Show settings", limits line, one orange Start (Task 9); paste flow and "Recognised as … Not right? Pick another." (Tasks 7, 9); My runs and run page without breadcrumbs/kickers, run heading = preset title + main input (Task 10); `preset_id` migration and recording `presetId` on start (Task 3); EN + NL copy (Tasks 7, 9, 10); old addresses (Task 9). Slices B and C are out of scope.
- **Review Focus owners:** 1 → Task 9 ("opens the settings when the server refuses a value hidden there"); 2 → Tasks 1 and 9 (former-id and page tests); 3 → Tasks 2, 4, 7 (address, facade, paste box tests); 4 → Task 9 ("starts afresh when the member moves to another preset"); 5 → Tasks 6 and 10 (run-name and run page tests).
- **Type consistency:** `PresetSummary` (Task 4) is what `overview.presets` returns and what the workspace, landing, start form and `useRunNamer` read; `StartRunArgs` (Task 3) is what the router sends in Task 9; `RecognizeResult.prefill` is `Record<string, string>`, matching `startHref`'s `prefill`; `WorkspaceEntry`/`activeEntry` live only in `collector-workspace.tsx`.
