# Brand Export + Public REST API — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement task-by-task. Checkbox (`- [ ]`) syntax.

**Goal:** Ship CSV download per brand + public JSON REST endpoint at stable URLs, rate-limited. No new data model.

**Architecture:** Next.js App Router route handlers at `src/app/api/benchmark/...` that call `benchmarkBrandsRouter.stats` via tRPC `createCaller`, re-format as CSV or clean JSON. Reuse existing IP rate-limit pattern from `src/server/agent/rate-limit.ts`.

**Tech stack:** Next.js 15 App Router · TypeScript · existing tRPC caller · existing rate-limit map.

**Spec:** `docs/superpowers/specs/2026-04-22-brand-export-public-api-design.md`.

---

## File Structure

**Created:**
- `src/server/benchmark/csv-serializer.ts` + `.test.ts` — pure helper, turns a stats payload into a CSV string.
- `src/server/benchmark/public-rate-limit.ts` — IP-based rate limiter (60 req/min), mirrors `checkPasswordResetRateLimit` pattern.
- `src/app/api/benchmark/export/brand/[slug]/route.ts` — CSV endpoint (path uses `[slug]` segment + `.csv` via `route.ts` returning CSV content; the URL itself ends in `/export/brand/:slug` and the `Content-Disposition` filename has `.csv`).
- `src/app/api/benchmark/public/brands/[slug]/route.ts` — JSON endpoint.
- `src/app/api/benchmark/public/route.ts` — discoverability index.

**Modified:**
- `src/app/[locale]/benchmark/brands/[slug]/_components/BrandHero.tsx` — add "Download CSV" button next to window picker.

**Notes:**
- Routing correction vs spec: Next.js App Router doesn't support literal `.csv` suffix in segment names. Use URL `/api/benchmark/export/brand/:slug` and set `Content-Type` + `Content-Disposition: attachment; filename="<slug>-<window>d.csv"`. Functionally identical.

---

## Task 1: CSV serializer (pure helper, TDD)

**Files:**
- Create: `src/server/benchmark/csv-serializer.ts`
- Test: `src/server/benchmark/csv-serializer.test.ts`

- [ ] **Step 1: Write failing test**

```typescript
// src/server/benchmark/csv-serializer.test.ts
import { describe, expect, it } from "vitest";
import { serializeBrandStatsCsv } from "./csv-serializer";

describe("serializeBrandStatsCsv", () => {
  it("emits header row + one row per model", () => {
    const csv = serializeBrandStatsCsv({
      perModel: [
        {
          modelId: "gpt-5",
          mentionsCount: 12,
          runsTotal: 34,
          visibilityPct: 35.29,
          avgRank: 2.4,
          sentimentPosPct: 80,
          sentimentNeuPct: 15,
          sentimentNegPct: 5,
        },
      ],
      topDomainsByModel: { "gpt-5": "reddit.com" },
    });
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe(
      "model_id,mentions_count,runs_total,visibility_pct,avg_rank,sentiment_pos_pct,sentiment_neu_pct,sentiment_neg_pct,top_citation_domain",
    );
    expect(lines[1]).toBe("gpt-5,12,34,35.29,2.40,80,15,5,reddit.com");
  });

  it("quotes domain containing a comma", () => {
    const csv = serializeBrandStatsCsv({
      perModel: [
        {
          modelId: "m",
          mentionsCount: 1,
          runsTotal: 1,
          visibilityPct: 100,
          avgRank: null,
          sentimentPosPct: 0,
          sentimentNeuPct: 0,
          sentimentNegPct: 0,
        },
      ],
      topDomainsByModel: { m: "a,b.com" },
    });
    expect(csv.split("\n")[1]).toBe(`m,1,1,100.00,,0,0,0,"a,b.com"`);
  });

  it("emits empty cell for null avg_rank", () => {
    const csv = serializeBrandStatsCsv({
      perModel: [
        {
          modelId: "m",
          mentionsCount: 1,
          runsTotal: 1,
          visibilityPct: 50,
          avgRank: null,
          sentimentPosPct: 0,
          sentimentNeuPct: 0,
          sentimentNegPct: 0,
        },
      ],
      topDomainsByModel: {},
    });
    expect(csv.split("\n")[1]).toBe("m,1,1,50.00,,0,0,0,");
  });

  it("returns header-only when perModel is empty", () => {
    const csv = serializeBrandStatsCsv({ perModel: [], topDomainsByModel: {} });
    expect(csv.trim().split("\n")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run, fail**

`pnpm vitest run src/server/benchmark/csv-serializer.test.ts` — expect "Cannot find module".

- [ ] **Step 3: Implement**

```typescript
// src/server/benchmark/csv-serializer.ts
export interface PerModelRow {
  modelId: string;
  mentionsCount: number;
  runsTotal: number;
  visibilityPct: number;
  avgRank: number | null;
  sentimentPosPct: number;
  sentimentNeuPct: number;
  sentimentNegPct: number;
}

