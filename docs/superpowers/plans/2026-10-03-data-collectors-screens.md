# Data Collectors — Slice 2: Member Screens and About Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give members the four data-collector screens in their dashboard (collectors list, start a run, run page, run history), a CSV/JSON download, and the public "about our collector" page for site owners — all on top of the slice 1 engine and still behind `FEATURE_COLLECTORS`.

**Architecture:** A thin tRPC router (`collectors`) adapts the slice 1 `CollectorRuns` facade to the web; it adds no rules of its own except the feature gate and the first-use acknowledgement. Screens are client components that follow the dashboard's existing data-state shell (`DashboardSection`, `statusFromQueries`). The start form is rendered from each collector's JSON input schema through a small field-kind registry (Strategy), so adding a collector needs no UI code; a later collector that needs a new kind of field adds one renderer. Status and stop-reason wording come from one pure presentation module, so every screen says the same thing. Downloads stream from a route handler.

**Tech Stack:** Next.js 15 App Router, tRPC (`@/trpc/react`), next-intl (EN + NL), Tailwind with the design tokens, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-03-data-collectors-design.md` (sections "Surfaces", "Feature flag and kill switches"), ADR-0040, and the approved mockups (canvas "Data collectors — screens", https://claude.ai/artifact/3LYdqqD6WB4BLHJ6RhCuyS). Read the spec and `DESIGN.md` before Task 1.

## Global Constraints

- Branch: `feat/data-collectors-screens`, started from `feat/data-collectors-core` (slice 1, PR #420). After #420 merges, rebase onto `origin/main`. Every commit step starts with `git branch --show-current` (must print `feat/data-collectors-screens`). Never `git checkout`/`git switch`/`git stash`/`git add -A`/`git add .`. No AI-credit lines in commits or PRs.
- Design system (DESIGN.md, binding): Signal Orange only on the one most important action per screen — **Start run** (start form) and **Choose a collector** (empty history). Equal peer actions (Download CSV / Download JSON) use the `ink` button variant. Status badges use the semantic `success` / `info` / `warning` / `destructive` Badge variants and always carry an icon plus a label. Collector kind is a categorical attribute → `outline` badge, never a status colour. Geist Mono only for labels, stats, ids, timestamps, URLs and the log. Section headings use `DashboardSection` / `SectionLabel`. No raw Tailwind palette colours, no hex.
- Data states (DESIGN.md No-Silent-Failure Rule): every query renders loading (`Skeleton`), error (`ErrorState` with retry) and empty (`EmptyState` that teaches the next action) explicitly.
- Auth (Gate-Before-Fail Rule): every dashboard page calls `requireDashboardSession()` itself; pages are member-only; every procedure is `protectedProcedure`.
- Feature gate: one flag only — the server env `FEATURE_COLLECTORS` (`collectorsEnabled()` in `src/server/collectors/flags.ts`). The dashboard layout passes it to the tab bar; pages call `notFound()` when it is off; every `collectors.*` procedure throws `NOT_FOUND` with message `COLLECTORS_OFF`; the download route answers 404. No `NEXT_PUBLIC_` flag (spec updated in Task 9).
- All member-facing copy lives in `messages/en.json` and `messages/nl.json` (namespaces `collectors` and `collectorsAbout`, plus `dashboard.tabs.collectors`). Collector titles, descriptions and field labels come translated from the catalog via `listCollectors(locale)`. Server English messages from the facade (`StartRunResult.message`) are never shown; the UI maps reason codes to its own strings.
- Routes: `/dashboard/collectors` (list), `/dashboard/collectors/new/[collectorId]` (start), `/dashboard/collectors/runs` (history), `/dashboard/collectors/runs/[runId]` (run), `/api/collectors/runs/[runId]/export?format=csv|json` (download), `/collectors/about` (public).
- Polling: the run page refetches every 3 000 ms while the run is `queued` or `running`, and stops when it ends.
- Opt-out contact on the about page: `info@klevox.com` (the address the privacy and terms pages already use).
- Never run `pnpm build`; never point anything at `.env`'s `DATABASE_URL` (production). This slice needs no database tests; unit tests mock the facade.
- Unit test command prefix: `SKIP_ENV_VALIDATION=1 pnpm vitest run`.

## Review Focus

1. **Feature off** → the tab is absent, every collectors page is a 404, every `collectors.*` procedure is `NOT_FOUND`, and the download route is 404. Tests owned by Tasks 2, 3 and 7.
2. **A member opens another member's run id** (page or download) → "run not found", never another member's data. Tests owned by Tasks 5 and 7.
3. **The quota refuses a start** → a plain, translated message saying which limit and, for the daily limit, when they can start again; the typed input stays in the form. Test owned by Task 4.
4. **A run finishes while its page is open** → polling stops; it does not poll forever. Test owned by Task 5.
5. **A collector whose input has a field kind the form cannot draw** → the start screen shows an error state instead of a broken form, and every collector in the catalog is drawable. Tests owned by Task 4.

---

## File map

| File | Responsibility |
|---|---|
| `src/server/collectors/quota.ts`, `runs.ts` (modify) | expose usage count; carry the quota sub-reason |
| `src/server/collectors/identity.ts` (new) + `context/live.ts` (modify) | user-agent constants shared by the worker and the about page |
| `src/server/api/routers/collectors.ts` + `root.ts` (modify) | tRPC adapter over the facade |
| `src/lib/collectors/run-presentation.ts` | status → badge tone, icon, label key; stop reason → sentence key |
| `src/lib/collectors/form-fields.ts` | JSON input schema → drawable fields; value coercion |
| `src/components/collectors/field-renderers.tsx` | field-kind registry (Strategy) |
| `src/components/collectors/run-status-badge.tsx` | one status badge for every screen |
| `src/components/collectors/collectors-home.tsx` | list + recent runs |
| `src/components/collectors/start-run-form.tsx` | start screen |
| `src/components/collectors/collector-run.tsx` | run page |
| `src/components/collectors/run-history.tsx` | history |
| `src/components/dashboard/dashboard-tabs.tsx` (modify), `src/app/[locale]/dashboard/(member)/layout.tsx` (modify) | gated tab |
| `src/app/[locale]/dashboard/(member)/collectors/**/page.tsx` | four thin pages |
| `src/app/api/collectors/runs/[runId]/export/route.ts` | streaming download |
| `src/app/[locale]/collectors/about/page.tsx`, `src/app/sitemap.ts` (modify) | public page |
| `messages/en.json`, `messages/nl.json` (modify) | copy |

---

### Task 1: Facade additions, presentation model, and copy

**Files:**
- Modify: `src/server/collectors/quota.ts`, `src/server/collectors/runs.ts`, `src/server/collectors/collectors.integration.test.ts`
- Create: `src/lib/collectors/run-presentation.ts`, `src/lib/collectors/run-presentation.test.ts`, `src/lib/collectors/collectors-messages.test.ts`
- Modify: `messages/en.json`, `messages/nl.json`

**Interfaces:**
- Produces:
  - `countRunsInWindow(db: CollectorDb, userId: string, now: Date): Promise<number>` (quota.ts)
  - `CollectorRuns.usage(userId: string): Promise<{ runsToday: number; runsPerDay: number }>`
  - `StartRunResult` quota refusals gain `quotaReason: "daily_limit" | "active_limit" | "platform_busy"`
  - `type BadgeTone = "info" | "success" | "warning" | "destructive"`; `presentRun(run: { status: RunStatus; stopReason: StopReason | null }): { tone: BadgeTone; label: RunLabel; stop: StopReason | null }` where `RunLabel = "queued" | "running" | "finished" | "partial" | "failed"`; `isRunActive(status: RunStatus): boolean`
  - message keys under `collectors.*` (listed in Step 3)

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/collectors/run-presentation.test.ts
import { describe, expect, it } from "vitest";
import { isRunActive, presentRun } from "./run-presentation";

describe("presentRun", () => {
  it.each([
    [{ status: "queued", stopReason: null }, { tone: "info", label: "queued", stop: null }],
    [{ status: "running", stopReason: null }, { tone: "info", label: "running", stop: null }],
    [{ status: "succeeded", stopReason: "complete" }, { tone: "success", label: "finished", stop: "complete" }],
    [{ status: "succeeded", stopReason: "page_limit" }, { tone: "warning", label: "partial", stop: "page_limit" }],
    [{ status: "succeeded", stopReason: "item_limit" }, { tone: "warning", label: "partial", stop: "item_limit" }],
    [{ status: "succeeded", stopReason: "time_limit" }, { tone: "warning", label: "partial", stop: "time_limit" }],
    [{ status: "failed", stopReason: "robots_disallowed" }, { tone: "destructive", label: "failed", stop: "robots_disallowed" }],
    [{ status: "failed", stopReason: null }, { tone: "destructive", label: "failed", stop: null }],
  ] as const)("%o → %o", (run, expected) => {
    expect(presentRun(run)).toEqual(expected);
  });

  it("knows which runs are still active", () => {
    expect(isRunActive("queued")).toBe(true);
    expect(isRunActive("running")).toBe(true);
    expect(isRunActive("succeeded")).toBe(false);
    expect(isRunActive("failed")).toBe(false);
  });
});
```

```ts
// src/lib/collectors/collectors-messages.test.ts
import { describe, expect, it } from "vitest";

import en from "../../../messages/en.json";
import nl from "../../../messages/nl.json";

function keyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  return Object.entries(value).flatMap(([k, v]) =>
    keyPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

const STOP_REASONS = [
  "complete", "page_limit", "item_limit", "time_limit", "site_refused",
  "robots_disallowed", "robots_unreachable", "blocked_domain", "error", "worker_lost",
] as const;

describe("collectors copy", () => {
  it.each(["collectors", "collectorsAbout"] as const)(
    "%s has the same keys in English and Dutch",
    (ns) => {
      expect(keyPaths(nl[ns]).sort()).toEqual(keyPaths(en[ns]).sort());
    },
  );

  it("has the dashboard tab label in both languages", () => {
    expect(en.dashboard.tabs.collectors).toBeTruthy();
    expect(nl.dashboard.tabs.collectors).toBeTruthy();
  });

  it("words every stop reason", () => {
    for (const reason of STOP_REASONS) {
      expect(en.collectors.stop[reason], reason).toBeTruthy();
      expect(nl.collectors.stop[reason], reason).toBeTruthy();
    }
  });
});
```

Add to `src/server/collectors/collectors.integration.test.ts`, inside the existing `describe("canStartRun")` block:

```ts
    it("counts this member's runs in the rolling 24 hours", async () => {
      const userId = await makeUser();
      const other = await makeUser();
      await insertRun(userId, { createdAt: new Date(now.getTime() - 60_000) });
      await insertRun(userId, { createdAt: new Date(now.getTime() - 25 * 3_600_000) });
      await insertRun(other, { createdAt: now });
      expect(await m.quota.countRunsInWindow(m.db, userId, now)).toBe(1);
    });
```

and inside the existing `describe("CollectorRuns")` block:

```ts
    it("reports usage and names the quota limit that refused a start", async () => {
      const userId = await makeUser();
      const { runs } = facade({ quota: { runsPerDay: 20, activePerUser: 1, activePlatform: 1_000 } });
      expect(await runs.usage(userId)).toEqual({ runsToday: 0, runsPerDay: 20 });
      await runs.startRun({ userId, origin: "web", collectorId: "feed-items", input: feedInput });
      expect(await runs.usage(userId)).toEqual({ runsToday: 1, runsPerDay: 20 });
      const refused = await runs.startRun({ userId, origin: "web", collectorId: "feed-items", input: feedInput });
      expect(refused).toMatchObject({ ok: false, reason: "quota", quotaReason: "active_limit" });
    });
```

