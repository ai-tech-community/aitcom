# PEEC-Style Agent Benchmark Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the benchmark into a PEEC-style public brand intelligence surface powered by user-owned agent submissions, with richer brand profile metrics, grounded recommendations, better source intelligence, and guided agent assignments.

**Architecture:** Build on the existing benchmark stack instead of creating a second system. Extend server-side benchmark helpers and tRPC routers first, add focused unit tests, then update the brand page and MCP workflow so user agents submit higher-quality evidence.

**Tech Stack:** Next.js 15 App Router, React 19, tRPC, Drizzle ORM, Neon Postgres, Vitest, Recharts, MCP SDK, OpenRouter for grounded recommendation synthesis.

---

### Task 1: Grounded Recommendation Model

**Files:**
- Modify: `src/server/benchmark/strategy.ts`
- Modify: `src/server/benchmark/strategy.test.ts`
- Modify: `src/server/api/routers/benchmark-brands.ts`
- Modify: `src/app/[locale]/benchmark/brands/[slug]/_components/StrategyPanel.tsx`

**Step 1: Write failing parser tests**

Add tests for the richer recommendation shape:

```ts
it("parses grounded recommendations with evidence fields", () => {
  const r = parseStrategyResponse(
    JSON.stringify({
      recommendations: [
        {
          title: "Publish comparison pages for small-team CRM prompts",
          priority: "high",
          why: "Competitors appear in prompts where this brand has no visibility.",
          evidence: ["HubSpot appears in 4 weak prompts", "Salesforce appears in 3 weak prompts"],
          suggestedAction: "Create comparison and use-case pages matching those prompts.",
          relatedPrompts: ["Best CRM for small teams?"],
          relatedCompetitors: ["HubSpot", "Salesforce"],
          relatedSources: ["g2.com", "zapier.com"],
          expectedMetricImpact: "Improve visibility and average position on comparison prompts.",
        },
      ],
    }),
  );

  expect(r[0]).toMatchObject({
    title: "Publish comparison pages for small-team CRM prompts",
    priority: "high",
    suggestedAction: "Create comparison and use-case pages matching those prompts.",
  });
  expect(r[0]?.evidence).toHaveLength(2);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/benchmark/strategy.test.ts`

Expected: FAIL because `priority`, `why`, `evidence`, `suggestedAction`, `relatedPrompts`, `relatedCompetitors`, `relatedSources`, and `expectedMetricImpact` are not parsed yet.

**Step 3: Extend recommendation types and parser**

Replace the minimal `Recommendation` type with:

```ts
export type Priority = "low" | "medium" | "high";

export interface Recommendation {
  title: string;
  priority: Priority;
  why: string;
  evidence: string[];
  suggestedAction: string;
  relatedPrompts: string[];
  relatedCompetitors: string[];
  relatedSources: string[];
  expectedMetricImpact: string;
}
```

Keep backward compatibility in `parseStrategyResponse` by accepting old `severity` and `rationale` fields:

```ts
const priority =
  typeof o.priority === "string" && PRIORITIES.includes(o.priority as Priority)
    ? (o.priority as Priority)
    : typeof o.severity === "string" && PRIORITIES.includes(o.severity as Priority)
      ? (o.severity as Priority)
      : "medium";

const why = stringOrEmpty(o.why) || stringOrEmpty(o.rationale);
```

Add a helper:

```ts
function stringArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .map((v) => v.trim().slice(0, maxLen))
    .slice(0, maxItems);
}
```

**Step 4: Add deterministic insight candidates**

In `strategy.ts`, add:

```ts
export type StrategyInsight =
  | { type: "low_visibility"; severity: Priority; evidence: string[] }
  | { type: "competitor_gap"; severity: Priority; competitor: string; evidence: string[] }
  | { type: "source_gap"; severity: Priority; domain: string; evidence: string[] }
  | { type: "prompt_opportunity"; severity: Priority; prompt: string; evidence: string[] }
  | { type: "sentiment_gap"; severity: Priority; modelId: string; evidence: string[] };
```

Add `buildStrategyInsights(input: StrategyInput): StrategyInsight[]` using simple thresholds:

- `low_visibility` when visibility is below `20`.
- `competitor_gap` for competitors at least `10` points above subject visibility.
- `source_gap` for top citation domains with count `>= 2`.
- `prompt_opportunity` for top prompts with mentions but weak overall visibility.
- `sentiment_gap` for models with positive sentiment below `40`.

**Step 5: Update LLM prompt to use insights**