export interface CsvInput {
  perModel: PerModelRow[];
  topDomainsByModel: Record<string, string | undefined>;
}

const HEADER = [
  "model_id",
  "mentions_count",
  "runs_total",
  "visibility_pct",
  "avg_rank",
  "sentiment_pos_pct",
  "sentiment_neu_pct",
  "sentiment_neg_pct",
  "top_citation_domain",
].join(",");

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function serializeBrandStatsCsv(input: CsvInput): string {
  const rows = input.perModel.map((r) =>
    [
      csvCell(r.modelId),
      csvCell(r.mentionsCount),
      csvCell(r.runsTotal),
      csvCell(r.visibilityPct.toFixed(2)),
      csvCell(r.avgRank === null ? null : r.avgRank.toFixed(2)),
      csvCell(r.sentimentPosPct),
      csvCell(r.sentimentNeuPct),
      csvCell(r.sentimentNegPct),
      csvCell(input.topDomainsByModel[r.modelId]),
    ].join(","),
  );
  return [HEADER, ...rows].join("\n") + "\n";
}
```

- [ ] **Step 4: Run, pass**

`pnpm vitest run src/server/benchmark/csv-serializer.test.ts` — 4 passed.

- [ ] **Step 5: Commit**

```
git add src/server/benchmark/csv-serializer.ts src/server/benchmark/csv-serializer.test.ts
git commit -m "feat(benchmark): CSV serializer for brand stats export"
```

---

## Task 2: Public IP rate-limit helper

**Files:**
- Create: `src/server/benchmark/public-rate-limit.ts`

- [ ] **Step 1: Implement**

Mirror the pattern from `src/server/agent/rate-limit.ts:82-114` (`checkPasswordResetRateLimit`):

```typescript
// src/server/benchmark/public-rate-limit.ts
const windows = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;

export function checkPublicApiRateLimit(ip: string): {
  allowed: boolean;
  remaining: number;
  retryAfterSecs: number;
} {
  const now = Date.now();
  const window = windows.get(ip);

  if (!window || now > window.resetAt) {
    windows.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, remaining: MAX_REQUESTS - 1, retryAfterSecs: 0 };
  }

  if (window.count >= MAX_REQUESTS) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSecs: Math.ceil((window.resetAt - now) / 1000),
    };
  }

  window.count++;
  return {
    allowed: true,
    remaining: MAX_REQUESTS - window.count,
    retryAfterSecs: 0,
  };
}

/**
 * Derive client IP from Next.js Request headers. Vercel/Cloudflare set
 * x-forwarded-for. Falls back to a sentinel string so the map never keys on
 * undefined.
 */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