(The `facade()` helper's fixed clock is `2026-10-03T12:00:00Z`; runs it starts are created at that instant, inside the window.)

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/collectors`
Expected: FAIL — `./run-presentation` not found; copy keys missing.
Run: `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm vitest run src/server/collectors/collectors.integration.test.ts`
Expected: FAIL — `countRunsInWindow` / `usage` / `quotaReason` missing. A skipped suite is a setup failure.

- [ ] **Step 3: Implement**

In `src/server/collectors/quota.ts`, add (and use it inside `canStartRun` for the `recent` count so the window rule lives in one place):

```ts
/** This member's runs created in the rolling 24-hour window. */
export async function countRunsInWindow(
  db: CollectorDb,
  userId: string,
  now: Date,
): Promise<number> {
  const since = new Date(now.getTime() - DAY_MS);
  const [row] = await db
    .select({ n: count() })
    .from(collectorRuns)
    .where(and(eq(collectorRuns.userId, userId), gt(collectorRuns.createdAt, since)));
  return row?.n ?? 0;
}
```

In `src/server/collectors/runs.ts`:
- Extend the quota member of `StartRunResult`:

```ts
  | {
      ok: false;
      reason: "disabled" | "unknown_collector" | "invalid_input" | "quota";
      message: string;
      fieldErrors?: Record<string, string[]>;
      /** Quota only: which limit refused the start. */
      quotaReason?: "daily_limit" | "active_limit" | "platform_busy";
      /** Quota only: when a new start will be allowed (ISO 8601), if known. */
      retryAt?: string;
    };
```

- In `startRun`, the quota refusal returns `quotaReason: decision.reason` alongside the existing fields.
- Add to the returned facade object:

```ts
    async usage(userId: string): Promise<{ runsToday: number; runsPerDay: number }> {
      return {
        runsToday: await countRunsInWindow(db, userId, deps.now()),
        runsPerDay: quota.runsPerDay,
      };
    },
```

```ts
// src/lib/collectors/run-presentation.ts
import type { RunStatus, StopReason } from "@/server/collectors/run-status";

export type BadgeTone = "info" | "success" | "warning" | "destructive";
export type RunLabel = "queued" | "running" | "finished" | "partial" | "failed";

const PARTIAL: ReadonlySet<StopReason> = new Set(["page_limit", "item_limit", "time_limit"]);

/**
 * How a run looks on every screen: badge tone, its label, and which stop
 * sentence explains it. One place, so the list, the run page and the history
 * never disagree. Tones are the semantic status tokens (DESIGN.md).
 */
export function presentRun(run: {
  status: RunStatus;
  stopReason: StopReason | null;
}): { tone: BadgeTone; label: RunLabel; stop: StopReason | null } {
  const stop = run.stopReason;
  switch (run.status) {
    case "queued":
      return { tone: "info", label: "queued", stop };
    case "running":
      return { tone: "info", label: "running", stop };
    case "failed":
      return { tone: "destructive", label: "failed", stop };
    case "succeeded":
      return stop && PARTIAL.has(stop)
        ? { tone: "warning", label: "partial", stop }
        : { tone: "success", label: "finished", stop };
  }
}

export function isRunActive(status: RunStatus): boolean {
  return status === "queued" || status === "running";
}
```

(`run-status.ts` holds only types and a pure table, so importing it into client code pulls in no server modules. `import type` keeps it type-only.)

Add `"collectors": "Data collectors"` to `dashboard.tabs` in `messages/en.json` and `"collectors": "Dataverzamelaars"` in `messages/nl.json`. Add these two top-level namespaces to both files (EN shown; NL is the full Dutch translation of every value, same keys):

```json
"collectors": {
  "title": "Data collectors",
  "intro": "Collect public data from the web for your own research. Pick a collector, fill in a few fields, and get a table you can read here or download.",
  "aboutLink": "How our collector visits sites",
  "usage": "{used} of {limit} runs used · last 24 hours",
  "kind": { "api": "API", "feed": "Feed", "page": "Web page" },
  "youGive": "You give: {fields}",
  "youGet": "You get: up to {count, plural, one {# row} other {# rows}}",
  "exampleRow": "Example row",
  "useCollector": "Use this collector",
  "recentRuns": "Recent runs",
  "seeAllRuns": "See all runs",
  "noRecentRuns": "Your runs will show up here.",
  "noCollectors": "No collectors are available right now.",
  "status": { "queued": "Queued", "running": "Running", "finished": "Finished", "partial": "Partial", "failed": "Failed" },
  "stop": {
    "complete": "Finished: the collector read everything it was asked to.",
    "page_limit": "Partial: stopped at the page limit.",
    "item_limit": "Partial: stopped at the row limit.",
    "time_limit": "Partial: stopped at the time limit.",
    "site_refused": "Failed: the site asked us to slow down several times, so we stopped.",
    "robots_disallowed": "Failed: this site's robots.txt does not allow collecting this page.",
    "robots_unreachable": "Failed: we could not read this site's robots.txt, so we did not collect from it.",
    "blocked_domain": "Failed: this site has asked not to be collected.",
    "error": "Failed: something went wrong while collecting.",
    "worker_lost": "Failed: the run was interrupted twice, so it was stopped."
  },
  "stopShort": {
    "complete": "Read everything",
    "page_limit": "Stopped at the page limit",
    "item_limit": "Stopped at the row limit",
    "time_limit": "Stopped at the time limit",
    "site_refused": "The site refused",
    "robots_disallowed": "Not allowed by robots.txt",
    "robots_unreachable": "robots.txt could not be read",
    "blocked_domain": "Site opted out",
    "error": "Something went wrong",
    "worker_lost": "Interrupted"
  },
  "breadcrumb": { "collectors": "Data collectors", "runs": "My runs" },
  "start": {
    "firstUseTitle": "Before your first run",
    "firstUse1": "Use what you collect for your own research.",
    "firstUse2": "Respect each site's terms. We follow robots.txt and visit each site at most once a second.",
    "firstUse3": "Avoid collecting personal details about people.",
    "firstUse4": "Only you can see your runs. We delete them after 30 days.",
    "acknowledge": "I understand, and I'll use collected data responsibly.",
    "limits": "Up to {items} rows · {pages, plural, one {# page} other {# pages}} · stops after {seconds, plural, one {# second} other {# seconds}} · uses 1 of your {perDay} runs per 24 hours",
    "submit": "Start run",
    "submitting": "Starting…",
    "cancel": "Cancel",
    "notFound": "This collector does not exist or is switched off.",
    "backToList": "Back to collectors",
    "unsupported": "This collector can't be started from here yet.",
    "fixFields": "Some fields need attention.",
    "invalidField": "Check this field.",
    "quota": {
      "daily_limit": "You've used all {limit} runs for the last 24 hours.",
      "daily_limit_retry": "You've used all {limit} runs for the last 24 hours. You can start again {when}.",
      "active_limit": "You already have runs in progress. Wait for one to finish.",
      "platform_busy": "Data collectors are busy right now. Try again in a few minutes."
    },
    "failed": "We couldn't start the run. Try again."
  },
  "run": {
    "notFound": "We couldn't find this run. It may have been deleted after 30 days.",
    "started": "Started",
    "took": "took {seconds, plural, one {# second} other {# seconds}}",
    "deleted": "Deleted",
    "input": "Input",
    "counts": "{rows, plural, one {# row} other {# rows}} · {pages, plural, one {# page} other {# pages}} fetched · {skipped, plural, one {# row} other {# rows}} skipped",
    "collecting": "Collecting…",
    "collectingHelp": "This page updates by itself. You can leave; the run keeps going.",
    "waiting": "Waiting for a free collector…",
    "rows": "Rows",
    "noRows": "No rows were collected.",
    "showing": "Showing {from}–{to} of {total}",
    "nextRows": "Next rows",
    "firstRows": "First rows",
    "downloadCsv": "Download CSV",
    "downloadJson": "Download JSON",
    "log": "Run log",
    "emptyLog": "Nothing logged."
  },
  "history": {
    "title": "My runs",
    "retention": "Runs are deleted after 30 days",
    "collector": "Collector",
    "started": "Started",
    "status": "Status",
    "rows": "Rows",
    "why": "Why it ended",
    "deleted": "Deleted",
    "older": "Older runs",
    "emptyTitle": "No runs yet",
    "emptyText": "Pick a collector, give it an address, and your table shows up here.",
    "chooseCollector": "Choose a collector"
  }
},
"collectorsAbout": {
  "metaTitle": "About our data collector",
  "metaDescription": "What the AIT Community data collector is, how it behaves, and how to block it.",
  "lastUpdated": "2026.10.03",
  "name": "Name",
  "nameText": "aitcom-collector — the AIT Community data collector",
  "description": "Description",
  "descriptionText1": "AIT Community is a non-profit community for people who build with AI. Our members use the data collector to gather public information for their own research, such as the posts of a feed or the repositories of an open-source organization.",
  "descriptionText2": "If you saw this address in your server logs, one of our members asked us to read a public page on your site.",
  "behaves": "How it behaves",
  "behaves1": "It reads your robots.txt first and follows it.",
  "behaves2": "It visits each site at most once a second, counting all our members together.",
  "behaves3": "When your site asks it to slow down (429 or 503), it waits, and it stops after the third time.",
  "behaves4": "It only reads public pages over https. It never logs in and never fills in forms.",
  "behaves5": "It always tells you who it is (see below).",
  "userAgent": "User agent",
  "blocking": "Blocking it",
  "blockingText": "Add this to your robots.txt to keep the collector away from your whole site:",
  "blockingPartial": "You can also block only part of your site, for example <example></example>.",
  "optOut": "Opting out",
  "optOutText": "Prefer that we never visit your domain? Email <email></email> with your domain name. We add it to our block list, which also covers its subdomains."
}
```

Dutch values for `collectors.stop.*`, `collectors.status.*` and the about page must be real translations, not English copies. ICU plural syntax stays identical in both files.

- [ ] **Step 4: Run tests**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/collectors` → PASS.
Run the DB command from Step 2 → PASS (suite executed). Then `pnpm typecheck` and `node scripts/check-i18n-parity.mjs` → no errors.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/data-collectors-screens
git add src/server/collectors/quota.ts src/server/collectors/runs.ts src/server/collectors/collectors.integration.test.ts src/lib/collectors/run-presentation.ts src/lib/collectors/run-presentation.test.ts src/lib/collectors/collectors-messages.test.ts messages/en.json messages/nl.json
git commit -m "Collectors: usage count, named quota reasons, one presentation model, EN/NL copy"
```

---

### Task 2: The `collectors` tRPC router

**Files:**
- Create: `src/server/api/routers/collectors.ts`, `src/server/api/routers/collectors.test.ts`
- Modify: `src/server/api/root.ts`

**Interfaces:**
- Consumes: `liveCollectorRuns()` (`@/server/collectors/live`), `collectorsEnabled()` (`@/server/collectors/flags`), facade types `RunView`, `CollectorSummary`, `StartRunResult`.
- Produces (all `protectedProcedure`; all throw `NOT_FOUND` `COLLECTORS_OFF` when the flag is off):
  - `collectors.overview` query `{ locale: "en" | "nl" }` → `{ collectors: CollectorSummary[]; recentRuns: RunView[]; usage: { runsToday: number; runsPerDay: number }; needsAcknowledgement: boolean }`
  - `collectors.start` mutation `{ collectorId: string; input: unknown; acknowledged: boolean }` → `StartRunResult` (never throws for `invalid_input` / `quota` / `unknown_collector`; throws `BAD_REQUEST` `ACKNOWLEDGEMENT_REQUIRED` when a first-time member did not acknowledge)
  - `collectors.run` query `{ runId: string }` → `RunView` (throws `NOT_FOUND` `RUN_NOT_FOUND`)
  - `collectors.runs` query `{ cursor?: string; limit?: number }` → `{ runs: RunView[]; nextCursor: string | null }`
  - `collectors.items` query `{ runId: string; afterSeq?: number; limit?: number }` → `{ items: Record<string, unknown>[]; nextSeq: number | null }` (throws `NOT_FOUND` `RUN_NOT_FOUND`)

"First-time member" = no run in their history (`listRuns(userId, { limit: 1 })` is empty). Runs expire after 30 days, so a member who has been away that long sees the note again — intended.

- [ ] **Step 1: Write the failing tests**

```ts
// src/server/api/routers/collectors.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  enabled: true,
  facade: {
    listCollectors: vi.fn(),
    listRuns: vi.fn(),
    usage: vi.fn(),
    startRun: vi.fn(),
    getRun: vi.fn(),
    listItems: vi.fn(),
  },
}));

vi.mock("@/server/collectors/flags", () => ({ collectorsEnabled: () => h.enabled }));
vi.mock("@/server/collectors/live", () => ({ liveCollectorRuns: () => h.facade }));
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/better-auth", () => ({ auth: { api: { getSession: async () => null } } }));
vi.mock("@/server/payload", () => ({ getPayloadClient: vi.fn() }));

import { createCaller } from "@/server/api/root";

function caller(userId: string | null = "user-1") {
  return createCaller({
    db: {},
    session: userId ? ({ user: { id: userId } } as never) : null,
    headers: new Headers(),
  } as never);
}

const run = { id: "run-1", status: "running", stopReason: null };

beforeEach(() => {
  vi.clearAllMocks();
  h.enabled = true;
  h.facade.listCollectors.mockReturnValue([{ id: "feed-items" }]);
  h.facade.listRuns.mockResolvedValue({ runs: [run], nextCursor: null });
  h.facade.usage.mockResolvedValue({ runsToday: 1, runsPerDay: 20 });
  h.facade.startRun.mockResolvedValue({ ok: true, runId: "run-2" });
  h.facade.getRun.mockResolvedValue(run);
  h.facade.listItems.mockResolvedValue({ items: [], nextSeq: null });
});