Modify `generateStrategy` to call `buildStrategyInsights(input)` and include a JSON block named `EVIDENCE_INSIGHTS`. Update output schema to the richer recommendation shape. Instruct the model: "Use only the evidence above. Do not invent domains, prompts, or competitors."

**Step 6: Update router and panel**

`benchmark-brands.ts` can keep calling `generateStrategy`, but must pass enough `competitors`, `citations`, and `topPrompts` data for insight generation.

Update `StrategyPanel.tsx` to render:

- priority badge
- title
- why
- suggested action
- evidence bullets
- related prompt/source/competitor chips when present

**Step 7: Verify**

Run:

```bash
pnpm vitest run src/server/benchmark/strategy.test.ts
pnpm typecheck
```

Expected: strategy tests pass and TypeScript passes.

**Step 8: Commit**

```bash
git add src/server/benchmark/strategy.ts src/server/benchmark/strategy.test.ts src/server/api/routers/benchmark-brands.ts "src/app/[locale]/benchmark/brands/[slug]/_components/StrategyPanel.tsx"
git commit -m "feat(benchmark): ground brand recommendations in evidence"
```

### Task 2: PEEC-Style Metric Summary For Brand Stats

**Files:**
- Modify: `src/server/api/routers/benchmark-brands.ts`
- Create: `src/server/benchmark/brand-metrics.ts`
- Create: `src/server/benchmark/brand-metrics.test.ts`
- Modify: `src/app/[locale]/benchmark/brands/[slug]/page.tsx`
- Create: `src/app/[locale]/benchmark/brands/[slug]/_components/MetricCards.tsx`

**Step 1: Write failing metric helper tests**

Create tests for:

```ts
expect(computeShareOfVoice({ brandMentions: 5, totalMentions: 20 })).toBe(25);
expect(computeAveragePosition([1, 2, null, 5])).toBe(2.67);
expect(computeCitationRate({ citedRuns: 3, totalRuns: 10 })).toBe(30);
expect(computeVisibility({ mentions: 4, totalRuns: 8 })).toBe(50);
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/benchmark/brand-metrics.test.ts`

Expected: FAIL because helper file does not exist.

**Step 3: Implement pure metric helpers**

Create `brand-metrics.ts` with:

```ts
export function pct(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

export function computeVisibility(input: { mentions: number; totalRuns: number }): number {
  return pct(input.mentions, input.totalRuns);
}

export function computeShareOfVoice(input: { brandMentions: number; totalMentions: number }): number {
  return pct(input.brandMentions, input.totalMentions);
}

export function computeAveragePosition(ranks: Array<number | null | undefined>): number | null {
  const valid = ranks.filter((r): r is number => typeof r === "number" && Number.isFinite(r));
  if (valid.length === 0) return null;
  return Number((valid.reduce((a, r) => a + r, 0) / valid.length).toFixed(2));
}

export function computeCitationRate(input: { citedRuns: number; totalRuns: number }): number {
  return pct(input.citedRuns, input.totalRuns);
}
```

**Step 4: Extend `brands.stats`**

Add `metricSummary` to the returned object:

```ts
metricSummary: {
  visibilityPct,
  shareOfVoicePct,
  avgPosition,
  sentimentScore,
  sourceVisibilityPct,
  citationRatePct,
  sampleSize: totalRuns,
}
```

Use raw SQL for `shareOfVoicePct`, `avgPosition`, and citation distinct-run counts in the same window:

- total mentions in the brand's primary category/window
- brand ranks from `benchmark_brand_mention`
- distinct runs from `benchmark_citation`

Keep nulls safe and return `0` or `null` instead of throwing when data is sparse.

**Step 5: Add metric cards UI**

Create `MetricCards.tsx` with six compact cards:

- Visibility
- Share of Voice
- Avg Position
- Sentiment
- Source Visibility
- Citation Rate

Use existing Tailwind/card conventions. Include sample size in a small muted line. Avoid oversized marketing hero styling.

**Step 6: Render metric cards**

In `page.tsx`, render `<MetricCards summary={s.metricSummary} />` directly below `<BrandHero />`.

**Step 7: Verify**

Run:

```bash
pnpm vitest run src/server/benchmark/brand-metrics.test.ts
pnpm typecheck
```

Expected: tests and typecheck pass.

**Step 8: Commit**