export function isSameOriginRequest(req: Request): boolean {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite === "same-origin" || fetchSite === "same-site") return true;
  return false;
}
```

- [ ] **Step 2: Typecheck**

`pnpm typecheck` — exit 0.

- [ ] **Step 3: Commit**

```
git add src/server/benchmark/public-rate-limit.ts
git commit -m "feat(benchmark): IP rate limiter for public API endpoints"
```

---

## Task 3: Public JSON endpoint

**Files:**
- Create: `src/app/api/benchmark/public/brands/[slug]/route.ts`

- [ ] **Step 1: Implement**

```typescript
// src/app/api/benchmark/public/brands/[slug]/route.ts
import { NextResponse } from "next/server";
import { createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import {
  checkPublicApiRateLimit,
  getClientIp,
  isSameOriginRequest,
} from "@/server/benchmark/public-rate-limit";

const ALLOWED_WINDOWS = new Set([7, 30, 90]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isSameOriginRequest(req)) {
    const ip = getClientIp(req);
    const rl = checkPublicApiRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate-limited", retryAfter: rl.retryAfterSecs },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
      );
    }
  }

  const { slug } = await params;
  const url = new URL(req.url);
  const windowRaw = Number(url.searchParams.get("window") ?? "30");
  const modelId = url.searchParams.get("modelId") ?? undefined;

  if (!ALLOWED_WINDOWS.has(windowRaw)) {
    return NextResponse.json(
      { error: "invalid-window", allowed: [7, 30, 90] },
      { status: 400 },
    );
  }

  const ctx = await createTRPCContext({ headers: new Headers(req.headers) });
  const caller = createCaller(ctx);
  const stats = await caller.benchmark.brands.stats({
    slug,
    window: windowRaw as 7 | 30 | 90,
    modelId,
  });

  if (!stats) {
    return NextResponse.json({ error: "brand-not-found" }, { status: 404 });
  }

  return NextResponse.json({ version: "v1-unstable", ...stats });
}
```

- [ ] **Step 2: Verify `createCaller` + `createTRPCContext` import paths**

Grep the repo for how other route handlers construct a caller. If the shape differs from the above, follow the working pattern. (Task 11 of the prior sub-project used `createCaller(await createTRPCContext({ headers: new Headers() }))`.)

- [ ] **Step 3: Typecheck**

`pnpm typecheck` — exit 0.

- [ ] **Step 4: Smoke test**

Start dev server in background (if not already):

```bash
pnpm dev
```

Then in another shell:
```bash
curl -s "http://localhost:3000/api/benchmark/public/brands/openai?window=30" | head -30
curl -s "http://localhost:3000/api/benchmark/public/brands/not-a-real-slug" | head -3
curl -s "http://localhost:3000/api/benchmark/public/brands/openai?window=99" | head -3
```

Expected outputs:
- First: JSON starting with `{"version":"v1-unstable",...`
- Second: `{"error":"brand-not-found"}`
- Third: `{"error":"invalid-window","allowed":[7,30,90]}`

Stop dev server when done.

- [ ] **Step 5: Commit**

```
git add src/app/api/benchmark/public/brands/[slug]/route.ts
git commit -m "feat(benchmark): public JSON REST endpoint for brand stats"
```

---

## Task 4: CSV export endpoint

**Files:**
- Create: `src/app/api/benchmark/export/brand/[slug]/route.ts`

- [ ] **Step 1: Implement**

```typescript
// src/app/api/benchmark/export/brand/[slug]/route.ts
import { NextResponse } from "next/server";
import { createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { serializeBrandStatsCsv } from "@/server/benchmark/csv-serializer";
import {
  checkPublicApiRateLimit,
  getClientIp,
  isSameOriginRequest,
} from "@/server/benchmark/public-rate-limit";

const ALLOWED_WINDOWS = new Set([7, 30, 90]);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!isSameOriginRequest(req)) {
    const ip = getClientIp(req);
    const rl = checkPublicApiRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "rate-limited", retryAfter: rl.retryAfterSecs },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSecs) } },
      );
    }
  }

  const { slug } = await params;
  const url = new URL(req.url);
  const windowRaw = Number(url.searchParams.get("window") ?? "30");

  if (!ALLOWED_WINDOWS.has(windowRaw)) {
    return NextResponse.json(
      { error: "invalid-window", allowed: [7, 30, 90] },
      { status: 400 },
    );
  }
  const windowDays = windowRaw as 7 | 30 | 90;

  const ctx = await createTRPCContext({ headers: new Headers(req.headers) });
  const caller = createCaller(ctx);
  const stats = await caller.benchmark.brands.stats({ slug, window: windowDays });

  if (!stats) {
    return NextResponse.json({ error: "brand-not-found" }, { status: 404 });
  }

  // Fetch top-domain-per-model from the stats shape (best effort: pick the
  // single highest-count domain across all models as a shared top). The
  // stats endpoint returns aggregated citations, not per-model, so we
  // approximate by using the single overall top domain.
  const topDomain = stats.citations[0]?.domain;
  const topDomainsByModel: Record<string, string> = {};
  for (const r of stats.perModel) {
    if (topDomain) topDomainsByModel[r.modelId] = topDomain;
  }

  const csv = serializeBrandStatsCsv({
    perModel: stats.perModel.map((r) => ({
      modelId: r.modelId,
      mentionsCount: r.mentionsCount,
      runsTotal: r.runsTotal,
      visibilityPct: r.visibilityPct,
      avgRank: r.avgRank,
      sentimentPosPct: r.sentimentPosPct,
      sentimentNeuPct: r.sentimentNeuPct,
      sentimentNegPct: r.sentimentNegPct,
    })),
    topDomainsByModel,
  });

  const filename = `${slug}-${windowDays}d.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "public, max-age=60",
    },
  });
}
```

- [ ] **Step 2: Typecheck**