describe("collectors router", () => {
  it("requires a signed-in member", async () => {
    await expect(caller(null).collectors.overview({ locale: "en" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it.each([
    ["overview", (c: ReturnType<typeof caller>) => c.collectors.overview({ locale: "en" })],
    ["start", (c: ReturnType<typeof caller>) => c.collectors.start({ collectorId: "feed-items", input: {}, acknowledged: true })],
    ["run", (c: ReturnType<typeof caller>) => c.collectors.run({ runId: "run-1" })],
    ["runs", (c: ReturnType<typeof caller>) => c.collectors.runs({})],
    ["items", (c: ReturnType<typeof caller>) => c.collectors.items({ runId: "run-1" })],
  ])("%s is not found while the feature is off", async (_name, call) => {
    h.enabled = false;
    await expect(call(caller())).rejects.toMatchObject({ code: "NOT_FOUND", message: "COLLECTORS_OFF" });
    expect(h.facade.startRun).not.toHaveBeenCalled();
  });

  it("overview combines collectors, the last three runs, usage and the first-use flag", async () => {
    const result = await caller().collectors.overview({ locale: "nl" });
    expect(h.facade.listCollectors).toHaveBeenCalledWith("nl");
    expect(h.facade.listRuns).toHaveBeenCalledWith("user-1", { limit: 3 });
    expect(h.facade.usage).toHaveBeenCalledWith("user-1");
    expect(result).toEqual({
      collectors: [{ id: "feed-items" }],
      recentRuns: [run],
      usage: { runsToday: 1, runsPerDay: 20 },
      needsAcknowledgement: false,
    });
  });

  it("asks a first-time member to acknowledge", async () => {
    h.facade.listRuns.mockResolvedValue({ runs: [], nextCursor: null });
    expect((await caller().collectors.overview({ locale: "en" })).needsAcknowledgement).toBe(true);
    await expect(
      caller().collectors.start({ collectorId: "feed-items", input: { url: "https://e.com/f" }, acknowledged: false }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: "ACKNOWLEDGEMENT_REQUIRED" });
    expect(h.facade.startRun).not.toHaveBeenCalled();
  });

  it("starts a web run for the signed-in member and returns the facade's answer", async () => {
    const input = { url: "https://e.com/f" };
    const result = await caller().collectors.start({ collectorId: "feed-items", input, acknowledged: false });
    expect(h.facade.startRun).toHaveBeenCalledWith({ userId: "user-1", origin: "web", collectorId: "feed-items", input });
    expect(result).toEqual({ ok: true, runId: "run-2" });
  });

  it("passes a quota refusal through instead of throwing", async () => {
    h.facade.startRun.mockResolvedValue({ ok: false, reason: "quota", quotaReason: "daily_limit", message: "x", retryAt: "2026-10-04T11:00:00.000Z" });
    await expect(
      caller().collectors.start({ collectorId: "feed-items", input: {}, acknowledged: true }),
    ).resolves.toMatchObject({ reason: "quota", quotaReason: "daily_limit" });
  });

  it("hides another member's run as not found", async () => {
    h.facade.getRun.mockResolvedValue(null);
    h.facade.listItems.mockResolvedValue(null);
    await expect(caller("user-2").collectors.run({ runId: "run-1" })).rejects.toMatchObject({ code: "NOT_FOUND", message: "RUN_NOT_FOUND" });
    await expect(caller("user-2").collectors.items({ runId: "run-1" })).rejects.toMatchObject({ code: "NOT_FOUND", message: "RUN_NOT_FOUND" });
    expect(h.facade.getRun).toHaveBeenCalledWith("user-2", "run-1");
  });

  it("pages the history and the rows for the signed-in member", async () => {
    await caller().collectors.runs({ cursor: "c1", limit: 20 });
    expect(h.facade.listRuns).toHaveBeenCalledWith("user-1", { cursor: "c1", limit: 20 });
    await caller().collectors.items({ runId: "run-1", afterSeq: 49, limit: 50 });
    expect(h.facade.listItems).toHaveBeenCalledWith("user-1", "run-1", { afterSeq: 49, limit: 50 });
  });
});
```

If the root router's import chain needs more mocks than listed (compare `src/server/api/routers/onboarding-dismiss.test.ts`, which mocks `@/server/db`, `@/env`, `@/server/better-auth` and `@/server/payload`), copy that file's mock set exactly; do not weaken an assertion.

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/api/routers/collectors.test.ts`
Expected: FAIL — `collectors` is not on the router.

- [ ] **Step 3: Implement**

```ts
// src/server/api/routers/collectors.ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { collectorsEnabled } from "@/server/collectors/flags";
import { liveCollectorRuns } from "@/server/collectors/live";

/**
 * The web's adapter over the CollectorRuns facade (ADR-0040). It adds only
 * the feature gate and the first-use acknowledgement; every other rule
 * (ownership, quota, validation) lives in the facade, so MCP behaves the same.
 */
function facade() {
  if (!collectorsEnabled()) {
    throw new TRPCError({ code: "NOT_FOUND", message: "COLLECTORS_OFF" });
  }
  return liveCollectorRuns();
}

function runNotFound(): never {
  throw new TRPCError({ code: "NOT_FOUND", message: "RUN_NOT_FOUND" });
}

async function isFirstTime(runs: ReturnType<typeof liveCollectorRuns>, userId: string) {
  const { runs: latest } = await runs.listRuns(userId, { limit: 1 });
  return latest.length === 0;
}

export const collectorsRouter = createTRPCRouter({
  overview: protectedProcedure
    .input(z.object({ locale: z.enum(["en", "nl"]) }))
    .query(async ({ ctx, input }) => {
      const runs = facade();
      const userId = ctx.session.user.id;
      const [recent, usage] = await Promise.all([
        runs.listRuns(userId, { limit: 3 }),
        runs.usage(userId),
      ]);
      return {
        collectors: runs.listCollectors(input.locale),
        recentRuns: recent.runs,
        usage,
        needsAcknowledgement: recent.runs.length === 0,
      };
    }),

  start: protectedProcedure
    .input(
      z.object({
        collectorId: z.string().min(1).max(64),
        input: z.unknown(),
        acknowledged: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const runs = facade();
      const userId = ctx.session.user.id;
      if (!input.acknowledged && (await isFirstTime(runs, userId))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "ACKNOWLEDGEMENT_REQUIRED" });
      }
      return runs.startRun({
        userId,
        origin: "web",
        collectorId: input.collectorId,
        input: input.input,
      });
    }),

  run: protectedProcedure
    .input(z.object({ runId: z.string().min(1).max(255) }))
    .query(async ({ ctx, input }) => {
      return (await facade().getRun(ctx.session.user.id, input.runId)) ?? runNotFound();
    }),

  runs: protectedProcedure
    .input(
      z.object({
        cursor: z.string().max(300).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
    )
    .query(({ ctx, input }) => facade().listRuns(ctx.session.user.id, input)),

  items: protectedProcedure
    .input(
      z.object({
        runId: z.string().min(1).max(255),
        afterSeq: z.number().int().min(-1).optional(),
        limit: z.number().int().min(1).max(200).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { runId, ...page } = input;
      return (await facade().listItems(ctx.session.user.id, runId, page)) ?? runNotFound();
    }),
});
```

The test for `runs` passes `{ cursor: "c1", limit: 20 }` and expects exactly that object forwarded; `runs({})` forwards `{}`.

In `src/server/api/root.ts`, import `collectorsRouter` with the other router imports and add `collectors: collectorsRouter,` to `createTRPCRouter({...})`.

- [ ] **Step 4: Run tests and typecheck**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/server/api/routers/collectors.test.ts && pnpm typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/data-collectors-screens
git add src/server/api/routers/collectors.ts src/server/api/routers/collectors.test.ts src/server/api/root.ts
git commit -m "Collectors: tRPC router over the facade, feature-gated, first-use acknowledgement"
```

---

### Task 3: The dashboard tab and the collectors list

**Files:**
- Modify: `src/components/dashboard/dashboard-tabs.tsx`, `src/components/dashboard/dashboard-tabs.test.tsx`, `src/app/[locale]/dashboard/(member)/layout.tsx`
- Create: `src/components/collectors/run-status-badge.tsx`, `src/components/collectors/collectors-home.tsx`, `src/components/collectors/collectors-home.test.tsx`, `src/app/[locale]/dashboard/(member)/collectors/page.tsx`

**Interfaces:**
- Consumes: `api.collectors.overview` (Task 2); `presentRun` (Task 1).
- Produces: `DashboardTabs({ showCollectors?: boolean })`; `<RunStatusBadge status stopReason />`; `<CollectorsHome />`.

- [ ] **Step 1: Write the failing tests**

Append to `src/components/dashboard/dashboard-tabs.test.tsx` (keep every existing test unchanged — the default list stays the same six tabs):

```tsx
  it("adds Data collectors after Job tracker when the feature is on", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <DashboardTabs showCollectors />
      </NextIntlClientProvider>,
    );
    const nav = screen.getByRole("navigation", { name: en.dashboard.tabsLabel });
    const hrefs = Array.from(nav.querySelectorAll("a")).map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      "/dashboard",
      "/dashboard/communities",
      "/dashboard/events",
      "/dashboard/jobs",
      "/dashboard/collectors",
      "/dashboard/notifications",
      "/dashboard/settings",
    ]);
    expect(screen.getByRole("link", { name: tabs.collectors })).toBeInTheDocument();
  });
```

```tsx
// src/components/collectors/collectors-home.test.tsx
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
    <a href={href} {...props}>{children}</a>
  ),
}));

import { CollectorsHome } from "./collectors-home";

const feed = {
  id: "feed-items",
  kind: "feed",
  title: "Feed items",
  description: "The latest items of an RSS or Atom feed.",
  fields: [{ name: "url", label: "Feed address", help: null, placeholder: null }],
  inputJsonSchema: {},
  sampleItem: { title: "Release notes", url: "https://example.com/r" },
  limits: { maxPages: 1, maxItems: 1000, maxDurationMs: 60000 },
};

function ok(data: unknown) {
  return { data, isPending: false, isError: false, refetch: vi.fn() };
}

function renderHome() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} now={new Date("2026-10-03T12:00:00Z")} timeZone="UTC">
      <CollectorsHome />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  overview.mockReset();
});

describe("CollectorsHome", () => {
  it("asks for the overview in the member's language", () => {
    overview.mockReturnValue(ok({ collectors: [], recentRuns: [], usage: { runsToday: 0, runsPerDay: 20 }, needsAcknowledgement: true }));
    renderHome();
    expect(overview).toHaveBeenCalledWith({ locale: "en" });
  });

  it("lists collectors with a link to start each one", () => {
    overview.mockReturnValue(ok({ collectors: [feed], recentRuns: [], usage: { runsToday: 3, runsPerDay: 20 }, needsAcknowledgement: false }));
    renderHome();
    expect(screen.getByRole("heading", { name: "Feed items" })).toBeInTheDocument();
    expect(screen.getByText("3 of 20 runs used · last 24 hours")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: en.collectors.useCollector })).toHaveAttribute(
      "href",
      "/dashboard/collectors/new/feed-items",
    );
    expect(screen.getByText("You get: up to 1,000 rows")).toBeInTheDocument();
  });

  it("shows recent runs with their status and a link to each run", () => {
    overview.mockReturnValue(
      ok({
        collectors: [feed],
        recentRuns: [{ id: "r1", collectorId: "feed-items", status: "succeeded", stopReason: "page_limit", input: { url: "https://blog.example.org/feed" }, createdAt: "2026-10-03T10:00:00.000Z" }],
        usage: { runsToday: 1, runsPerDay: 20 },
        needsAcknowledgement: false,
      }),
    );
    renderHome();
    expect(screen.getByText(en.collectors.status.partial)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Feed items/ })).toHaveAttribute("href", "/dashboard/collectors/runs/r1");
    expect(screen.getByRole("link", { name: en.collectors.seeAllRuns })).toHaveAttribute("href", "/dashboard/collectors/runs");
  });

  it("shows an error with retry when the overview fails", () => {
    const refetch = vi.fn();
    overview.mockReturnValue({ data: undefined, isPending: false, isError: true, refetch });
    renderHome();
    screen.getByRole("button", { name: en.common.retry }).click();
    expect(refetch).toHaveBeenCalled();
  });
});
```

(Check `en.common.retry` exists — `ErrorState` uses it by default. If its key differs, use the key `ErrorState` reads.)

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/dashboard/dashboard-tabs.test.tsx src/components/collectors`
Expected: FAIL — `showCollectors` not supported; `./collectors-home` missing.

- [ ] **Step 3: Implement**

`src/components/dashboard/dashboard-tabs.tsx`: keep `DASHBOARD_TABS` as is; add the gated tab and the prop:

```tsx
/** Shown after Job tracker only while data collectors are switched on. */
const COLLECTORS_TAB = { href: "/dashboard/collectors", labelKey: "collectors" } as const;

/** Tab bar for the member dashboard frame, built on the shared RouteTabs. */
export function DashboardTabs({ showCollectors = false }: { showCollectors?: boolean }) {
  const t = useTranslations("dashboard");
  const source = showCollectors
    ? DASHBOARD_TABS.flatMap((tab) => (tab.labelKey === "jobs" ? [tab, COLLECTORS_TAB] : [tab]))
    : DASHBOARD_TABS;
  const tabs: RouteTab[] = source.map(({ labelKey, ...tab }) => ({
    ...tab,
    label: t(`tabs.${labelKey}`),
  }));
  return <RouteTabs aria-label={t("tabsLabel")} tabs={tabs} />;
}
```