```bash
git add src/server/benchmark/brand-metrics.ts src/server/benchmark/brand-metrics.test.ts src/server/api/routers/benchmark-brands.ts "src/app/[locale]/benchmark/brands/[slug]/page.tsx" "src/app/[locale]/benchmark/brands/[slug]/_components/MetricCards.tsx"
git commit -m "feat(benchmark): add peec-style brand metric summary"
```

### Task 3: Source Intelligence Upgrade

**Files:**
- Modify: `src/server/benchmark/extract-citations-ingest.ts`
- Modify: `src/server/benchmark/extract-citations-ingest.test.ts`
- Modify: `src/server/api/routers/benchmark-brands.ts`
- Modify: `src/app/[locale]/benchmark/brands/[slug]/_components/CitationsPanel.tsx`

**Step 1: Write failing source classification tests**

Add tests for a helper named `classifySourceDomain`:

```ts
expect(classifySourceDomain("example.com", ["example.com"])).toBe("owned-site");
expect(classifySourceDomain("reddit.com", [])).toBe("user-generated");
expect(classifySourceDomain("wikipedia.org", [])).toBe("reference");
expect(classifySourceDomain("g2.com", [])).toBe("third-party");
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/benchmark/extract-citations-ingest.test.ts`

Expected: FAIL because `classifySourceDomain` does not exist.

**Step 3: Implement classification helper**

Add:

```ts
export type SourceType =
  | "owned-site"
  | "user-generated"
  | "reference"
  | "third-party"
  | "unknown";
```

Classify common domains conservatively:

- owned if domain matches brand owned domains passed to helper
- user-generated: `reddit.com`, `quora.com`, `stackoverflow.com`, `x.com`, `twitter.com`
- reference: `wikipedia.org`, `wikidata.org`
- third-party: known review/listing/editorial domains like `g2.com`, `capterra.com`, `zapier.com`, `alternativeto.net`
- unknown otherwise

**Step 4: Extend brand stats citation rows**

In `benchmark-brands.ts`, enrich citations before returning:

```ts
citations: citationRows.map((row) => ({
  domain: row.domain,
  count: Number(row.count),
  lastSeenAt: row.lastSeenAt,
  sourceType: classifySourceDomain(row.domain, ownedDomains),
  isOwned: ownedDomains.includes(row.domain),
}))
```

Build `ownedDomains` from `brand.website` for now. Defer multiple owned domains to a later migration.

**Step 5: Update citations panel**

Show:

- domain
- count
- source type badge
- owned-site marker when applicable
- last seen

**Step 6: Verify**

Run:

```bash
pnpm vitest run src/server/benchmark/extract-citations-ingest.test.ts
pnpm typecheck
```

Expected: tests and typecheck pass.

**Step 7: Commit**

```bash
git add src/server/benchmark/extract-citations-ingest.ts src/server/benchmark/extract-citations-ingest.test.ts src/server/api/routers/benchmark-brands.ts "src/app/[locale]/benchmark/brands/[slug]/_components/CitationsPanel.tsx"
git commit -m "feat(benchmark): classify brand citation sources"
```

### Task 4: Guided Agent Assignment Foundation

**Files:**
- Modify: `src/server/db/schema.ts`
- Create: `src/migrations/20260505_benchmark_assignments.ts`
- Modify: `src/server/api/routers/benchmark.ts`
- Modify: `src/app/api/mcp/benchmark-tools.ts`
- Create: `src/server/benchmark/assignment.ts`
- Create: `src/server/benchmark/assignment.test.ts`

**Step 1: Write failing assignment selection tests**

Create `assignment.test.ts`:

```ts
it("selects prompts with deterministic order and limit", () => {
  const prompts = [
    { id: "b", approvedAt: new Date("2026-01-02") },
    { id: "a", approvedAt: new Date("2026-01-01") },
  ];
  expect(selectAssignmentPrompts(prompts, 1).map((p) => p.id)).toEqual(["b"]);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/server/benchmark/assignment.test.ts`

Expected: FAIL because helper file does not exist.

**Step 3: Implement assignment helper**

Create:

```ts
export function selectAssignmentPrompts<T extends { approvedAt: Date | string; id: string }>(
  prompts: T[],
  limit: number,
): T[] {
  return [...prompts]
    .sort((a, b) => {
      const byDate = new Date(b.approvedAt).getTime() - new Date(a.approvedAt).getTime();
      return byDate || a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}
```

**Step 4: Add schema and migration**

Add `benchmarkAssignments` table:

- id uuid pk
- user_id text not null
- agent_id uuid nullable
- prompt_ids uuid[] not null
- model_provider text nullable
- model_id text nullable
- locale text not null default `en-US`
- status text not null default `active`
- created_at timestamptz
- completed_at timestamptz nullable

Add `assignment_id` nullable column to `benchmark_run` only if the current migration style makes this low-risk. If not, defer linking and store progress by matching submitted user/prompt/model/window.

**Step 5: Add tRPC procedures**

In `benchmark.ts`, add protected procedures:

- `createAssignment({ categorySlug?, intentSlug?, limit, modelProvider?, modelId?, locale? })`
- `getAssignment({ assignmentId })`
- `listMyAssignments()`

`createAssignment` should select approved prompts using `selectAssignmentPrompts`, insert the assignment, and return instructions text for the user's agent.

**Step 6: Update MCP tool schemas**

Add optional `assignmentId` to `submit-benchmark-run`. Update tool descriptions so agents preserve:

- full raw answer
- source/citation blocks
- markdown links
- model/channel metadata

If `assignmentId` is present, pass it through to `agentSubmitRun` after the router supports it.

**Step 7: Verify**

Run:

```bash
pnpm vitest run src/server/benchmark/assignment.test.ts
pnpm typecheck
pnpm db:generate
```

Expected: tests and typecheck pass; Drizzle generation either creates expected SQL or reports no changes if manual migration is sufficient.

**Step 8: Commit**

```bash
git add src/server/db/schema.ts src/migrations/20260505_benchmark_assignments.ts src/server/api/routers/benchmark.ts src/app/api/mcp/benchmark-tools.ts src/server/benchmark/assignment.ts src/server/benchmark/assignment.test.ts
git commit -m "feat(benchmark): add guided agent assignments"
```

### Task 5: Assignment UI Entry Point

**Files:**
- Modify: `src/app/[locale]/benchmark/_components/run-prompts-tab.tsx`
- Modify: `src/app/[locale]/benchmark/_components/agent-run-modal.tsx`
- Create: `src/app/[locale]/benchmark/_components/benchmark-assignment-panel.tsx`

**Step 1: Inspect existing run tab behavior**

Run:

```bash
rg -n "AgentRunModal|listApprovedPrompts|submitRun|tab=run" src/app/[locale]/benchmark
```

Expected: identify current prompt listing, modal entry points, and URL state.

**Step 2: Create assignment panel**

Add a compact panel above the prompt list with:

- category/intent-aware create assignment button
- model provider/model id inputs
- locale input
- generated agent instructions after creation
- progress copy: "Your agent runs these prompts and submits results through MCP."

**Step 3: Wire tRPC mutation**

Use `api.benchmark.createAssignment.useMutation()` and render returned prompt count and instruction text.

**Step 4: Improve agent run modal copy**

Update copy in `agent-run-modal.tsx` to emphasize:

- use the user's own agent
- submit the full answer
- preserve citations/sources
- include assignment id when present

**Step 5: Verify manually**

Run dev server:

```bash
pnpm dev
```

Open `/benchmark?tab=run`, create an assignment, and confirm the instruction block is usable and does not overlap on mobile or desktop.

**Step 6: Verify build checks**

Run:

```bash
pnpm typecheck
pnpm lint
```

Expected: both pass.

**Step 7: Commit**

```bash
git add "src/app/[locale]/benchmark/_components/run-prompts-tab.tsx" "src/app/[locale]/benchmark/_components/agent-run-modal.tsx" "src/app/[locale]/benchmark/_components/benchmark-assignment-panel.tsx"
git commit -m "feat(benchmark): add assignment workflow for user agents"
```

### Task 6: Final Verification And Documentation

**Files:**
- Modify: `docs/plans/2026-05-05-peec-style-agent-benchmark-design.md`
- Modify: `docs/plans/2026-05-05-peec-style-agent-benchmark.md`

**Step 1: Run full verification**

Run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

Expected: all pass.

**Step 2: Run focused benchmark seed smoke if needed**

If local database credentials are available:

```bash
pnpm benchmark:seed
```

Expected: benchmark seed completes without schema/runtime errors.

**Step 3: Document any deviations**

Update this plan with:

- tasks completed
- migration notes
- skipped checks and why
- follow-up items for source-detail schema or advanced aggregate slices

**Step 4: Commit final docs**

```bash
git add docs/plans/2026-05-05-peec-style-agent-benchmark-design.md docs/plans/2026-05-05-peec-style-agent-benchmark.md
git commit -m "docs: record peec-style benchmark implementation notes"
```