`pnpm typecheck` — exit 0.

- [ ] **Step 3: Smoke test**

With dev server running:
```bash
curl -s -I "http://localhost:3000/api/benchmark/export/brand/openai?window=30"
curl -s "http://localhost:3000/api/benchmark/export/brand/openai?window=30" | head -5
```

Expected: headers include `content-type: text/csv` and `content-disposition: attachment; filename="openai-30d.csv"`. Body first line is the header row.

- [ ] **Step 4: Commit**

```
git add src/app/api/benchmark/export/brand/[slug]/route.ts
git commit -m "feat(benchmark): CSV export endpoint for brand stats"
```

---

## Task 5: Discoverability index

**Files:**
- Create: `src/app/api/benchmark/public/route.ts`

- [ ] **Step 1: Implement**

```typescript
// src/app/api/benchmark/public/route.ts
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    version: "v1-unstable",
    endpoints: {
      brandStats: "/api/benchmark/public/brands/:slug?window=7|30|90",
      brandExportCsv: "/api/benchmark/export/brand/:slug?window=7|30|90",
    },
    rateLimit: "60 requests per minute per IP",
  });
}
```

- [ ] **Step 2: Commit**

```
git add src/app/api/benchmark/public/route.ts
git commit -m "feat(benchmark): public API discoverability index"
```

---

## Task 6: CSV download button on brand page

**Files:**
- Modify: `src/app/[locale]/benchmark/brands/[slug]/_components/BrandHero.tsx`

- [ ] **Step 1: Add a "Download CSV" link/button**

In `BrandHero.tsx`, inside the window-picker flex row (currently `<div className="flex gap-1">` with the 7d/30d/90d buttons), add a sibling element. Replace the `<div className="flex gap-1">...` block with:

```tsx
<div className="flex items-center gap-3">
  <a
    href={`/api/benchmark/export/brand/${encodeURIComponent(slug)}?window=${windowDays}`}
    className="text-muted-foreground hover:text-foreground text-xs underline"
    download
  >
    Download CSV
  </a>
  <div className="flex gap-1">
    {([7, 30, 90] as const).map((w) => (
      <button
        key={w}
        onClick={() => onWindowChange(w)}
        className={`rounded border px-3 py-1 text-sm ${
          w === windowDays ? "bg-primary text-primary-foreground" : ""
        }`}
      >
        {w}d
      </button>
    ))}
  </div>
</div>
```

The component prop interface must gain a `slug: string` field so the link can be built:

Change the `Props` interface to add `slug: string`, and update the function signature destructure accordingly (`export function BrandHero({ brand, primaryCategoryId, categoriesById, hero, windowDays, onWindowChange, slug }: Props)`).

- [ ] **Step 2: Update the page to pass slug**

Open `src/app/[locale]/benchmark/brands/[slug]/page.tsx`. Find the `<BrandHero ... />` render and add `slug={slug}` to the props.

- [ ] **Step 3: Typecheck + lint**

`pnpm typecheck` — exit 0.
`pnpm lint` — exit 0.

- [ ] **Step 4: Manual smoke**

With dev server running, open `http://localhost:3000/en/benchmark/brands/openai`. Confirm "Download CSV" link shows next to the window picker and, when clicked, downloads `openai-30d.csv` (default window) or `openai-Nd.csv` matching the active window. Open the file — header + model rows, no errors.

- [ ] **Step 5: Commit**

```
git add src/app/[locale]/benchmark/brands/[slug]/_components/BrandHero.tsx src/app/[locale]/benchmark/brands/[slug]/page.tsx
git commit -m "feat(benchmark): Download CSV button on brand page"
```

---

## Task 7: Final checks

- [ ] `pnpm typecheck` clean.
- [ ] `pnpm lint` clean.
- [ ] `pnpm vitest run src/server/benchmark` — 32 tests pass (31 existing + 4 new in csv-serializer = 35).
- [ ] Curl all four public URLs once more to confirm end-to-end.
- [ ] No uncommitted files apart from the pre-existing `src/payload-types.ts`.

## Known caveats

- `topDomainsByModel` in the CSV uses the overall brand top domain for every model row — the current `brands.stats` endpoint doesn't expose per-model citation domains. Either accept (v1 best-effort) or extend `brands.stats` in a follow-up. Not a blocker.
- In-memory rate-limit is per process. On Vercel/serverless each lambda has its own map, so effective limit is higher than 60/min in aggregate. Acceptable for v1; move to a shared Redis if abuse is observed.