`src/app/[locale]/dashboard/(member)/layout.tsx`: import `collectorsEnabled` from `@/server/collectors/flags` and render `<DashboardTabs showCollectors={collectorsEnabled()} />`.

```tsx
// src/components/collectors/run-status-badge.tsx
"use client";

import { CheckIcon, CircleAlertIcon, ClockIcon, XIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { type BadgeTone, presentRun } from "@/lib/collectors/run-presentation";
import type { RunStatus, StopReason } from "@/server/collectors/run-status";

const ICONS: Record<BadgeTone, typeof CheckIcon> = {
  info: ClockIcon,
  success: CheckIcon,
  warning: CircleAlertIcon,
  destructive: XIcon,
};

/** A run's status as a semantic badge: colour plus icon plus label (DESIGN.md). */
export function RunStatusBadge({ status, stopReason }: { status: RunStatus; stopReason: StopReason | null }) {
  const t = useTranslations("collectors.status");
  const { tone, label } = presentRun({ status, stopReason });
  const Icon = ICONS[tone];
  return (
    <Badge variant={tone}>
      <Icon aria-hidden="true" />
      {t(label)}
    </Badge>
  );
}
```

```tsx
// src/components/collectors/collectors-home.tsx
"use client";

import { useLocale, useTranslations } from "next-intl";

import { DashboardSection, statusFromQueries } from "@/components/dashboard/dashboard-section";
import { RunStatusBadge } from "@/components/collectors/run-status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { Link } from "@/i18n/navigation";
import { api, type RouterOutputs } from "@/trpc/react";

type Overview = RouterOutputs["collectors"]["overview"];
type Summary = Overview["collectors"][number];

/** A short, human label for what a run was pointed at: its first string input. */
export function runTarget(input: unknown): string | null {
  if (!input || typeof input !== "object") return null;
  const first = Object.values(input).find((v) => typeof v === "string");
  if (typeof first !== "string") return null;
  try {
    const url = new URL(first);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return first;
  }
}

/** Data collectors tab: the catalog and the member's latest runs. */
export function CollectorsHome() {
  const t = useTranslations("collectors");
  const locale = useLocale() === "nl" ? "nl" : "en";
  const overview = api.collectors.overview.useQuery({ locale });
  const data = overview.data;
  const titles = new Map(data?.collectors.map((c) => [c.id, c.title]));

  return (
    <div className="flex flex-col gap-10">
      <DashboardSection
        title={t("title")}
        status={statusFromQueries(overview, { isEmpty: data?.collectors.length === 0 })}
        empty={<p className="text-muted-foreground text-sm">{t("noCollectors")}</p>}
        action={
          data ? (
            <span className="text-muted-foreground font-mono text-xs">
              {t("usage", { used: data.usage.runsToday, limit: data.usage.runsPerDay })}
            </span>
          ) : null
        }
      >
        <p className="max-w-prose text-[15px] leading-relaxed">
          {t("intro")}{" "}
          <Link href="/collectors/about" className="text-primary underline-offset-4 hover:underline">
            {t("aboutLink")}
          </Link>
        </p>
        <ul className="border-border mt-4 divide-y rounded-xl border shadow-sm">
          {data?.collectors.map((c) => <CollectorRow key={c.id} collector={c} />)}
        </ul>
      </DashboardSection>

      <DashboardSection
        title={t("recentRuns")}
        status={statusFromQueries(overview, { isEmpty: data?.recentRuns.length === 0 })}
        empty={<p className="text-muted-foreground text-sm">{t("noRecentRuns")}</p>}
        action={
          <Link href="/dashboard/collectors/runs" className="text-primary text-sm underline-offset-4 hover:underline">
            {t("seeAllRuns")}
          </Link>
        }
      >
        <ul className="divide-border divide-y">
          {data?.recentRuns.map((run) => {
            const target = runTarget(run.input);
            return (
              <li key={run.id} className="flex flex-wrap items-center gap-3 py-3">
                <Link href={`/dashboard/collectors/runs/${run.id}`} className="min-w-0 flex-1 font-medium hover:underline">
                  {titles.get(run.collectorId) ?? run.collectorId}
                  {target ? <span className="text-muted-foreground font-mono text-xs"> · {target}</span> : null}
                </Link>
                <RunStatusBadge status={run.status} stopReason={run.stopReason} />
                <RelativeTime date={run.createdAt} className="text-muted-foreground w-28 text-right font-mono text-xs" />
              </li>
            );
          })}
        </ul>
      </DashboardSection>
    </div>
  );
}

function CollectorRow({ collector }: { collector: Summary }) {
  const t = useTranslations("collectors");
  return (
    <li className="flex flex-wrap items-start gap-6 px-6 py-5">
      <div className="flex min-w-0 flex-1 basis-96 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h3 className="text-base font-semibold">{collector.title}</h3>
          <Badge variant="outline">{t(`kind.${collector.kind}`)}</Badge>
        </div>
        <p className="text-muted-foreground text-sm leading-relaxed">{collector.description}</p>
        <p className="text-muted-foreground text-[13px]">
          {t("youGive", { fields: collector.fields.map((f) => f.label).join(", ") })} ·{" "}
          {t("youGet", { count: collector.limits.maxItems })}
        </p>
        <details className="mt-1">
          <summary className="cursor-pointer text-[13px]">{t("exampleRow")}</summary>
          <dl className="bg-sidebar border-border mt-2 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border p-3 font-mono text-xs">
            {Object.entries(collector.sampleItem).map(([key, value]) => (
              <div key={key} className="contents">
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="m-0 break-words">{value === null ? "—" : String(value)}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
      <Button asChild variant="outline">
        <Link href={`/dashboard/collectors/new/${collector.id}`}>{t("useCollector")}</Link>
      </Button>
    </li>
  );
}
```

The collectors list is a semantic `<ul>` of rows inside one bordered container, not a grid of cards (DESIGN.md "no identical card grids"; no nested cards). `String(value)` on a sample value: sample items are flat scalars by the catalog's contract.

```tsx
// src/app/[locale]/dashboard/(member)/collectors/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CollectorsHome } from "@/components/collectors/collectors-home";
import { collectorsEnabled } from "@/server/collectors/flags";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Data collectors tab: the main column only; the frame is the layout's. */
export default async function DashboardCollectorsPage() {
  if (!collectorsEnabled()) notFound();
  await requireDashboardSession();
  return <CollectorsHome />;
}
```

- [ ] **Step 4: Run tests, lint, typecheck**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/dashboard src/components/collectors && pnpm exec eslint src/components/collectors src/components/dashboard "src/app/[locale]/dashboard" && pnpm typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/data-collectors-screens
git add src/components/dashboard/dashboard-tabs.tsx src/components/dashboard/dashboard-tabs.test.tsx "src/app/[locale]/dashboard/(member)/layout.tsx" src/components/collectors/run-status-badge.tsx src/components/collectors/collectors-home.tsx src/components/collectors/collectors-home.test.tsx "src/app/[locale]/dashboard/(member)/collectors/page.tsx"
git commit -m "Collectors: dashboard tab behind the flag and the collectors list"
```

---

### Task 4: Start-a-run screen with a schema-driven form

**Files:**
- Create: `src/lib/collectors/form-fields.ts`, `src/lib/collectors/form-fields.test.ts`, `src/components/collectors/field-renderers.tsx`, `src/components/collectors/start-run-form.tsx`, `src/components/collectors/start-run-form.test.tsx`, `src/app/[locale]/dashboard/(member)/collectors/new/[collectorId]/page.tsx`

**Interfaces:**
- Consumes: `api.collectors.overview`, `api.collectors.start` (Task 2); `CollectorSummary.fields` and `inputJsonSchema`.
- Produces:
  - `type FieldKind = "url" | "text" | "number" | "checkbox"`
  - `type FormField = { name: string; label: string; help: string | null; placeholder: string | null; kind: FieldKind; required: boolean }`
  - `formFieldsFor(summary: { fields: CollectorSummary["fields"]; inputJsonSchema: unknown }): { ok: true; fields: FormField[] } | { ok: false; unsupported: string[] }`
  - `type FieldValue = string | boolean`; `coerceInput(fields: FormField[], values: Record<string, FieldValue>): Record<string, unknown>`
  - `FIELD_RENDERERS: Record<FieldKind, FieldRenderer>` where `FieldRenderer = (props: { field: FormField; id: string; value: FieldValue; error: string | null; onChange: (v: FieldValue) => void }) => React.ReactNode`
  - `<StartRunForm collectorId={string} />`

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/collectors/form-fields.test.ts
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { allCollectors } from "@/server/collectors/catalog";
import { coerceInput, formFieldsFor } from "./form-fields";

const hint = (name: string) => ({ name, label: name, help: null, placeholder: null });

describe("formFieldsFor", () => {
  it("maps JSON schema properties to field kinds and required flags", () => {
    const schema = z.toJSONSchema(
      z.object({
        url: z.url(),
        name: z.string(),
        count: z.number().int().optional(),
        forks: z.boolean().optional(),
      }),
    );
    const result = formFieldsFor({ fields: ["url", "name", "count", "forks"].map(hint), inputJsonSchema: schema });
    expect(result).toEqual({
      ok: true,
      fields: [
        { ...hint("url"), kind: "url", required: true },
        { ...hint("name"), kind: "text", required: true },
        { ...hint("count"), kind: "number", required: false },
        { ...hint("forks"), kind: "checkbox", required: false },
      ],
    });
  });

  it("refuses a schema with a field it cannot draw", () => {
    const schema = z.toJSONSchema(z.object({ fields: z.array(z.object({ name: z.string() })) }));
    expect(formFieldsFor({ fields: [hint("fields")], inputJsonSchema: schema })).toEqual({ ok: false, unsupported: ["fields"] });
  });

  it.each(allCollectors().map((c) => [c.id, c] as const))(
    "can draw every field of %s",
    (_id, c) => {
      const fields = Object.keys(c.fieldHints).map(hint);
      expect(formFieldsFor({ fields, inputJsonSchema: z.toJSONSchema(c.inputSchema) }).ok).toBe(true);
    },
  );
});

describe("coerceInput", () => {
  const fields = [
    { ...hint("url"), kind: "url" as const, required: true },
    { ...hint("count"), kind: "number" as const, required: false },
    { ...hint("forks"), kind: "checkbox" as const, required: false },
  ];

  it("trims text, turns numbers into numbers and leaves out empty optional fields", () => {
    expect(coerceInput(fields, { url: "  https://e.com/f  ", count: "", forks: true })).toEqual({ url: "https://e.com/f", forks: true });
    expect(coerceInput(fields, { url: "https://e.com/f", count: "25", forks: false })).toEqual({ url: "https://e.com/f", count: 25, forks: false });
  });
});
```

The catalog test imports server catalog code into a jsdom test; the catalog has no I/O, only Zod. If the test environment complains, add `// @vitest-environment node` as the file's first line.

```tsx
// src/components/collectors/start-run-form.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import en from "../../../messages/en.json";

const h = vi.hoisted(() => ({
  overview: vi.fn(),
  mutate: vi.fn(),
  push: vi.fn(),
  options: {} as { onSuccess?: (r: unknown) => void; onError?: (e: unknown) => void },
}));

vi.mock("@/trpc/react", () => ({
  api: {
    collectors: {
      overview: { useQuery: h.overview },
      start: {
        useMutation: (opts: typeof h.options) => {
          h.options = opts;
          return { mutate: h.mutate, isPending: false };
        },
      },
    },
  },
}));
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push: h.push }),
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { StartRunForm } from "./start-run-form";

const feed = {
  id: "feed-items",
  kind: "feed",
  title: "Feed items",
  description: "The latest items of an RSS or Atom feed.",
  fields: [{ name: "url", label: "Feed address", help: "The web address of the feed.", placeholder: "https://example.com/feed.xml" }],
  inputJsonSchema: z.toJSONSchema(z.object({ url: z.url() })),
  sampleItem: {},
  limits: { maxPages: 1, maxItems: 1000, maxDurationMs: 60000 },
};

function overview(needsAcknowledgement: boolean, collectors = [feed]) {
  h.overview.mockReturnValue({
    data: { collectors, recentRuns: [], usage: { runsToday: 0, runsPerDay: 20 }, needsAcknowledgement },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  });
}

function renderForm(collectorId = "feed-items") {
  return render(
    <NextIntlClientProvider locale="en" messages={en} now={new Date("2026-10-03T12:00:00Z")} timeZone="UTC">
      <StartRunForm collectorId={collectorId} />
    </NextIntlClientProvider>,
  );
}

const startButton = () => screen.getByRole("button", { name: en.collectors.start.submit });

beforeEach(() => {
  vi.clearAllMocks();
  h.options = {};
});

describe("StartRunForm", () => {
  it("draws the collector's field from its schema and sends the typed input", () => {
    overview(false);
    renderForm();
    const field = screen.getByLabelText("Feed address");
    expect(field).toHaveAttribute("type", "url");
    fireEvent.change(field, { target: { value: " https://blog.example.org/feed.xml " } });
    fireEvent.click(startButton());
    expect(h.mutate).toHaveBeenCalledWith({
      collectorId: "feed-items",
      input: { url: "https://blog.example.org/feed.xml" },
      acknowledged: false,
    });
  });

  it("holds Start until a first-time member acknowledges the note", () => {
    overview(true);
    renderForm();
    expect(screen.getByText(en.collectors.start.firstUseTitle)).toBeInTheDocument();
    expect(startButton()).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: en.collectors.start.acknowledge }));
    expect(startButton()).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Feed address"), { target: { value: "https://e.com/f" } });
    fireEvent.click(startButton());
    expect(h.mutate).toHaveBeenCalledWith(expect.objectContaining({ acknowledged: true }));
  });

  it("goes to the run page when the run starts", () => {
    overview(false);
    renderForm();
    h.options.onSuccess?.({ ok: true, runId: "run-9" });
    expect(h.push).toHaveBeenCalledWith("/dashboard/collectors/runs/run-9");
  });

  it("marks the field the server rejected", () => {
    overview(false);
    renderForm();
    h.options.onSuccess?.({ ok: false, reason: "invalid_input", message: "x", fieldErrors: { url: ["Invalid URL"] } });
    return screen.findByText(en.collectors.start.invalidField).then((note) => {
      expect(screen.getByLabelText("Feed address")).toHaveAttribute("aria-invalid", "true");
      expect(screen.getByLabelText("Feed address")).toHaveAttribute("aria-describedby", expect.stringContaining(note.id));
    });
  });

  it("says which limit refused the start and when to try again, keeping the input", async () => {
    overview(false);
    renderForm();
    fireEvent.change(screen.getByLabelText("Feed address"), { target: { value: "https://e.com/f" } });
    h.options.onSuccess?.({ ok: false, reason: "quota", quotaReason: "daily_limit", message: "x", retryAt: "2026-10-03T15:00:00.000Z" });
    expect(await screen.findByRole("alert")).toHaveTextContent("You've used all 20 runs for the last 24 hours. You can start again in 3 hours.");
    expect(screen.getByLabelText("Feed address")).toHaveValue("https://e.com/f");
  });

  it("shows a way back when the collector does not exist", () => {
    overview(false, []);
    renderForm("nope");
    expect(screen.getByText(en.collectors.start.notFound)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: en.collectors.start.backToList })).toHaveAttribute("href", "/dashboard/collectors");
  });

  it("shows an error instead of a broken form for a field it cannot draw", () => {
    overview(false, [{ ...feed, fields: [{ name: "fields", label: "Fields", help: null, placeholder: null }], inputJsonSchema: z.toJSONSchema(z.object({ fields: z.array(z.string()) })) }]);
    renderForm();
    expect(screen.getByText(en.collectors.start.unsupported)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: en.collectors.start.submit })).toBeNull();
  });
});
```

The "in 3 hours" text depends on next-intl's relative-time formatting with `now` fixed at 12:00 and `retryAt` at 15:00. If the formatter renders a different phrase for that gap, assert the phrase it actually renders for a 3-hour gap — do not drop the assertion.

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/collectors src/components/collectors`
Expected: FAIL — modules missing.

- [ ] **Step 3: Implement**

```ts
// src/lib/collectors/form-fields.ts
/**
 * Turns a collector's JSON input schema plus its field hints into fields the
 * start form can draw. Adding a collector needs no UI code; a collector that
 * needs a new kind of field adds one kind here and one renderer
 * (field-renderers.tsx). Unknown kinds are refused, never drawn wrong.
 */
export type FieldKind = "url" | "text" | "number" | "checkbox";

export type FormField = {
  name: string;
  label: string;
  help: string | null;
  placeholder: string | null;
  kind: FieldKind;
  required: boolean;
};

export type FieldValue = string | boolean;

type SchemaProperty = { type?: unknown; format?: unknown };

function kindOf(property: SchemaProperty | undefined): FieldKind | null {
  if (!property) return null;
  if (property.type === "string") return property.format === "uri" ? "url" : "text";
  if (property.type === "number" || property.type === "integer") return "number";
  if (property.type === "boolean") return "checkbox";
  return null;
}

export function formFieldsFor(summary: {
  fields: { name: string; label: string; help: string | null; placeholder: string | null }[];
  inputJsonSchema: unknown;
}): { ok: true; fields: FormField[] } | { ok: false; unsupported: string[] } {
  const schema = (summary.inputJsonSchema ?? {}) as {
    properties?: Record<string, SchemaProperty>;
    required?: unknown;
  };
  const required = new Set(Array.isArray(schema.required) ? (schema.required as string[]) : []);
  const fields: FormField[] = [];
  const unsupported: string[] = [];
  for (const hint of summary.fields) {
    const kind = kindOf(schema.properties?.[hint.name]);
    if (kind) fields.push({ ...hint, kind, required: required.has(hint.name) });
    else unsupported.push(hint.name);
  }
  return unsupported.length ? { ok: false, unsupported } : { ok: true, fields };
}

/** Form values → the collector's input: trimmed text, real numbers, booleans. */
export function coerceInput(
  fields: FormField[],
  values: Record<string, FieldValue>,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.name];
    if (field.kind === "checkbox") {
      input[field.name] = value === true;
      continue;
    }
    const text = typeof value === "string" ? value.trim() : "";
    if (text === "" && !field.required) continue;
    input[field.name] = field.kind === "number" && text !== "" ? Number(text) : text;
  }
  return input;
}
```

```tsx
// src/components/collectors/field-renderers.tsx
"use client";

import type * as React from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FieldKind, FieldValue, FormField } from "@/lib/collectors/form-fields";

export type FieldRendererProps = {
  field: FormField;
  id: string;
  value: FieldValue;
  error: string | null;
  onChange: (value: FieldValue) => void;
};

type FieldRenderer = (props: FieldRendererProps) => React.ReactNode;

function describedBy(id: string, field: FormField, error: string | null) {
  return [field.help ? `${id}-help` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

function FieldNotes({ id, field, error }: { id: string; field: FormField; error: string | null }) {
  return (
    <>
      {field.help ? <p id={`${id}-help`} className="text-muted-foreground text-[13px]">{field.help}</p> : null}
      {error ? <p id={`${id}-error`} className="text-destructive text-[13px]">{error}</p> : null}
    </>
  );
}

function textual(type: "url" | "text" | "number"): FieldRenderer {
  return function TextualField({ field, id, value, error, onChange }) {
    return (
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={id}>{field.label}</Label>
        <Input
          id={id}
          type={type}
          inputMode={type === "number" ? "numeric" : undefined}
          required={field.required}
          placeholder={field.placeholder ?? undefined}
          value={typeof value === "string" ? value : ""}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, field, error)}
          onChange={(e) => onChange(e.target.value)}
        />
        <FieldNotes id={id} field={field} error={error} />
      </div>
    );
  };
}

function CheckboxField({ field, id, value, error, onChange }: FieldRendererProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-2.5">
        <Checkbox
          id={id}
          tone="ink"
          checked={value === true}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, field, error)}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        <Label htmlFor={id}>{field.label}</Label>
      </div>
      <FieldNotes id={id} field={field} error={error} />
    </div>
  );
}

/** One renderer per field kind (Strategy): a new kind is one more entry. */
export const FIELD_RENDERERS: Record<FieldKind, FieldRenderer> = {
  url: textual("url"),
  text: textual("text"),
  number: textual("number"),
  checkbox: CheckboxField,
};
```

```tsx
// src/components/collectors/start-run-form.tsx
"use client";

import * as React from "react";
import { InfoIcon } from "lucide-react";
import { useLocale, useNow, useFormatter, useTranslations } from "next-intl";

import { FIELD_RENDERERS } from "@/components/collectors/field-renderers";
import { DashboardSection, statusFromQueries } from "@/components/dashboard/dashboard-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { Link, useRouter } from "@/i18n/navigation";
import { coerceInput, type FieldValue, formFieldsFor } from "@/lib/collectors/form-fields";
import { api } from "@/trpc/react";

type StartResult =
  | { ok: true; runId: string }
  | {
      ok: false;
      reason: "disabled" | "unknown_collector" | "invalid_input" | "quota";
      message: string;
      fieldErrors?: Record<string, string[]>;
      quotaReason?: "daily_limit" | "active_limit" | "platform_busy";
      retryAt?: string;
    };

/** The start-a-run screen: one collector's form, drawn from its schema. */
export function StartRunForm({ collectorId }: { collectorId: string }) {
  const t = useTranslations("collectors");
  const format = useFormatter();
  const now = useNow();
  const router = useRouter();
  const locale = useLocale() === "nl" ? "nl" : "en";
  const overview = api.collectors.overview.useQuery({ locale });
  const collector = overview.data?.collectors.find((c) => c.id === collectorId);
  const fields = collector ? formFieldsFor(collector) : null;

  const [values, setValues] = React.useState<Record<string, FieldValue>>({});
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [problem, setProblem] = React.useState<string | null>(null);

  const start = api.collectors.start.useMutation({
    onSuccess: (result: StartResult) => {
      if (result.ok) {
        router.push(`/dashboard/collectors/runs/${result.runId}`);
        return;
      }
      if (result.reason === "invalid_input") {
        setFieldErrors(
          Object.fromEntries(Object.keys(result.fieldErrors ?? {}).map((name) => [name, t("start.invalidField")])),
        );
        setProblem(t("start.fixFields"));
        return;
      }
      if (result.reason === "quota") {
        const reason = result.quotaReason ?? "platform_busy";
        const limit = overview.data?.usage.runsPerDay ?? 0;
        setProblem(
          reason === "daily_limit" && result.retryAt
            ? t("start.quota.daily_limit_retry", { limit, when: format.relativeTime(new Date(result.retryAt), now) })
            : t(`start.quota.${reason}`, { limit }),
        );
        return;
      }
      setProblem(t("start.notFound"));
    },
    onError: () => setProblem(t("start.failed")),
  });

  const needsAck = overview.data?.needsAcknowledgement ?? false;

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-muted-foreground text-[13px]">
        <Link href="/dashboard/collectors" className="text-primary hover:underline">{t("breadcrumb.collectors")}</Link>
        <span aria-hidden="true"> / </span>
        {collector?.title ?? collectorId}
      </nav>

      <DashboardSection title={t("title")} status={statusFromQueries(overview)}>
        {!collector ? (
          <EmptyState
            title={t("start.notFound")}
            action={<Button asChild variant="outline"><Link href="/dashboard/collectors">{t("start.backToList")}</Link></Button>}
          />
        ) : !fields?.ok ? (
          <EmptyState
            title={t("start.unsupported")}
            action={<Button asChild variant="outline"><Link href="/dashboard/collectors">{t("start.backToList")}</Link></Button>}
          />
        ) : (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-2xl font-semibold tracking-tight">{collector.title}</h2>
                <Badge variant="outline">{t(`kind.${collector.kind}`)}</Badge>
              </div>
              <p className="text-muted-foreground text-[15px] leading-relaxed">{collector.description}</p>
            </div>

            {needsAck ? (
              <section aria-labelledby="first-use" className="bg-sidebar border-border flex flex-col gap-3 rounded-xl border px-6 py-5">
                <div className="flex items-center gap-2.5">
                  <InfoIcon aria-hidden="true" className="text-info size-[18px]" />
                  <h3 id="first-use" className="text-[15px] font-semibold">{t("start.firstUseTitle")}</h3>
                </div>
                <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
                  <li>{t("start.firstUse1")}</li>
                  <li>{t("start.firstUse2")}</li>
                  <li>{t("start.firstUse3")}</li>
                  <li>{t("start.firstUse4")}</li>
                </ul>
                <div className="flex items-start gap-2.5 pt-1">
                  <Checkbox id="acknowledge" tone="ink" checked={acknowledged} onCheckedChange={(c) => setAcknowledged(c === true)} />
                  <Label htmlFor="acknowledge" className="text-sm font-normal">{t("start.acknowledge")}</Label>
                </div>
              </section>
            ) : null}

            <form
              noValidate
              className="border-border flex flex-col gap-5 rounded-xl border p-6 shadow-sm"
              onSubmit={(e) => {
                e.preventDefault();
                setFieldErrors({});
                setProblem(null);
                start.mutate({ collectorId, input: coerceInput(fields.fields, values), acknowledged });
              }}
            >
              {fields.fields.map((field) => {
                const Render = FIELD_RENDERERS[field.kind];
                return (
                  <Render
                    key={field.name}
                    field={field}
                    id={`field-${field.name}`}
                    value={values[field.name] ?? (field.kind === "checkbox" ? false : "")}
                    error={fieldErrors[field.name] ?? null}
                    onChange={(v) => setValues((prev) => ({ ...prev, [field.name]: v }))}
                  />
                );
              })}

              <p className="text-muted-foreground border-border border-t pt-4 font-mono text-xs">
                {t("start.limits", {
                  items: format.number(collector.limits.maxItems),
                  pages: collector.limits.maxPages,
                  seconds: Math.round(collector.limits.maxDurationMs / 1000),
                  perDay: overview.data?.usage.runsPerDay ?? 0,
                })}
              </p>

              {problem ? <p role="alert" className="text-destructive text-sm">{problem}</p> : null}

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={start.isPending || (needsAck && !acknowledged)}>
                  {start.isPending ? t("start.submitting") : t("start.submit")}
                </Button>
                <Button asChild variant="ghost">
                  <Link href="/dashboard/collectors">{t("start.cancel")}</Link>
                </Button>
              </div>
            </form>
          </div>
        )}
      </DashboardSection>
    </div>
  );
}
```

`FIELD_RENDERERS[field.kind]` returns a function component; render it as `<Render ... />` (React component, capitalised). `items` uses `format.number` so "1,000" is localised; the `limits` message takes it as a plain argument.

```tsx
// src/app/[locale]/dashboard/(member)/collectors/new/[collectorId]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { StartRunForm } from "@/components/collectors/start-run-form";
import { collectorsEnabled } from "@/server/collectors/flags";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function StartCollectorRunPage({
  params,
}: {
  params: Promise<{ collectorId: string }>;
}) {
  if (!collectorsEnabled()) notFound();
  await requireDashboardSession();
  const { collectorId } = await params;
  return <StartRunForm collectorId={collectorId} />;
}
```

- [ ] **Step 4: Run tests, lint, typecheck**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/lib/collectors src/components/collectors && pnpm exec eslint src/lib/collectors src/components/collectors "src/app/[locale]/dashboard" && pnpm typecheck` → PASS, output pristine.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/data-collectors-screens
git add src/lib/collectors/form-fields.ts src/lib/collectors/form-fields.test.ts src/components/collectors/field-renderers.tsx src/components/collectors/start-run-form.tsx src/components/collectors/start-run-form.test.tsx "src/app/[locale]/dashboard/(member)/collectors/new/[collectorId]/page.tsx"
git commit -m "Collectors: start-a-run screen with a schema-driven form and first-use note"
```

---

### Task 5: The run page

**Files:**
- Create: `src/components/collectors/collector-run.tsx`, `src/components/collectors/collector-run.test.tsx`, `src/app/[locale]/dashboard/(member)/collectors/runs/[runId]/page.tsx`

**Interfaces:**
- Consumes: `api.collectors.run`, `api.collectors.items`, `api.collectors.overview` (for the collector's title); `RunStatusBadge`, `presentRun`, `isRunActive`, `runTarget`.
- Produces: `<CollectorRun runId={string} />`; `runPollInterval(run: { status: RunStatus } | undefined): number | false` (exported for tests); `ITEMS_PAGE = 50`.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/collectors/collector-run.test.tsx
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

const h = vi.hoisted(() => ({ run: vi.fn(), items: vi.fn(), overview: vi.fn() }));

vi.mock("@/trpc/react", () => ({
  api: {
    collectors: {
      run: { useQuery: h.run },
      items: { useQuery: h.items },
      overview: { useQuery: h.overview },
    },
  },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { CollectorRun, runPollInterval } from "./collector-run";

const base = {
  id: "run-1",
  collectorId: "feed-items",
  collectorVersion: 1,
  origin: "web",
  agentId: null,
  input: { url: "https://blog.example.org/feed.xml" },
  pagesFetched: 20,
  bytesFetched: 1000,
  itemCount: 2,
  invalidItemCount: 1,
  durationMs: 41000,
  error: null,
  log: ["Page 20 of 20 read."],
  createdAt: "2026-10-03T11:58:00.000Z",
  startedAt: "2026-10-03T11:58:01.000Z",
  finishedAt: "2026-10-03T11:58:42.000Z",
  expiresAt: "2026-11-02T11:58:00.000Z",
};

const ok = (data: unknown) => ({ data, isPending: false, isError: false, error: null, refetch: vi.fn() });

function renderRun() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} now={new Date("2026-10-03T12:00:00Z")} timeZone="UTC">
      <CollectorRun runId="run-1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.overview.mockReturnValue(ok({ collectors: [{ id: "feed-items", title: "Feed items" }], recentRuns: [], usage: { runsToday: 0, runsPerDay: 20 }, needsAcknowledgement: false }));
  h.items.mockReturnValue(ok({ items: [{ title: "Release notes", url: "https://blog.example.org/r" }, { title: "Recap", url: null }], nextSeq: null }));
});

describe("runPollInterval", () => {
  it("polls every 3 seconds while the run is active and stops when it ends", () => {
    expect(runPollInterval({ status: "queued" })).toBe(3000);
    expect(runPollInterval({ status: "running" })).toBe(3000);
    expect(runPollInterval({ status: "succeeded" })).toBe(false);
    expect(runPollInterval({ status: "failed" })).toBe(false);
    expect(runPollInterval(undefined)).toBe(3000);
  });
});

describe("CollectorRun", () => {
  it("asks for this run and polls by the run's own status", () => {
    h.run.mockReturnValue(ok({ ...base, status: "running", stopReason: null }));
    renderRun();
    expect(h.run).toHaveBeenCalledWith({ runId: "run-1" }, expect.objectContaining({ refetchInterval: expect.any(Function) }));
    const [, options] = h.run.mock.calls[0] as [unknown, { refetchInterval: (q: { state: { data: unknown } }) => unknown }];
    expect(options.refetchInterval({ state: { data: { status: "succeeded" } } })).toBe(false);
  });

  it("explains a partial run and offers both downloads", () => {
    h.run.mockReturnValue(ok({ ...base, status: "succeeded", stopReason: "page_limit" }));
    renderRun();
    expect(screen.getByText(en.collectors.status.partial)).toBeInTheDocument();
    expect(screen.getByText(en.collectors.stop.page_limit)).toBeInTheDocument();
    expect(screen.getByText("2 rows · 20 pages fetched · 1 row skipped")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: en.collectors.run.downloadCsv })).toHaveAttribute("href", "/api/collectors/runs/run-1/export?format=csv");
    expect(screen.getByRole("link", { name: en.collectors.run.downloadJson })).toHaveAttribute("href", "/api/collectors/runs/run-1/export?format=json");
    expect(screen.getByRole("cell", { name: "Release notes" })).toBeInTheDocument();
    expect(h.items).toHaveBeenCalledWith({ runId: "run-1", afterSeq: -1, limit: 50 }, expect.anything());
  });

  it("shows the failure reason and no downloads for a failed run with no rows", () => {
    h.run.mockReturnValue(ok({ ...base, status: "failed", stopReason: "robots_disallowed", itemCount: 0 }));
    renderRun();
    expect(screen.getByText(en.collectors.stop.robots_disallowed)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: en.collectors.run.downloadCsv })).toBeNull();
  });

  it("says the run was not found for a missing or foreign run", () => {
    h.run.mockReturnValue({ data: undefined, isPending: false, isError: true, error: { data: { code: "NOT_FOUND" } }, refetch: vi.fn() });
    renderRun();
    expect(screen.getByText(en.collectors.run.notFound)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/collectors/collector-run.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```tsx
// src/components/collectors/collector-run.tsx
"use client";

import * as React from "react";
import { useLocale, useTranslations } from "next-intl";

import { runTarget } from "@/components/collectors/collectors-home";
import { RunStatusBadge } from "@/components/collectors/run-status-badge";
import { DashboardSection, statusFromQueries } from "@/components/dashboard/dashboard-section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTime } from "@/components/ui/relative-time";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/i18n/navigation";
import { isRunActive, presentRun } from "@/lib/collectors/run-presentation";
import type { RunStatus } from "@/server/collectors/run-status";
import { api } from "@/trpc/react";

export const ITEMS_PAGE = 50;
const POLL_MS = 3_000;

/** Poll while a run is active (or not loaded yet); stop once it ends. */
export function runPollInterval(run: { status: RunStatus } | undefined): number | false {
  return !run || isRunActive(run.status) ? POLL_MS : false;
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value as string | number | boolean);
}

export function CollectorRun({ runId }: { runId: string }) {
  const t = useTranslations("collectors");
  const locale = useLocale() === "nl" ? "nl" : "en";
  const run = api.collectors.run.useQuery(
    { runId },
    { refetchInterval: (query) => runPollInterval(query.state.data as { status: RunStatus } | undefined) },
  );
  const overview = api.collectors.overview.useQuery({ locale });
  const [pageStarts, setPageStarts] = React.useState<number[]>([-1]);
  const afterSeq = pageStarts[pageStarts.length - 1] ?? -1;
  const data = run.data;
  const active = data ? isRunActive(data.status) : true;
  const items = api.collectors.items.useQuery(
    { runId, afterSeq, limit: ITEMS_PAGE },
    { enabled: Boolean(data && data.itemCount > 0), refetchInterval: active ? POLL_MS : false },
  );

  const notFound = run.isError && (run.error as { data?: { code?: string } } | null)?.data?.code === "NOT_FOUND";
  if (notFound) {
    return (
      <EmptyState
        title={t("run.notFound")}
        action={<Button asChild variant="outline"><Link href="/dashboard/collectors/runs">{t("breadcrumb.runs")}</Link></Button>}
      />
    );
  }

  const title = overview.data?.collectors.find((c) => c.id === data?.collectorId)?.title ?? data?.collectorId ?? "";
  const view = data ? presentRun(data) : null;
  const rows = items.data?.items ?? [];
  const columns = rows.length ? Object.keys(rows[0]!) : [];
  const from = afterSeq + 2;

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-muted-foreground text-[13px]">
        <Link href="/dashboard/collectors" className="text-primary hover:underline">{t("breadcrumb.collectors")}</Link>
        <span aria-hidden="true"> / </span>
        <Link href="/dashboard/collectors/runs" className="text-primary hover:underline">{t("breadcrumb.runs")}</Link>
        <span aria-hidden="true"> / </span>
        {title}
      </nav>

      <DashboardSection title={title || t("title")} status={statusFromQueries(run)}>
        {data && view ? (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2.5">
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
                <span role={active ? "status" : undefined}>
                  <RunStatusBadge status={data.status} stopReason={data.stopReason} />
                </span>
              </div>
              <p className="text-muted-foreground font-mono text-xs">
                {t("run.started")} <RelativeTime date={data.createdAt} />
                {data.durationMs !== null ? <> · {t("run.took", { seconds: Math.max(1, Math.round(data.durationMs / 1000)) })}</> : null}
                {" · "}{t("run.deleted")} <RelativeTime date={data.expiresAt} />
              </p>
              {runTarget(data.input) ? (
                <p className="text-sm">
                  {t("run.input")}: <span className="font-mono text-[13px]">{runTarget(data.input)}</span>
                </p>
              ) : null}
            </div>

            <div className="border-border flex flex-col gap-1.5 rounded-xl border px-5 py-4">
              <p className="text-[15px] font-medium">
                {active ? (data.status === "queued" ? t("run.waiting") : t("run.collecting")) : view.stop ? t(`stop.${view.stop}`) : t(`status.${view.label}`)}
              </p>
              {active ? <p className="text-muted-foreground text-sm">{t("run.collectingHelp")}</p> : null}
              <p className="text-muted-foreground mt-1 font-mono text-xs">
                {t("run.counts", { rows: data.itemCount, pages: data.pagesFetched, skipped: data.invalidItemCount })}
              </p>
            </div>

            {data.itemCount > 0 ? (
              <DashboardSection
                title={t("run.rows")}
                status={statusFromQueries(items)}
                action={
                  active ? null : (
                    <div className="flex flex-wrap gap-2">
                      <Button asChild variant="ink" size="sm">
                        <a href={`/api/collectors/runs/${runId}/export?format=csv`}>{t("run.downloadCsv")}</a>
                      </Button>
                      <Button asChild variant="ink" size="sm">
                        <a href={`/api/collectors/runs/${runId}/export?format=json`}>{t("run.downloadJson")}</a>
                      </Button>
                    </div>
                  )
                }
              >
                <div className="border-border overflow-x-auto rounded-lg border">
                  <table className="w-full min-w-[640px] border-collapse text-[13px]">
                    <thead>
                      <tr>
                        {columns.map((c) => (
                          <th key={c} scope="col" className="text-muted-foreground border-border border-b px-3 py-2.5 text-left font-mono text-xs font-medium whitespace-nowrap">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row, i) => (
                        <tr key={afterSeq + 1 + i}>
                          {columns.map((c) => (
                            <td key={c} className="border-border border-b px-3 py-2.5 align-top">{cellText(row[c])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-muted-foreground font-mono text-xs">
                    {t("run.showing", { from, to: from + rows.length - 1, total: data.itemCount })}
                  </span>
                  <div className="flex gap-2">
                    {pageStarts.length > 1 ? (
                      <Button variant="outline" size="sm" onClick={() => setPageStarts([-1])}>{t("run.firstRows")}</Button>
                    ) : null}
                    {items.data?.nextSeq !== null && items.data?.nextSeq !== undefined ? (
                      <Button variant="outline" size="sm" onClick={() => setPageStarts((s) => [...s, items.data!.nextSeq!])}>{t("run.nextRows")}</Button>
                    ) : null}
                  </div>
                </div>
              </DashboardSection>
            ) : active ? (
              <div aria-hidden="true" className="border-border flex flex-col gap-2.5 rounded-lg border p-4">
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3.5 w-5/6" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{t("run.noRows")}</p>
            )}

            <details className="border-border border-t pt-3">
              <summary className="cursor-pointer text-[13px]">{t("run.log")}</summary>
              <pre className="bg-sidebar border-border mt-2.5 rounded-lg border p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap">
                {data.log.length ? data.log.join("\n") : t("run.emptyLog")}
              </pre>
            </details>
          </div>
        ) : null}
      </DashboardSection>
    </div>
  );
}
```

Downloads appear only once the run has ended (a file of a half-finished run would be misleading) and only when there are rows. The two download buttons are equal peers, so both are `ink` (DESIGN.md One Voice Rule).

```tsx
// src/app/[locale]/dashboard/(member)/collectors/runs/[runId]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { CollectorRun } from "@/components/collectors/collector-run";
import { collectorsEnabled } from "@/server/collectors/flags";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CollectorRunPage({ params }: { params: Promise<{ runId: string }> }) {
  if (!collectorsEnabled()) notFound();
  await requireDashboardSession();
  const { runId } = await params;
  return <CollectorRun runId={runId} />;
}
```

- [ ] **Step 4: Run tests, lint, typecheck** — same commands as Task 4, scoped to the new files → PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/data-collectors-screens
git add src/components/collectors/collector-run.tsx src/components/collectors/collector-run.test.tsx "src/app/[locale]/dashboard/(member)/collectors/runs/[runId]/page.tsx"
git commit -m "Collectors: run page with live status, honest stop reason, rows and downloads"
```

---

### Task 6: Run history

**Files:**
- Create: `src/components/collectors/run-history.tsx`, `src/components/collectors/run-history.test.tsx`, `src/app/[locale]/dashboard/(member)/collectors/runs/page.tsx`

**Interfaces:**
- Consumes: `api.collectors.runs` (cursor paging), `api.collectors.overview` (titles); `RunStatusBadge`, `presentRun`, `runTarget`.
- Produces: `<RunHistory />`.

Paging keeps a list of loaded cursors in state and renders one `RunHistoryPage` per cursor (each its own `useQuery`), so earlier pages stay on screen when "Older runs" loads the next one. This avoids `useInfiniteQuery` (not used for this router elsewhere) while keeping each query cacheable.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/components/collectors/run-history.test.tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "../../../messages/en.json";

const h = vi.hoisted(() => ({ runs: vi.fn(), overview: vi.fn() }));

vi.mock("@/trpc/react", () => ({
  api: { collectors: { runs: { useQuery: h.runs }, overview: { useQuery: h.overview } } },
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import { RunHistory } from "./run-history";

const ok = (data: unknown) => ({ data, isPending: false, isError: false, refetch: vi.fn() });
const run = (id: string, over: Record<string, unknown> = {}) => ({
  id, collectorId: "feed-items", status: "succeeded", stopReason: "complete", itemCount: 48,
  input: { url: "https://blog.example.org/feed.xml" },
  createdAt: "2026-10-03T10:00:00.000Z", expiresAt: "2026-11-02T10:00:00.000Z", ...over,
});

function renderHistory() {
  return render(
    <NextIntlClientProvider locale="en" messages={en} now={new Date("2026-10-03T12:00:00Z")} timeZone="UTC">
      <RunHistory />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  h.overview.mockReturnValue(ok({ collectors: [{ id: "feed-items", title: "Feed items" }], recentRuns: [], usage: { runsToday: 0, runsPerDay: 20 }, needsAcknowledgement: false }));
});

describe("RunHistory", () => {
  it("lists runs with status, rows and why they ended", () => {
    h.runs.mockReturnValue(ok({ runs: [run("r1"), run("r2", { status: "failed", stopReason: "robots_disallowed", itemCount: 0 })], nextCursor: null }));
    renderHistory();
    expect(h.runs).toHaveBeenCalledWith({ limit: 20 });
    expect(screen.getAllByRole("link", { name: /Feed items/ })[0]).toHaveAttribute("href", "/dashboard/collectors/runs/r1");
    expect(screen.getByText(en.collectors.stopShort.complete)).toBeInTheDocument();
    expect(screen.getByText(en.collectors.stopShort.robots_disallowed)).toBeInTheDocument();
    expect(screen.getByText(en.collectors.status.failed)).toBeInTheDocument();
  });

  it("loads older runs with the next cursor", () => {
    h.runs.mockImplementation((input: { cursor?: string }) =>
      ok(input.cursor ? { runs: [run("r3")], nextCursor: null } : { runs: [run("r1")], nextCursor: "c1" }),
    );
    renderHistory();
    fireEvent.click(screen.getByRole("button", { name: en.collectors.history.older }));
    expect(h.runs).toHaveBeenCalledWith({ limit: 20, cursor: "c1" });
    expect(screen.queryByRole("button", { name: en.collectors.history.older })).toBeNull();
  });

  it("teaches the next step when there are no runs", () => {
    h.runs.mockReturnValue(ok({ runs: [], nextCursor: null }));
    renderHistory();
    expect(screen.getByText(en.collectors.history.emptyTitle)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: en.collectors.history.chooseCollector })).toHaveAttribute("href", "/dashboard/collectors");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `SKIP_ENV_VALIDATION=1 pnpm vitest run src/components/collectors/run-history.test.tsx` → FAIL (module missing).

- [ ] **Step 3: Implement**

```tsx
// src/components/collectors/run-history.tsx
"use client";

import * as React from "react";
import { ListIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { runTarget } from "@/components/collectors/collectors-home";
import { RunStatusBadge } from "@/components/collectors/run-status-badge";
import { DashboardSection, statusFromQueries } from "@/components/dashboard/dashboard-section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RelativeTime } from "@/components/ui/relative-time";
import { Link } from "@/i18n/navigation";
import { presentRun } from "@/lib/collectors/run-presentation";
import { api, type RouterOutputs } from "@/trpc/react";

const PAGE = 20;
type Run = RouterOutputs["collectors"]["runs"]["runs"][number];
const COLUMNS = ["collector", "started", "status", "rows", "why", "deleted"] as const;

/**
 * My runs. The first page and every "older runs" page are separate queries
 * keyed by cursor, so loaded pages stay on screen and stay cached.
 */
export function RunHistory() {
  const t = useTranslations("collectors");
  const locale = useLocale() === "nl" ? "nl" : "en";
  const overview = api.collectors.overview.useQuery({ locale });
  const titles = new Map(overview.data?.collectors.map((c) => [c.id, c.title]));
  const first = api.collectors.runs.useQuery({ limit: PAGE });
  const [cursors, setCursors] = React.useState<string[]>([]);
  const [tailNext, setTailNext] = React.useState<string | null | undefined>(undefined);
  const ignore = React.useCallback(() => undefined, []);
  const nextCursor = cursors.length ? tailNext : first.data?.nextCursor;

  return (
    <div className="flex flex-col gap-4">
      <nav aria-label="Breadcrumb" className="text-muted-foreground text-[13px]">
        <Link href="/dashboard/collectors" className="text-primary hover:underline">{t("breadcrumb.collectors")}</Link>
        <span aria-hidden="true"> / </span>
        {t("breadcrumb.runs")}
      </nav>
      <DashboardSection
        title={t("history.title")}
        status={statusFromQueries(first, { isEmpty: first.data?.runs.length === 0 })}
        action={<span className="text-muted-foreground font-mono text-xs">{t("history.retention")}</span>}
        empty={
          <EmptyState
            icon={<ListIcon aria-hidden="true" />}
            title={t("history.emptyTitle")}
            description={t("history.emptyText")}
            action={<Button asChild><Link href="/dashboard/collectors">{t("history.chooseCollector")}</Link></Button>}
          />
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead>
              <tr>
                {COLUMNS.map((key) => (
                  <th key={key} scope="col" className="text-muted-foreground border-border border-b px-3 py-2.5 text-left font-mono text-xs font-medium whitespace-nowrap">
                    {t(`history.${key}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <HistoryRows runs={first.data?.runs ?? []} titles={titles} />
              {cursors.map((cursor, i) => (
                <HistoryPage
                  key={cursor}
                  cursor={cursor}
                  titles={titles}
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
              onClick={() => {
                setCursors((s) => [...s, nextCursor]);
                setTailNext(undefined);
              }}
            >
              {t("history.older")}
            </Button>
          </div>
        ) : null}
      </DashboardSection>
    </div>
  );
}

function HistoryPage({
  cursor,
  titles,
  onNext,
}: {
  cursor: string;
  titles: Map<string, string>;
  onNext: (next: string | null) => void;
}) {
  const page = api.collectors.runs.useQuery({ limit: PAGE, cursor });
  const next = page.data?.nextCursor;
  React.useEffect(() => {
    if (next !== undefined) onNext(next);
  }, [next, onNext]);
  return <HistoryRows runs={page.data?.runs ?? []} titles={titles} />;
}

function HistoryRows({ runs, titles }: { runs: Run[]; titles: Map<string, string> }) {
  const t = useTranslations("collectors");
  return (
    <>
      {runs.map((run) => {
        const view = presentRun(run);
        const target = runTarget(run.input);
        return (
          <tr key={run.id}>
            <td className="border-border border-b p-3 align-middle">
              <Link href={`/dashboard/collectors/runs/${run.id}`} className="font-medium hover:underline">
                {titles.get(run.collectorId) ?? run.collectorId}
              </Link>
              {target ? <div className="text-muted-foreground mt-0.5 font-mono text-xs">{target}</div> : null}
            </td>
            <td className="border-border text-muted-foreground border-b p-3 font-mono text-xs"><RelativeTime date={run.createdAt} /></td>
            <td className="border-border border-b p-3"><RunStatusBadge status={run.status} stopReason={run.stopReason} /></td>
            <td className="border-border border-b p-3 font-mono text-xs">{run.itemCount}</td>
            <td className="border-border text-muted-foreground border-b p-3 text-sm">{view.stop ? t(`stopShort.${view.stop}`) : "—"}</td>
            <td className="border-border text-muted-foreground border-b p-3 font-mono text-xs"><RelativeTime date={run.expiresAt} /></td>
          </tr>
        );
      })}
    </>
  );
}
```

```tsx
// src/app/[locale]/dashboard/(member)/collectors/runs/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RunHistory } from "@/components/collectors/run-history";
import { collectorsEnabled } from "@/server/collectors/flags";
import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function CollectorRunsPage() {
  if (!collectorsEnabled()) notFound();
  await requireDashboardSession();
  return <RunHistory />;
}
```

- [ ] **Step 4: Run tests, lint, typecheck** — as in Task 4, scoped to the new files → PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/data-collectors-screens
git add src/components/collectors/run-history.tsx src/components/collectors/run-history.test.tsx "src/app/[locale]/dashboard/(member)/collectors/runs/page.tsx"
git commit -m "Collectors: run history with status, reasons and older pages"
```

---

### Task 7: Streaming download route

**Files:**
- Create: `src/app/api/collectors/runs/[runId]/export/route.ts`, `src/app/api/collectors/runs/[runId]/export/route.test.ts`

**Interfaces:**
- Consumes: `liveCollectorRuns().exportRun(userId, runId, format)` → `{ filename, contentType, body: AsyncIterable<string> } | null`; `getSession` from `@/server/better-auth/server`; `collectorsEnabled`.
- Produces: `GET /api/collectors/runs/[runId]/export?format=csv|json`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/app/api/collectors/runs/[runId]/export/route.test.ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  enabled: true,
  session: { user: { id: "user-1" } } as { user: { id: string } } | null,
  exportRun: vi.fn(),
}));

vi.mock("@/server/collectors/flags", () => ({ collectorsEnabled: () => h.enabled }));
vi.mock("@/server/collectors/live", () => ({ liveCollectorRuns: () => ({ exportRun: h.exportRun }) }));
vi.mock("@/server/better-auth/server", () => ({ getSession: async () => h.session }));

import { GET } from "./route";

const params = (runId = "run-1") => ({ params: Promise.resolve({ runId }) });
const req = (format?: string) =>
  new Request(`https://x.test/api/collectors/runs/run-1/export${format ? `?format=${format}` : ""}`);

async function* chunks(...parts: string[]) {
  yield* parts;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.enabled = true;
  h.session = { user: { id: "user-1" } };
  h.exportRun.mockResolvedValue({ filename: "feed-items-abcd1234.csv", contentType: "text/csv; charset=utf-8", body: chunks("a,b\r\n", "1,2\r\n") });
});

describe("collector run export", () => {
  it("is not found while the feature is off", async () => {
    h.enabled = false;
    expect((await GET(req("csv"), params())).status).toBe(404);
    expect(h.exportRun).not.toHaveBeenCalled();
  });

  it("refuses a signed-out visitor", async () => {
    h.session = null;
    expect((await GET(req("csv"), params())).status).toBe(401);
  });

  it("refuses an unknown format", async () => {
    expect((await GET(req("xlsx"), params())).status).toBe(400);
    expect((await GET(req(), params())).status).toBe(400);
  });

  it("is not found for another member's run", async () => {
    h.exportRun.mockResolvedValue(null);
    expect((await GET(req("csv"), params())).status).toBe(404);
    expect(h.exportRun).toHaveBeenCalledWith("user-1", "run-1", "csv");
  });

  it("streams the file as a private download", async () => {
    const res = await GET(req("csv"), params());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="feed-items-abcd1234.csv"');
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe("a,b\r\n1,2\r\n");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `SKIP_ENV_VALIDATION=1 pnpm vitest run "src/app/api/collectors"` → FAIL (route missing).

- [ ] **Step 3: Implement**

```ts
// src/app/api/collectors/runs/[runId]/export/route.ts
import { NextResponse } from "next/server";

import { getSession } from "@/server/better-auth/server";
import { collectorsEnabled } from "@/server/collectors/flags";
import { liveCollectorRuns } from "@/server/collectors/live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORMATS = new Set(["csv", "json"] as const);
type Format = "csv" | "json";

function isFormat(value: string | null): value is Format {
  return value !== null && FORMATS.has(value as Format);
}

/** An async iterable of text chunks as a byte stream, read lazily. */
function toStream(body: AsyncIterable<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const iterator = body[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      const { value, done } = await iterator.next();
      if (done) controller.close();
      else controller.enqueue(encoder.encode(value));
    },
    async cancel() {
      await iterator.return?.();
    },
  });
}

/**
 * Download a run's dataset (spec: "Export"). Owner only: another member's run
 * answers 404, never 403. Streams page by page, so a 5,000-row run is never
 * held in memory whole.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  if (!collectorsEnabled()) return new NextResponse("Not found", { status: 404 });
  const session = await getSession();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

  const format = new URL(request.url).searchParams.get("format");
  if (!isFormat(format)) return new NextResponse("Unknown format", { status: 400 });

  const { runId } = await params;
  const file = await liveCollectorRuns().exportRun(session.user.id, runId, format);
  if (!file) return new NextResponse("Not found", { status: 404 });

  return new NextResponse(toStream(file.body), {
    status: 200,
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
```

The filename is built by the facade from the collector id (kebab-case) and the first 8 hex characters of the run's UUID, so it never contains a quote.

- [ ] **Step 4: Run tests, lint, typecheck** → PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/data-collectors-screens
git add "src/app/api/collectors/runs/[runId]/export/route.ts" "src/app/api/collectors/runs/[runId]/export/route.test.ts"
git commit -m "Collectors: streaming CSV/JSON download, owner only"
```

---

### Task 8: The public about page

**Files:**
- Create: `src/server/collectors/identity.ts`, `src/app/[locale]/collectors/about/page.tsx`, `src/app/[locale]/collectors/about/page.test.tsx`
- Modify: `src/server/collectors/context/live.ts`, `src/app/sitemap.ts`, `src/app/sitemap.test.ts`

**Interfaces:**
- Produces: `COLLECTOR_ROBOTS_TOKEN`, `COLLECTOR_USER_AGENT`, `COLLECTOR_ABOUT_PATH = "/collectors/about"`, `COLLECTOR_OPT_OUT_EMAIL = "info@klevox.com"` (identity.ts). `context/live.ts` imports the first two from here instead of defining them, so the worker and the page can never disagree.

- [ ] **Step 1: Write the failing tests**

```tsx
// src/app/[locale]/collectors/about/page.test.tsx
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
vi.mock("@/lib/metadata", () => ({
  localeAlternates: async () => ({}),
  buildOgMeta: () => ({}),
}));

import { COLLECTOR_OPT_OUT_EMAIL, COLLECTOR_ROBOTS_TOKEN, COLLECTOR_USER_AGENT } from "@/server/collectors/identity";
import CollectorAboutPage from "./page";

describe("collector about page", () => {
  it("shows the exact user agent, the robots.txt block and the opt-out address", async () => {
    render(await CollectorAboutPage());
    expect(screen.getByText(COLLECTOR_USER_AGENT)).toBeInTheDocument();
    expect(screen.getByText(`User-agent: ${COLLECTOR_ROBOTS_TOKEN}`, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: COLLECTOR_OPT_OUT_EMAIL })).toHaveAttribute("href", `mailto:${COLLECTOR_OPT_OUT_EMAIL}`);
  });

  it("names the page the user agent links to", () => {
    expect(COLLECTOR_USER_AGENT).toBe("aitcom-collector/1.0 (+https://aitcommunity.org/collectors/about)");
  });
});
```

In `src/app/sitemap.test.ts`, add `"/collectors/about"` to `STATIC_PATHS` right after `"/terms"`.

- [ ] **Step 2: Run to verify failure** — `SKIP_ENV_VALIDATION=1 pnpm vitest run "src/app/[locale]/collectors" src/app/sitemap.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/server/collectors/identity.ts
/**
 * How our data collector introduces itself (ADR-0040). The worker sends the
 * user agent; the public about page shows it. One source, so they agree.
 */
export const COLLECTOR_ROBOTS_TOKEN = "aitcom-collector";
export const COLLECTOR_ABOUT_PATH = "/collectors/about";
export const COLLECTOR_USER_AGENT = `${COLLECTOR_ROBOTS_TOKEN}/1.0 (+https://aitcommunity.org${COLLECTOR_ABOUT_PATH})`;
/** Where site owners ask to be added to the block list. */
export const COLLECTOR_OPT_OUT_EMAIL = "info@klevox.com";
```

In `src/server/collectors/context/live.ts`, delete the two local constants and add `import { COLLECTOR_ROBOTS_TOKEN, COLLECTOR_USER_AGENT } from "../identity";`. Keep re-exporting them from `live.ts` only if something imports them from there (grep first; prefer updating importers to `../identity`).

```tsx
// src/app/[locale]/collectors/about/page.tsx
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { ManPageLayout, ManPageSection } from "@/components/man-page-layout";
import { buildOgMeta, localeAlternates } from "@/lib/metadata";
import {
  COLLECTOR_ABOUT_PATH,
  COLLECTOR_OPT_OUT_EMAIL,
  COLLECTOR_ROBOTS_TOKEN,
  COLLECTOR_USER_AGENT,
} from "@/server/collectors/identity";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("collectorsAbout");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    ...buildOgMeta(t("metaTitle"), t("metaDescription")),
    alternates: await localeAlternates(COLLECTOR_ABOUT_PATH),
  };
}

const codeBlock = "bg-sidebar border-border text-foreground rounded-lg border p-3 font-mono text-[13px] whitespace-pre-wrap";

/** Public page for site owners: what our visitor is and how to block it. */
export default async function CollectorAboutPage() {
  const t = await getTranslations("collectorsAbout");
  return (
    <ManPageLayout pageName="COLLECTOR" lastUpdated={t("lastUpdated")}>
      <ManPageSection id="name" title={t("name")}>
        <p className="font-mono">{t("nameText")}</p>
      </ManPageSection>
      <ManPageSection id="description" title={t("description")}>
        <p>{t("descriptionText1")}</p>
        <p className="mt-2.5">{t("descriptionText2")}</p>
      </ManPageSection>
      <ManPageSection id="behaviour" title={t("behaves")}>
        <ul className="list-disc space-y-1 pl-5">
          <li>{t("behaves1")}</li>
          <li>{t("behaves2")}</li>
          <li>{t("behaves3")}</li>
          <li>{t("behaves4")}</li>
          <li>{t("behaves5")}</li>
        </ul>
      </ManPageSection>
      <ManPageSection id="user-agent" title={t("userAgent")}>
        <pre className={codeBlock}>{COLLECTOR_USER_AGENT}</pre>
      </ManPageSection>
      <ManPageSection id="blocking" title={t("blocking")}>
        <p>{t("blockingText")}</p>
        <pre className={`${codeBlock} mt-2.5`}>{`User-agent: ${COLLECTOR_ROBOTS_TOKEN}\nDisallow: /`}</pre>
        <p className="mt-2.5">
          {t.rich("blockingPartial", { example: () => <code className="font-mono text-[13px]">Disallow: /private/</code> })}
        </p>
      </ManPageSection>
      <ManPageSection id="opt-out" title={t("optOut")}>
        <p>
          {t.rich("optOutText", {
            email: () => (
              <a href={`mailto:${COLLECTOR_OPT_OUT_EMAIL}`} className="text-primary hover:underline">
                {COLLECTOR_OPT_OUT_EMAIL}
              </a>
            ),
          })}
        </p>
      </ManPageSection>
    </ManPageLayout>
  );
}
```

Both rich messages use empty tags (`<example></example>`, `<email></email>`, set in Task 1), filled by the tag functions above.

In `src/app/sitemap.ts`, add `"/collectors/about"` to `STATIC_PAGES` right after `"/terms"`.

- [ ] **Step 4: Run tests, lint, typecheck** — `SKIP_ENV_VALIDATION=1 pnpm vitest run "src/app/[locale]/collectors" src/app/sitemap.test.ts src/server/collectors src/lib/collectors && pnpm typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git branch --show-current   # must print feat/data-collectors-screens
git add src/server/collectors/identity.ts src/server/collectors/context/live.ts "src/app/[locale]/collectors/about/page.tsx" "src/app/[locale]/collectors/about/page.test.tsx" src/app/sitemap.ts src/app/sitemap.test.ts 
git commit -m "Collectors: public about page for site owners, one source for the user agent"
```

---

### Task 9: Spec update and full verification

**Files:**
- Modify: `docs/superpowers/specs/2026-10-03-data-collectors-design.md`

- [ ] **Step 1: Update the spec** — fix every old claim (grep the whole doc for `NEXT_PUBLIC_FEATURE_COLLECTORS`, `/dashboard/collectors`, `acknowledges once`, `Polls every`):
  - Feature flag: one server flag; the dashboard layout passes it to the tab bar; no `NEXT_PUBLIC_` flag.
  - Member UI: the routes from Global Constraints; first-use note shown while the member has no runs in their 30-day history, enforced by the router (`ACKNOWLEDGEMENT_REQUIRED`); downloads offered once a run has ended and has rows; quota refusals name the limit and, for the daily limit, the retry time.
  - Delivery slices: slice 2 marked with its plan path `docs/superpowers/plans/2026-10-03-data-collectors-screens.md`.

- [ ] **Step 2: Commit the spec, then verify the committed tree**

```bash
git branch --show-current   # must print feat/data-collectors-screens
git add docs/superpowers/specs/2026-10-03-data-collectors-design.md
git commit -m "Docs: data collectors spec reflects the shipped screens"
git status --short          # must be empty
```

Run: `pnpm check` → exit 0, no warnings in touched files.
Run: `SKIP_ENV_VALIDATION=1 pnpm test` → all pass.
Run: `RUN_DB_TESTS=1 SKIP_ENV_VALIDATION=1 NEON_LOCAL_PROXY=127.0.0.1:5433 DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/aitcom_test pnpm vitest run src/server/collectors` → pass, executed.
Run: `node scripts/check-i18n-parity.mjs` → no differences.
Run (CI parity): `SKIP_ENV_VALIDATION=true npx -y -p node@20 node node_modules/vitest/vitest.mjs run src/components/collectors src/lib/collectors src/server/api/routers/collectors.test.ts "src/app/api/collectors" "src/app/[locale]/collectors"` → pass.

Report every result with its output.

---

## Spec coverage (self-review)

| Spec item | Task |
|---|---|
| Dashboard tab, member-only, hard-gated | 3 (+ every page) |
| Collectors list: quiet list, kind badge, sample row | 3 |
| Start form generated from schema + hints; one renderer; first-use note | 4 |
| Start run is the one orange action | 4 |
| Run page: status icon+label, counts, plain stop reason, paged preview, CSV/JSON, log, 3 s polling | 5 |
| My runs: status, rows, expiry | 6 (+ recent runs in 3) |
| Three data states everywhere; EN + NL | 1, 3–6 |
| Public about page: UA, robots, rate limit, opt-out | 8 |
| Export endpoint | 7 |
| Flag off: tab hidden, start refused | 2, 3, 7 |
| MCP tools, more collectors, retention cron, blocklist admin | slices 3–5, out of this plan |
