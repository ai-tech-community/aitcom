# Brand Bias Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the correctness-quiz benchmark with a community-driven AI Brand Bias Benchmark — prompts submitted by members and approved by admins, runs submitted by member-owned agents, async extraction by a dogfooded AIT agent, and a tab-based dashboard surfacing brand trends across models and time.

**Architecture:** New Postgres tables in the existing `app` schema replace the old `benchmark_*` tables. A new tRPC `benchmark` router exposes prompt, run, and extraction endpoints. Runs fire `benchmark.run.created` activity events picked up by the existing `webhook-dispatch` cron, which delivers them to the registered extractor agent; the extractor posts structured mentions back via a new agent-authed endpoint. An hourly aggregation cron precomputes dashboard views. Frontend replaces the `/benchmark` page with a three-tab layout (Submit, Run, Dashboard) built on the existing shadcn `Tabs` primitive and Recharts for charts.

**Tech Stack:** TypeScript, Next.js 15 (App Router), Drizzle ORM, Postgres (Neon), Payload CMS 3, tRPC 11, better-auth, shadcn/radix-ui, Tailwind 4, Recharts (new dep), Vitest, Zod.

**Spec:** [docs/superpowers/specs/2026-04-20-brand-bias-benchmark-design.md](../specs/2026-04-20-brand-bias-benchmark-design.md)

---

## File Structure

**Create:**
- `src/migrations/20260420_brand_benchmark.ts` — drop old tables, create new ones.
- `src/lib/benchmark-constants.ts` — **rewrite** (same path, new constants: intents, model providers).
- `src/server/db/schema.ts` — **modify** to remove old benchmark tables and add the new ones.
- `src/server/benchmark/extractor-prompt.ts` — versioned extraction prompt.
- `src/server/benchmark/resolve-brand.ts` — alias resolution + queue logic.
- `src/server/benchmark/aggregate.ts` — aggregate table rebuild functions.
- `src/server/benchmark/weighting.ts` — outlier weight computation.
- `src/server/api/routers/benchmark.ts` — **rewrite** as new brand-bias router.
- `src/app/api/cron/benchmark-aggregate/route.ts` — hourly aggregate rebuild.
- `src/app/api/cron/benchmark-weights/route.ts` — nightly weight recompute.
- `src/app/[locale]/benchmark/page.tsx` — **rewrite** as tab shell.
- `src/app/[locale]/benchmark/_components/submit-prompt-tab.tsx`
- `src/app/[locale]/benchmark/_components/run-prompts-tab.tsx`
- `src/app/[locale]/benchmark/_components/dashboard-tab.tsx`
- `src/app/[locale]/benchmark/_components/widgets/prompt-focus.tsx`
- `src/app/[locale]/benchmark/_components/widgets/model-bias-matrix.tsx`
- `src/app/[locale]/benchmark/_components/widgets/brand-trend.tsx`
- `src/app/[locale]/benchmark/_components/widgets/category-leaderboard.tsx`
- `src/app/[locale]/benchmark/_components/widgets/brand-search.tsx`
- `src/app/[locale]/benchmark/_components/widgets/latest-runs-feed.tsx`
- `src/app/[locale]/benchmark/brands/[slug]/page.tsx` — brand profile page.
- `src/scripts/seed-benchmark.ts` — seed categories, intents, starter brands, sample prompts.
- `src/scripts/benchmark-extractor/run.ts` — standalone extractor agent (node script + README).
- `src/scripts/benchmark-extractor/README.md`
- Unit tests co-located as `*.test.ts` for each `src/server/benchmark/*.ts` and `src/lib/benchmark-constants.ts` (where logic exists).

**Modify:**
- `src/server/api/root.ts` — (no change needed; router still mounted under `benchmark`).
- `src/server/agent/webhook-dispatch.ts` — add `benchmark` category with `benchmark.` prefix.
- `package.json` — add `recharts` dep.
- `vercel.json` or whatever cron config the project uses — add two new cron entries.
- Payload collection configs — add admin views for prompt approval + brand alias triage.

**Delete (replaced):**
- None physically deleted; schemas and constants are rewritten in place.

---

## Phase 1 — Database Schema

### Task 1: Write migration dropping old + creating new benchmark tables

**Files:**
- Create: `src/migrations/20260420_brand_benchmark.ts`

- [ ] **Step 1: Create migration file**

```ts
// src/migrations/20260420_brand_benchmark.ts
import type { MigrateDownArgs, MigrateUpArgs } from "@payloadcms/db-postgres";
import { sql } from "@payloadcms/db-postgres";

export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Drop old correctness-quiz tables in dependency order.
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."benchmark_vote" CASCADE;
    DROP TABLE IF EXISTS "app"."benchmark_answer" CASCADE;
    DROP TABLE IF EXISTS "app"."benchmark_run" CASCADE;
    DROP TABLE IF EXISTS "app"."benchmark_question" CASCADE;
  `);

  // Categories (self-referential tree)
  await db.execute(sql`
    CREATE TABLE "app"."benchmark_category" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "slug" text NOT NULL UNIQUE,
      "name" text NOT NULL,
      "parent_id" uuid REFERENCES "app"."benchmark_category"("id") ON DELETE SET NULL,
      "description" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "benchmark_category_parent_idx" ON "app"."benchmark_category"("parent_id");
  `);

  // Intents
  await db.execute(sql`
    CREATE TABLE "app"."benchmark_intent" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "slug" text NOT NULL UNIQUE,
      "name" text NOT NULL,
      "description" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Prompts
  await db.execute(sql`
    CREATE TABLE "app"."benchmark_prompt" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "text" text NOT NULL,
      "category_id" uuid NOT NULL REFERENCES "app"."benchmark_category"("id"),
      "intent_id" uuid NOT NULL REFERENCES "app"."benchmark_intent"("id"),
      "locale" text NOT NULL DEFAULT 'en-US',
      "status" text NOT NULL DEFAULT 'pending',
      "submitted_by_user_id" text NOT NULL REFERENCES "public"."user"("id"),
      "approved_by_user_id" text REFERENCES "public"."user"("id"),
      "approved_at" timestamp with time zone,
      "notes" text,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX "benchmark_prompt_dedupe_idx"
      ON "app"."benchmark_prompt" (lower("text"), "category_id", "intent_id", "locale");
    CREATE INDEX "benchmark_prompt_status_idx" ON "app"."benchmark_prompt"("status");
    CREATE INDEX "benchmark_prompt_category_idx" ON "app"."benchmark_prompt"("category_id");
  `);

  // Brands
  await db.execute(sql`
    CREATE TABLE "app"."brand" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "canonical_name" text NOT NULL,
      "slug" text NOT NULL UNIQUE,
      "aliases" text[] NOT NULL DEFAULT ARRAY[]::text[],
      "website" text,
      "category_ids" uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
      "verified" boolean NOT NULL DEFAULT false,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "brand_canonical_idx" ON "app"."brand"(lower("canonical_name"));
  `);

  // Runs
  await db.execute(sql`
    CREATE TABLE "app"."benchmark_run" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "prompt_id" uuid NOT NULL REFERENCES "app"."benchmark_prompt"("id") ON DELETE CASCADE,
      "submitted_by_user_id" text NOT NULL REFERENCES "public"."user"("id"),
      "agent_id" uuid,
      "model_provider" text NOT NULL,
      "model_id" text NOT NULL,
      "model_version" text,
      "temperature" numeric,
      "raw_answer" text NOT NULL,
      "locale" text NOT NULL DEFAULT 'en-US',
      "captured_at" timestamp with time zone NOT NULL,
      "received_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "extraction_status" text NOT NULL DEFAULT 'pending',
      "extraction_attempts" integer NOT NULL DEFAULT 0,
      "weight" numeric NOT NULL DEFAULT 1.0,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "benchmark_run_prompt_model_time_idx"
      ON "app"."benchmark_run"("prompt_id", "model_id", "captured_at");
    CREATE INDEX "benchmark_run_extraction_status_idx"
      ON "app"."benchmark_run"("extraction_status");
    CREATE UNIQUE INDEX "benchmark_run_dedupe_idx"
      ON "app"."benchmark_run" (
        "submitted_by_user_id",
        "prompt_id",
        "model_id",
        date_trunc('day', "captured_at")
      );
  `);

  // Brand mentions
  await db.execute(sql`
    CREATE TABLE "app"."benchmark_brand_mention" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "run_id" uuid NOT NULL REFERENCES "app"."benchmark_run"("id") ON DELETE CASCADE,
      "raw_mention" text NOT NULL,
      "brand_id" uuid REFERENCES "app"."brand"("id") ON DELETE SET NULL,
      "rank" integer,
      "sentiment" text NOT NULL,
      "context" text,
      "confidence" numeric NOT NULL DEFAULT 0.5,
      "extractor_version" text NOT NULL,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX "benchmark_mention_brand_idx" ON "app"."benchmark_brand_mention"("brand_id");
    CREATE INDEX "benchmark_mention_run_idx" ON "app"."benchmark_brand_mention"("run_id");
  `);

  // Alias queue
  await db.execute(sql`
    CREATE TABLE "app"."brand_alias_queue" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "raw_mention" text NOT NULL,
      "suggested_brand_id" uuid REFERENCES "app"."brand"("id") ON DELETE SET NULL,
      "run_id" uuid REFERENCES "app"."benchmark_run"("id") ON DELETE SET NULL,
      "occurrence_count" integer NOT NULL DEFAULT 1,
      "status" text NOT NULL DEFAULT 'pending',
      "reviewed_by_user_id" text REFERENCES "public"."user"("id"),
      "reviewed_at" timestamp with time zone,
      "created_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX "brand_alias_queue_dedupe_idx"
      ON "app"."brand_alias_queue" (lower("raw_mention"));
    CREATE INDEX "brand_alias_queue_status_idx" ON "app"."brand_alias_queue"("status");
  `);

  // Aggregate tables
  await db.execute(sql`
    CREATE TABLE "app"."agg_brand_rank_by_prompt" (
      "prompt_id" uuid NOT NULL,
      "brand_id" uuid NOT NULL,
      "model_id" text NOT NULL,
      "window_days" integer NOT NULL,
      "mention_count" integer NOT NULL,
      "weighted_score" numeric NOT NULL,
      "avg_rank" numeric,
      "sentiment_positive_pct" numeric NOT NULL DEFAULT 0,
      "sentiment_neutral_pct" numeric NOT NULL DEFAULT 0,
      "sentiment_negative_pct" numeric NOT NULL DEFAULT 0,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("prompt_id", "brand_id", "model_id", "window_days")
    );

    CREATE TABLE "app"."agg_brand_trends_by_day" (
      "brand_id" uuid NOT NULL,
      "model_id" text NOT NULL,
      "category_id" uuid NOT NULL,
      "date" date NOT NULL,
      "mention_pct" numeric NOT NULL,
      "run_count" integer NOT NULL,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("brand_id", "model_id", "category_id", "date")
    );

    CREATE TABLE "app"."agg_model_bias_matrix" (
      "prompt_id" uuid NOT NULL,
      "model_id" text NOT NULL,
      "top_brand_ids" jsonb NOT NULL,
      "updated_at" timestamp with time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY ("prompt_id", "model_id")
    );
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS "app"."agg_model_bias_matrix" CASCADE;
    DROP TABLE IF EXISTS "app"."agg_brand_trends_by_day" CASCADE;
    DROP TABLE IF EXISTS "app"."agg_brand_rank_by_prompt" CASCADE;
    DROP TABLE IF EXISTS "app"."brand_alias_queue" CASCADE;
    DROP TABLE IF EXISTS "app"."benchmark_brand_mention" CASCADE;
    DROP TABLE IF EXISTS "app"."benchmark_run" CASCADE;
    DROP TABLE IF EXISTS "app"."brand" CASCADE;
    DROP TABLE IF EXISTS "app"."benchmark_prompt" CASCADE;
    DROP TABLE IF EXISTS "app"."benchmark_intent" CASCADE;
    DROP TABLE IF EXISTS "app"."benchmark_category" CASCADE;
  `);
}
```

- [ ] **Step 2: Register migration in index**

Open `src/migrations/index.ts` and add the new migration in timestamp order (should be the last entry). Follow the existing pattern — an import and an entry in the exported array.

- [ ] **Step 3: Run migration against dev DB**

Run: `pnpm db:migrate`
Expected: migration completes without error; old `benchmark_*` tables dropped; new tables exist. Verify with `pnpm db:studio` or `\dt app.*` in psql.

- [ ] **Step 4: Commit**

```bash
git add src/migrations/20260420_brand_benchmark.ts src/migrations/index.ts
git commit -m "feat(benchmark): replace quiz schema with brand-bias schema"
```

---

## Phase 2 — Drizzle Schema & Constants

### Task 2: Rewrite `benchmark-constants.ts`

**Files:**
- Modify (rewrite contents): `src/lib/benchmark-constants.ts`

- [ ] **Step 1: Replace file contents**

```ts
// src/lib/benchmark-constants.ts
export const BENCHMARK_PROMPT_STATUS = ["pending", "approved", "rejected"] as const;
export type BenchmarkPromptStatus = (typeof BENCHMARK_PROMPT_STATUS)[number];

export const BENCHMARK_EXTRACTION_STATUS = [
  "pending",
  "processing",
  "done",
  "failed",
] as const;
export type BenchmarkExtractionStatus = (typeof BENCHMARK_EXTRACTION_STATUS)[number];

export const BENCHMARK_MODEL_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "meta",
  "mistral",
  "xai",
  "other",
] as const;
export type BenchmarkModelProvider = (typeof BENCHMARK_MODEL_PROVIDERS)[number];

export const BENCHMARK_SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type BenchmarkSentiment = (typeof BENCHMARK_SENTIMENTS)[number];

export const BENCHMARK_DEFAULT_LOCALE = "en-US";

export const BENCHMARK_ALIAS_QUEUE_STATUS = ["pending", "merged", "rejected"] as const;
export type BenchmarkAliasQueueStatus = (typeof BENCHMARK_ALIAS_QUEUE_STATUS)[number];

export const SEED_INTENTS = [
  { slug: "recommendation", name: "Recommendation",
    description: "Asks the model to recommend one or more brands." },
  { slug: "comparison", name: "Comparison",
    description: "Asks the model to compare two or more named brands." },
  { slug: "best-for-persona", name: "Best for persona",
    description: "Asks the model to recommend the best brand for a specific user type." },
  { slug: "brand-recall", name: "Brand recall",
    description: "Asks the model to list brands the user should know about." },
  { slug: "ranked-list", name: "Ranked list",
    description: "Asks the model to produce a ranked list of brands." },
  { slug: "pros-cons", name: "Pros & cons",
    description: "Asks the model to list pros and cons of named brands." },
] as const;
```

- [ ] **Step 2: Verify no stale imports**

Run: `pnpm typecheck`
Expected: PASS. If there are errors referencing `BENCHMARK_TOPICS`, `BENCHMARK_DIFFICULTIES`, or their label maps, note each file. They will be fixed when the old `benchmark.ts` router is replaced (Task 10); leave them failing here only if they are solely in that router. If anything else imports them (frontend, etc.), make a note — it is also old benchmark code scheduled for replacement.

- [ ] **Step 3: Commit**

```bash
git add src/lib/benchmark-constants.ts
git commit -m "feat(benchmark): rewrite constants for brand-bias model"
```

### Task 3: Update `schema.ts` with new Drizzle tables

**Files:**
- Modify: `src/server/db/schema.ts`

- [ ] **Step 1: Remove old benchmark table exports**

Find and delete the declarations for `benchmarkQuestions`, `benchmarkRuns`, `benchmarkAnswers`, `benchmarkVotes` and any related relations/indexes. Use grep to find them:

Run: `rg "benchmarkQuestions|benchmarkAnswers|benchmarkVotes" src/server/db/schema.ts`

Delete each occurrence (the `pgTable`/`appSchema.table` declarations and any relation definitions).

- [ ] **Step 2: Add new tables**

At the appropriate section of `schema.ts` (follow the file's existing grouping — add under an "AI Brand Benchmark" section comment near the old location), add:

```ts
// ─── AI Brand Benchmark ──────────────────────────────────────────────────────

export const benchmarkCategories = appSchema.table(
  "benchmark_category",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    parentId: uuid("parent_id"),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parentIdx: index("benchmark_category_parent_idx").on(t.parentId),
  }),
);

export const benchmarkIntents = appSchema.table("benchmark_intent", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const benchmarkPrompts = appSchema.table(
  "benchmark_prompt",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    text: text("text").notNull(),
    categoryId: uuid("category_id").notNull(),
    intentId: uuid("intent_id").notNull(),
    locale: text("locale").notNull().default("en-US"),
    status: text("status").notNull().default("pending"),
    submittedByUserId: text("submitted_by_user_id").notNull(),
    approvedByUserId: text("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("benchmark_prompt_status_idx").on(t.status),
    categoryIdx: index("benchmark_prompt_category_idx").on(t.categoryId),
  }),
);

export const brands = appSchema.table("brand", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalName: text("canonical_name").notNull(),
  slug: text("slug").notNull().unique(),
  aliases: text("aliases").array().notNull().default(sql`ARRAY[]::text[]`),
  website: text("website"),
  categoryIds: uuid("category_ids").array().notNull().default(sql`ARRAY[]::uuid[]`),
  verified: boolean("verified").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const benchmarkRuns = appSchema.table(
  "benchmark_run",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    promptId: uuid("prompt_id").notNull(),
    submittedByUserId: text("submitted_by_user_id").notNull(),
    agentId: uuid("agent_id"),
    modelProvider: text("model_provider").notNull(),
    modelId: text("model_id").notNull(),
    modelVersion: text("model_version"),
    temperature: numeric("temperature"),
    rawAnswer: text("raw_answer").notNull(),
    locale: text("locale").notNull().default("en-US"),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    extractionStatus: text("extraction_status").notNull().default("pending"),
    extractionAttempts: integer("extraction_attempts").notNull().default(0),
    weight: numeric("weight").notNull().default("1.0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    promptModelTimeIdx: index("benchmark_run_prompt_model_time_idx").on(
      t.promptId, t.modelId, t.capturedAt),
    extractionStatusIdx: index("benchmark_run_extraction_status_idx").on(t.extractionStatus),
  }),
);

export const benchmarkBrandMentions = appSchema.table(
  "benchmark_brand_mention",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull(),
    rawMention: text("raw_mention").notNull(),
    brandId: uuid("brand_id"),
    rank: integer("rank"),
    sentiment: text("sentiment").notNull(),
    context: text("context"),
    confidence: numeric("confidence").notNull().default("0.5"),
    extractorVersion: text("extractor_version").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    brandIdx: index("benchmark_mention_brand_idx").on(t.brandId),
    runIdx: index("benchmark_mention_run_idx").on(t.runId),
  }),
);

export const brandAliasQueue = appSchema.table(
  "brand_alias_queue",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    rawMention: text("raw_mention").notNull(),
    suggestedBrandId: uuid("suggested_brand_id"),
    runId: uuid("run_id"),
    occurrenceCount: integer("occurrence_count").notNull().default(1),
    status: text("status").notNull().default("pending"),
    reviewedByUserId: text("reviewed_by_user_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    statusIdx: index("brand_alias_queue_status_idx").on(t.status),
  }),
);

export const aggBrandRankByPrompt = appSchema.table(
  "agg_brand_rank_by_prompt",
  {
    promptId: uuid("prompt_id").notNull(),
    brandId: uuid("brand_id").notNull(),
    modelId: text("model_id").notNull(),
    windowDays: integer("window_days").notNull(),
    mentionCount: integer("mention_count").notNull(),
    weightedScore: numeric("weighted_score").notNull(),
    avgRank: numeric("avg_rank"),
    sentimentPositivePct: numeric("sentiment_positive_pct").notNull().default("0"),
    sentimentNeutralPct: numeric("sentiment_neutral_pct").notNull().default("0"),
    sentimentNegativePct: numeric("sentiment_negative_pct").notNull().default("0"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
);

export const aggBrandTrendsByDay = appSchema.table("agg_brand_trends_by_day", {
  brandId: uuid("brand_id").notNull(),
  modelId: text("model_id").notNull(),
  categoryId: uuid("category_id").notNull(),
  date: date("date").notNull(),
  mentionPct: numeric("mention_pct").notNull(),
  runCount: integer("run_count").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const aggModelBiasMatrix = appSchema.table("agg_model_bias_matrix", {
  promptId: uuid("prompt_id").notNull(),
  modelId: text("model_id").notNull(),
  topBrandIds: jsonb("top_brand_ids").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```

Ensure imports at the top of `schema.ts` include `date`, `jsonb`, `integer`, `boolean`, `numeric`, `sql` from `drizzle-orm/pg-core` / `drizzle-orm` as needed (several may already be imported — add only the missing ones).

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: No type errors inside `schema.ts`. Errors in the old `benchmark.ts` router and any frontend referring to removed exports are expected — they will be fixed when those files are rewritten.

- [ ] **Step 3: Commit**

```bash
git add src/server/db/schema.ts
git commit -m "feat(benchmark): add brand-benchmark drizzle tables"
```

---

## Phase 3 — Extractor Prompt, Brand Resolution, Weighting

### Task 4: Write versioned extractor prompt

**Files:**
- Create: `src/server/benchmark/extractor-prompt.ts`

- [ ] **Step 1: Create file**

```ts
// src/server/benchmark/extractor-prompt.ts
export const EXTRACTOR_VERSION = "v1";

export function buildExtractorPrompt(args: {
  promptText: string;
  rawAnswer: string;
  knownBrands: Array<{ slug: string; canonicalName: string; aliases: string[] }>;
}): string {
  const brandList = args.knownBrands
    .map((b) => `- ${b.canonicalName} [slug: ${b.slug}] aliases: ${b.aliases.join(", ") || "(none)"}`)
    .join("\n");

  return `You are a brand-extraction assistant. Given an AI model's answer to a user prompt, identify every brand, product, or company name the answer mentions. Return ONLY JSON matching the schema below.

INPUT PROMPT:
${args.promptText}

MODEL ANSWER:
${args.rawAnswer}

KNOWN BRANDS IN THIS CATEGORY:
${brandList || "(none — this is a new category)"}

OUTPUT SCHEMA:
{
  "mentions": [
    {
      "rawMention": "string, exactly as written in the answer",
      "suggestedBrandSlug": "string | null, from the KNOWN BRANDS list above, or null if unknown",
      "rank": "number | null, 1-based if the answer is a ranked list",
      "sentiment": "positive" | "neutral" | "negative",
      "context": "short (<= 280 chars) snippet of the answer around the mention",
      "confidence": "number 0-1, how sure you are this is a real brand mention"
    }
  ]
}

RULES:
- Merge duplicate mentions of the same brand into one entry; use the first occurrence's rank.
- Only set suggestedBrandSlug if the rawMention clearly matches a known brand's canonical name or alias (case-insensitive).
- If the answer has no brand mentions, return {"mentions": []}.
- Do not invent brands. Do not include generic terms ("the database", "an editor").
- Output ONLY the JSON object. No prose, no markdown fencing.`;
}

export type ExtractorMention = {
  rawMention: string;
  suggestedBrandSlug: string | null;
  rank: number | null;
  sentiment: "positive" | "neutral" | "negative";
  context: string;
  confidence: number;
};

export type ExtractorResponse = {
  mentions: ExtractorMention[];
};
```

- [ ] **Step 2: Commit**

```bash
git add src/server/benchmark/extractor-prompt.ts
git commit -m "feat(benchmark): add v1 extractor prompt"
```

### Task 5: Write brand resolution logic with unit tests

**Files:**
- Create: `src/server/benchmark/resolve-brand.ts`
- Create: `src/server/benchmark/resolve-brand.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/server/benchmark/resolve-brand.test.ts
import { describe, expect, it } from "vitest";
import { resolveBrand } from "./resolve-brand";

const brands = [
  { id: "b1", slug: "openai", canonicalName: "OpenAI", aliases: ["chatgpt", "gpt-4", "gpt"] },
  { id: "b2", slug: "anthropic", canonicalName: "Anthropic", aliases: ["claude", "claude-3"] },
];

describe("resolveBrand", () => {
  it("matches by canonical name case-insensitively", () => {
    expect(resolveBrand("openai", brands)?.id).toBe("b1");
    expect(resolveBrand("OpenAI", brands)?.id).toBe("b1");
  });

  it("matches by alias case-insensitively", () => {
    expect(resolveBrand("ChatGPT", brands)?.id).toBe("b1");
    expect(resolveBrand("claude-3", brands)?.id).toBe("b2");
  });

  it("prefers suggested slug if provided", () => {
    expect(resolveBrand("some weird name", brands, { suggestedSlug: "anthropic" })?.id).toBe("b2");
  });

  it("returns null for unknown brands", () => {
    expect(resolveBrand("NotABrand", brands)).toBeNull();
  });

  it("ignores suggestedSlug if it does not exist", () => {
    expect(resolveBrand("OpenAI", brands, { suggestedSlug: "ghost" })?.id).toBe("b1");
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `pnpm test -- resolve-brand`
Expected: FAIL with `Cannot find module './resolve-brand'` or equivalent.

- [ ] **Step 3: Implement**

```ts
// src/server/benchmark/resolve-brand.ts
export type BrandRecord = {
  id: string;
  slug: string;
  canonicalName: string;
  aliases: string[];
};

export function resolveBrand(
  rawMention: string,
  brands: BrandRecord[],
  opts: { suggestedSlug?: string | null } = {},
): BrandRecord | null {
  const normalized = rawMention.trim().toLowerCase();
  if (!normalized) return null;

  if (opts.suggestedSlug) {
    const bySlug = brands.find((b) => b.slug === opts.suggestedSlug);
    if (bySlug) return bySlug;
  }

  for (const brand of brands) {
    if (brand.canonicalName.toLowerCase() === normalized) return brand;
    if (brand.aliases.some((a) => a.toLowerCase() === normalized)) return brand;
  }
  return null;
}
```

- [ ] **Step 4: Run test — verify pass**

Run: `pnpm test -- resolve-brand`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/benchmark/resolve-brand.ts src/server/benchmark/resolve-brand.test.ts
git commit -m "feat(benchmark): brand alias resolution"
```

### Task 6: Write weighting formula with unit tests

**Files:**
- Create: `src/server/benchmark/weighting.ts`
- Create: `src/server/benchmark/weighting.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/server/benchmark/weighting.test.ts
import { describe, expect, it } from "vitest";
import { computeBrandWeight } from "./weighting";

describe("computeBrandWeight", () => {
  it("returns 1.0 when agreement meets median", () => {
    expect(computeBrandWeight({ agreementCount: 10, medianAgreement: 10 })).toBe(1.0);
  });

  it("down-weights single-user mentions when many users agree on other brands", () => {
    expect(computeBrandWeight({ agreementCount: 1, medianAgreement: 10 })).toBeCloseTo(0.1, 5);
  });

  it("caps weight at 1.0 even if agreement exceeds median", () => {
    expect(computeBrandWeight({ agreementCount: 20, medianAgreement: 10 })).toBe(1.0);
  });

  it("returns 1.0 when medianAgreement is 0 (insufficient data)", () => {
    expect(computeBrandWeight({ agreementCount: 1, medianAgreement: 0 })).toBe(1.0);
  });
});
```

- [ ] **Step 2: Run test — verify fail**

Run: `pnpm test -- weighting`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// src/server/benchmark/weighting.ts
export function computeBrandWeight(args: {
  agreementCount: number;
  medianAgreement: number;
}): number {
  if (args.medianAgreement <= 0) return 1.0;
  return Math.min(1.0, args.agreementCount / args.medianAgreement);
}
```

- [ ] **Step 4: Run test — verify pass**

Run: `pnpm test -- weighting`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/benchmark/weighting.ts src/server/benchmark/weighting.test.ts
git commit -m "feat(benchmark): outlier weight formula"
```

---

## Phase 4 — tRPC Router

### Task 7: Scaffold new `benchmark` router (public reads)

**Files:**
- Modify (rewrite): `src/server/api/routers/benchmark.ts`

- [ ] **Step 1: Replace file with scaffold**

```ts
// src/server/api/routers/benchmark.ts
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import {
  benchmarkCategories,
  benchmarkIntents,
  benchmarkPrompts,
  benchmarkRuns,
  benchmarkBrandMentions,
  brands,
  aggBrandRankByPrompt,
  aggBrandTrendsByDay,
  aggModelBiasMatrix,
} from "@/server/db/schema";
import {
  BENCHMARK_DEFAULT_LOCALE,
  BENCHMARK_MODEL_PROVIDERS,
  BENCHMARK_SENTIMENTS,
} from "@/lib/benchmark-constants";

export const benchmarkRouter = createTRPCRouter({
  listCategories: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(benchmarkCategories)
      .orderBy(asc(benchmarkCategories.name));
    return rows;
  }),

  listIntents: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(benchmarkIntents).orderBy(asc(benchmarkIntents.name));
  }),
});
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS for `benchmark.ts`. Any frontend consumer of the old `getLeaderboard`/`getQuestionStats` will fail — note them; they are deleted when the old page is replaced in Phase 7.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/benchmark.ts
git commit -m "feat(benchmark): scaffold new router with category/intent lists"
```

### Task 8: Add `listApprovedPrompts` + `submitPrompt` + `listMySubmissions`

**Files:**
- Modify: `src/server/api/routers/benchmark.ts`

- [ ] **Step 1: Add procedures**

Append to the `createTRPCRouter({ ... })` object:

```ts
  listApprovedPrompts: publicProcedure
    .input(
      z.object({
        categoryId: z.string().uuid().optional(),
        intentId: z.string().uuid().optional(),
        search: z.string().max(200).optional(),
        page: z.number().int().min(1).default(1),
        pageSize: z.number().int().min(1).max(100).default(24),
      }),
    )
    .query(async ({ ctx, input }) => {
      const conds = [eq(benchmarkPrompts.status, "approved")];
      if (input.categoryId) conds.push(eq(benchmarkPrompts.categoryId, input.categoryId));
      if (input.intentId) conds.push(eq(benchmarkPrompts.intentId, input.intentId));
      if (input.search) {
        conds.push(sql`lower(${benchmarkPrompts.text}) like ${"%" + input.search.toLowerCase() + "%"}`);
      }
      const offset = (input.page - 1) * input.pageSize;
      const rows = await ctx.db
        .select()
        .from(benchmarkPrompts)
        .where(and(...conds))
        .orderBy(desc(benchmarkPrompts.approvedAt))
        .limit(input.pageSize)
        .offset(offset);
      return rows;
    }),

  submitPrompt: protectedProcedure
    .input(
      z.object({
        text: z.string().min(4).max(500),
        categoryId: z.string().uuid(),
        intentId: z.string().uuid(),
        locale: z.string().max(16).default(BENCHMARK_DEFAULT_LOCALE),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id;
      try {
        const [row] = await ctx.db
          .insert(benchmarkPrompts)
          .values({
            text: input.text.trim(),
            categoryId: input.categoryId,
            intentId: input.intentId,
            locale: input.locale,
            submittedByUserId: userId,
            status: "pending",
          })
          .returning();
        return row;
      } catch (err) {
        if (String(err).includes("benchmark_prompt_dedupe_idx")) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This prompt already exists for that category and intent.",
          });
        }
        throw err;
      }
    }),

  listMySubmissions: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session!.user.id;
    const myPrompts = await ctx.db
      .select()
      .from(benchmarkPrompts)
      .where(eq(benchmarkPrompts.submittedByUserId, userId))
      .orderBy(desc(benchmarkPrompts.createdAt))
      .limit(50);
    const myRuns = await ctx.db
      .select()
      .from(benchmarkRuns)
      .where(eq(benchmarkRuns.submittedByUserId, userId))
      .orderBy(desc(benchmarkRuns.createdAt))
      .limit(50);
    return { prompts: myPrompts, runs: myRuns };
  }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/benchmark.ts
git commit -m "feat(benchmark): prompt submission + listing procedures"
```

### Task 9: Add `submitRun` (member + agent) with dedupe + activity event

**Files:**
- Modify: `src/server/api/routers/benchmark.ts`

- [ ] **Step 1: Add imports and procedure**

At the top of `benchmark.ts` add:

```ts
import { logActivity } from "@/server/agent/activity";
```

Append procedure to the router:

```ts
  submitRun: protectedProcedure
    .input(
      z.object({
        promptId: z.string().uuid(),
        modelProvider: z.enum(BENCHMARK_MODEL_PROVIDERS),
        modelId: z.string().min(1).max(120),
        modelVersion: z.string().max(120).optional(),
        temperature: z.number().min(0).max(2).optional(),
        rawAnswer: z.string().min(1).max(50_000),
        locale: z.string().max(16).default(BENCHMARK_DEFAULT_LOCALE),
        capturedAt: z.string().datetime().optional(),
        agentId: z.string().uuid().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id;

      // Confirm prompt exists and is approved
      const [prompt] = await ctx.db
        .select()
        .from(benchmarkPrompts)
        .where(eq(benchmarkPrompts.id, input.promptId))
        .limit(1);
      if (!prompt || prompt.status !== "approved") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Prompt not found or not approved.",
        });
      }

      const capturedAt = input.capturedAt ? new Date(input.capturedAt) : new Date();

      try {
        const [run] = await ctx.db
          .insert(benchmarkRuns)
          .values({
            promptId: input.promptId,
            submittedByUserId: userId,
            agentId: input.agentId ?? null,
            modelProvider: input.modelProvider,
            modelId: input.modelId,
            modelVersion: input.modelVersion ?? null,
            temperature: input.temperature?.toString() ?? null,
            rawAnswer: input.rawAnswer,
            locale: input.locale,
            capturedAt,
            extractionStatus: "pending",
          })
          .returning();

        await logActivity(ctx.db, {
          actorId: userId,
          actorType: input.agentId ? "agent" : "member",
          action: "benchmark.run.created",
          targetType: "benchmark_run",
          targetId: run.id,
          metadata: {
            promptId: input.promptId,
            modelId: input.modelId,
            modelProvider: input.modelProvider,
          },
        });

        return run;
      } catch (err) {
        if (String(err).includes("benchmark_run_dedupe_idx")) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "You already submitted this prompt/model combo today. Try again tomorrow.",
          });
        }
        throw err;
      }
    }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/benchmark.ts
git commit -m "feat(benchmark): submitRun with dedupe + activity event"
```

### Task 10: Add extractor endpoints (`getRunForExtraction`, `submitExtraction`)

**Files:**
- Modify: `src/server/api/routers/benchmark.ts`
- Create: `src/server/benchmark/ingest-extraction.ts`
- Create: `src/server/benchmark/ingest-extraction.test.ts`

- [ ] **Step 1: Write failing test for ingest-extraction**

```ts
// src/server/benchmark/ingest-extraction.test.ts
import { describe, expect, it, vi } from "vitest";
import { splitMentions } from "./ingest-extraction";

describe("splitMentions", () => {
  it("splits into resolved + queue based on brand lookup", () => {
    const brandsByKey = new Map<string, { id: string; slug: string }>([
      ["openai", { id: "b1", slug: "openai" }],
      ["chatgpt", { id: "b1", slug: "openai" }],
    ]);
    const result = splitMentions(
      [
        { rawMention: "ChatGPT", suggestedBrandSlug: "openai", rank: 1, sentiment: "positive", context: "c", confidence: 0.9 },
        { rawMention: "WeirdTool", suggestedBrandSlug: null, rank: 2, sentiment: "neutral", context: "c", confidence: 0.4 },
      ],
      brandsByKey,
    );
    expect(result.resolved).toHaveLength(1);
    expect(result.resolved[0].brandId).toBe("b1");
    expect(result.unresolved).toHaveLength(1);
    expect(result.unresolved[0].rawMention).toBe("WeirdTool");
  });
});
```

- [ ] **Step 2: Verify fail**

Run: `pnpm test -- ingest-extraction`
Expected: FAIL.

- [ ] **Step 3: Implement helper**

```ts
// src/server/benchmark/ingest-extraction.ts
import type { ExtractorMention } from "./extractor-prompt";

export type ResolvedMention = {
  rawMention: string;
  brandId: string;
  rank: number | null;
  sentiment: ExtractorMention["sentiment"];
  context: string;
  confidence: number;
};

export type UnresolvedMention = {
  rawMention: string;
  suggestedBrandId: string | null;
  rank: number | null;
  sentiment: ExtractorMention["sentiment"];
  context: string;
  confidence: number;
};

export function splitMentions(
  mentions: ExtractorMention[],
  brandsByKey: Map<string, { id: string; slug: string }>,
): { resolved: ResolvedMention[]; unresolved: UnresolvedMention[] } {
  const resolved: ResolvedMention[] = [];
  const unresolved: UnresolvedMention[] = [];

  for (const m of mentions) {
    const keys = [
      m.suggestedBrandSlug?.toLowerCase() ?? "",
      m.rawMention.trim().toLowerCase(),
    ].filter(Boolean);
    const hit = keys.map((k) => brandsByKey.get(k)).find(Boolean);
    if (hit) {
      resolved.push({
        rawMention: m.rawMention,
        brandId: hit.id,
        rank: m.rank,
        sentiment: m.sentiment,
        context: m.context,
        confidence: m.confidence,
      });
    } else {
      unresolved.push({
        rawMention: m.rawMention,
        suggestedBrandId: null,
        rank: m.rank,
        sentiment: m.sentiment,
        context: m.context,
        confidence: m.confidence,
      });
    }
  }
  return { resolved, unresolved };
}
```

- [ ] **Step 4: Verify test pass**

Run: `pnpm test -- ingest-extraction`
Expected: PASS.

- [ ] **Step 5: Add router procedures**

In `src/server/api/routers/benchmark.ts`, add imports:

```ts
import { brandAliasQueue } from "@/server/db/schema";
import { splitMentions } from "@/server/benchmark/ingest-extraction";
import {
  EXTRACTOR_VERSION,
  buildExtractorPrompt,
} from "@/server/benchmark/extractor-prompt";
```

Append procedures (both use `protectedProcedure` — the extractor agent authenticates as its owner member via the agent API-key middleware already used elsewhere; scope-tightening to agent-only is deferred, see spec open questions):

```ts
  getRunForExtraction: protectedProcedure
    .input(z.object({ runId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [run] = await ctx.db
        .select()
        .from(benchmarkRuns)
        .where(eq(benchmarkRuns.id, input.runId))
        .limit(1);
      if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });

      const [prompt] = await ctx.db
        .select()
        .from(benchmarkPrompts)
        .where(eq(benchmarkPrompts.id, run.promptId))
        .limit(1);
      if (!prompt) throw new TRPCError({ code: "NOT_FOUND", message: "Prompt missing" });

      const brandRows = await ctx.db
        .select({
          id: brands.id,
          slug: brands.slug,
          canonicalName: brands.canonicalName,
          aliases: brands.aliases,
          categoryIds: brands.categoryIds,
        })
        .from(brands)
        .where(sql`${prompt.categoryId} = ANY(${brands.categoryIds})`);

      return {
        runId: run.id,
        promptText: prompt.text,
        rawAnswer: run.rawAnswer,
        knownBrands: brandRows.map((b) => ({
          slug: b.slug,
          canonicalName: b.canonicalName,
          aliases: b.aliases ?? [],
        })),
        extractorVersion: EXTRACTOR_VERSION,
        renderedPrompt: buildExtractorPrompt({
          promptText: prompt.text,
          rawAnswer: run.rawAnswer,
          knownBrands: brandRows.map((b) => ({
            slug: b.slug,
            canonicalName: b.canonicalName,
            aliases: b.aliases ?? [],
          })),
        }),
      };
    }),

  submitExtraction: protectedProcedure
    .input(
      z.object({
        runId: z.string().uuid(),
        extractorVersion: z.string().min(1).max(40),
        mentions: z
          .array(
            z.object({
              rawMention: z.string().min(1).max(500),
              suggestedBrandSlug: z.string().max(200).nullable(),
              rank: z.number().int().min(1).max(100).nullable(),
              sentiment: z.enum(BENCHMARK_SENTIMENTS),
              context: z.string().max(280),
              confidence: z.number().min(0).max(1),
            }),
          )
          .max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Mark run as processing
      await ctx.db
        .update(benchmarkRuns)
        .set({ extractionStatus: "processing" })
        .where(eq(benchmarkRuns.id, input.runId));

      try {
        // Build brand lookup by slug and by alias
        const brandRows = await ctx.db
          .select({
            id: brands.id,
            slug: brands.slug,
            canonicalName: brands.canonicalName,
            aliases: brands.aliases,
          })
          .from(brands);

        const brandsByKey = new Map<string, { id: string; slug: string }>();
        for (const b of brandRows) {
          brandsByKey.set(b.slug.toLowerCase(), { id: b.id, slug: b.slug });
          brandsByKey.set(b.canonicalName.toLowerCase(), { id: b.id, slug: b.slug });
          for (const a of b.aliases ?? []) {
            brandsByKey.set(a.toLowerCase(), { id: b.id, slug: b.slug });
          }
        }

        const { resolved, unresolved } = splitMentions(input.mentions, brandsByKey);

        // Insert resolved mentions
        if (resolved.length > 0) {
          await ctx.db.insert(benchmarkBrandMentions).values(
            resolved.map((m) => ({
              runId: input.runId,
              rawMention: m.rawMention,
              brandId: m.brandId,
              rank: m.rank,
              sentiment: m.sentiment,
              context: m.context,
              confidence: m.confidence.toString(),
              extractorVersion: input.extractorVersion,
            })),
          );
        }

        // Insert unresolved mentions (brandId null) AND upsert into alias queue
        if (unresolved.length > 0) {
          await ctx.db.insert(benchmarkBrandMentions).values(
            unresolved.map((m) => ({
              runId: input.runId,
              rawMention: m.rawMention,
              brandId: null,
              rank: m.rank,
              sentiment: m.sentiment,
              context: m.context,
              confidence: m.confidence.toString(),
              extractorVersion: input.extractorVersion,
            })),
          );
          for (const m of unresolved) {
            await ctx.db
              .insert(brandAliasQueue)
              .values({
                rawMention: m.rawMention,
                runId: input.runId,
                occurrenceCount: 1,
                status: "pending",
              })
              .onConflictDoUpdate({
                target: sql`lower(${brandAliasQueue.rawMention})`,
                set: {
                  occurrenceCount: sql`${brandAliasQueue.occurrenceCount} + 1`,
                },
              });
          }
        }

        await ctx.db
          .update(benchmarkRuns)
          .set({ extractionStatus: "done" })
          .where(eq(benchmarkRuns.id, input.runId));

        return { resolved: resolved.length, unresolved: unresolved.length };
      } catch (err) {
        await ctx.db
          .update(benchmarkRuns)
          .set({
            extractionStatus: sql`CASE WHEN ${benchmarkRuns.extractionAttempts} >= 2 THEN 'failed' ELSE 'pending' END`,
            extractionAttempts: sql`${benchmarkRuns.extractionAttempts} + 1`,
          })
          .where(eq(benchmarkRuns.id, input.runId));
        throw err;
      }
    }),
```

- [ ] **Step 6: Typecheck + test**

Run: `pnpm typecheck && pnpm test -- benchmark`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/api/routers/benchmark.ts src/server/benchmark/ingest-extraction.ts src/server/benchmark/ingest-extraction.test.ts
git commit -m "feat(benchmark): extractor fetch + ingestion endpoints"
```

### Task 11: Add dashboard query procedures

**Files:**
- Modify: `src/server/api/routers/benchmark.ts`

- [ ] **Step 1: Append queries**

```ts
  getPromptDashboard: publicProcedure
    .input(
      z.object({
        promptId: z.string().uuid(),
        windowDays: z.number().int().min(1).max(365).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rankRows = await ctx.db
        .select()
        .from(aggBrandRankByPrompt)
        .where(
          and(
            eq(aggBrandRankByPrompt.promptId, input.promptId),
            eq(aggBrandRankByPrompt.windowDays, input.windowDays),
          ),
        );
      const matrixRows = await ctx.db
        .select()
        .from(aggModelBiasMatrix)
        .where(eq(aggModelBiasMatrix.promptId, input.promptId));
      return { rankRows, matrixRows };
    }),

  getTrend: publicProcedure
    .input(
      z.object({
        brandId: z.string().uuid(),
        modelIds: z.array(z.string()).max(10).optional(),
        windowDays: z.number().int().min(7).max(365).default(90),
      }),
    )
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - input.windowDays * 86_400_000);
      const conds = [eq(aggBrandTrendsByDay.brandId, input.brandId), sql`${aggBrandTrendsByDay.date} >= ${since.toISOString().slice(0, 10)}`];
      if (input.modelIds?.length) conds.push(inArray(aggBrandTrendsByDay.modelId, input.modelIds));
      return ctx.db
        .select()
        .from(aggBrandTrendsByDay)
        .where(and(...conds))
        .orderBy(asc(aggBrandTrendsByDay.date));
    }),

  getCategoryLeaderboard: publicProcedure
    .input(
      z.object({
        categoryId: z.string().uuid(),
        windowDays: z.number().int().min(7).max(365).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      // Join prompt→rank→brand filtered by category
      return ctx.db.execute(sql`
        SELECT b.id, b.canonical_name, b.slug,
               SUM(r.weighted_score) AS total_weighted
        FROM ${aggBrandRankByPrompt} r
        JOIN ${benchmarkPrompts} p ON p.id = r.prompt_id
        JOIN ${brands} b ON b.id = r.brand_id
        WHERE p.category_id = ${input.categoryId}
          AND r.window_days = ${input.windowDays}
        GROUP BY b.id, b.canonical_name, b.slug
        ORDER BY total_weighted DESC
        LIMIT 10
      `);
    }),

  getBrandProfile: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(200) }))
    .query(async ({ ctx, input }) => {
      const [brand] = await ctx.db.select().from(brands).where(eq(brands.slug, input.slug)).limit(1);
      if (!brand) throw new TRPCError({ code: "NOT_FOUND", message: "Brand not found" });
      const mentions = await ctx.db
        .select({
          runId: benchmarkBrandMentions.runId,
          modelId: benchmarkRuns.modelId,
          modelProvider: benchmarkRuns.modelProvider,
          sentiment: benchmarkBrandMentions.sentiment,
          context: benchmarkBrandMentions.context,
          capturedAt: benchmarkRuns.capturedAt,
        })
        .from(benchmarkBrandMentions)
        .innerJoin(benchmarkRuns, eq(benchmarkRuns.id, benchmarkBrandMentions.runId))
        .where(eq(benchmarkBrandMentions.brandId, brand.id))
        .orderBy(desc(benchmarkRuns.capturedAt))
        .limit(100);
      return { brand, mentions };
    }),

  getLatestRunsFeed: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select({
          id: benchmarkRuns.id,
          promptId: benchmarkRuns.promptId,
          modelId: benchmarkRuns.modelId,
          modelProvider: benchmarkRuns.modelProvider,
          capturedAt: benchmarkRuns.capturedAt,
          extractionStatus: benchmarkRuns.extractionStatus,
        })
        .from(benchmarkRuns)
        .orderBy(desc(benchmarkRuns.capturedAt))
        .limit(input.limit);
    }),
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/api/routers/benchmark.ts
git commit -m "feat(benchmark): dashboard query procedures"
```

---

## Phase 5 — Webhook Category + Aggregation Cron

### Task 12: Add `benchmark` webhook category

**Files:**
- Modify: `src/server/agent/webhook-dispatch.ts`

- [ ] **Step 1: Extend `CATEGORY_PREFIXES`**

Find `CATEGORY_PREFIXES` map near the top of `webhook-dispatch.ts` and add:

```ts
  benchmark: ["benchmark."],
```

- [ ] **Step 2: Confirm webhook UI allows selecting this category**

Run: `rg "agentWebhooks" src/server/api/routers/agent-management.ts`
If the router accepts an arbitrary category string when creating a webhook, no further change is needed. If there's an enum or allowlist, add `"benchmark"` to it (follow the existing pattern).

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/server/agent/webhook-dispatch.ts src/server/api/routers/agent-management.ts
git commit -m "feat(benchmark): add benchmark webhook category"
```

### Task 13: Aggregation functions + cron

**Files:**
- Create: `src/server/benchmark/aggregate.ts`
- Create: `src/app/api/cron/benchmark-aggregate/route.ts`

- [ ] **Step 1: Write aggregation module**

```ts
// src/server/benchmark/aggregate.ts
import { sql } from "drizzle-orm";
import type { db as _db } from "@/server/db";

type DB = typeof _db;

const WINDOWS = [7, 30, 90] as const;

export async function rebuildBrandRankByPrompt(db: DB): Promise<void> {
  for (const w of WINDOWS) {
    await db.execute(sql`
      DELETE FROM "app"."agg_brand_rank_by_prompt"
      WHERE "window_days" = ${w};

      INSERT INTO "app"."agg_brand_rank_by_prompt" (
        "prompt_id", "brand_id", "model_id", "window_days",
        "mention_count", "weighted_score", "avg_rank",
        "sentiment_positive_pct", "sentiment_neutral_pct", "sentiment_negative_pct",
        "updated_at"
      )
      SELECT
        r.prompt_id,
        m.brand_id,
        r.model_id,
        ${w} AS window_days,
        COUNT(*)::int AS mention_count,
        SUM(r.weight) AS weighted_score,
        AVG(m.rank)::numeric(10,2) AS avg_rank,
        (SUM(CASE WHEN m.sentiment = 'positive' THEN 1 ELSE 0 END)::numeric / COUNT(*)) * 100 AS sp,
        (SUM(CASE WHEN m.sentiment = 'neutral'  THEN 1 ELSE 0 END)::numeric / COUNT(*)) * 100 AS sn,
        (SUM(CASE WHEN m.sentiment = 'negative' THEN 1 ELSE 0 END)::numeric / COUNT(*)) * 100 AS sx,
        now()
      FROM "app"."benchmark_brand_mention" m
      JOIN "app"."benchmark_run" r ON r.id = m.run_id
      WHERE m.brand_id IS NOT NULL
        AND r.captured_at >= now() - (${w} || ' days')::interval
        AND r.extraction_status = 'done'
      GROUP BY r.prompt_id, m.brand_id, r.model_id;
    `);
  }
}

export async function rebuildBrandTrendsByDay(db: DB): Promise<void> {
  await db.execute(sql`
    DELETE FROM "app"."agg_brand_trends_by_day"
    WHERE "date" >= (CURRENT_DATE - INTERVAL '365 days');

    INSERT INTO "app"."agg_brand_trends_by_day" (
      "brand_id", "model_id", "category_id", "date", "mention_pct", "run_count", "updated_at"
    )
    SELECT
      m.brand_id,
      r.model_id,
      p.category_id,
      date_trunc('day', r.captured_at)::date AS d,
      (COUNT(DISTINCT r.id)::numeric / NULLIF((
        SELECT COUNT(*) FROM "app"."benchmark_run" r2
        WHERE r2.model_id = r.model_id
          AND date_trunc('day', r2.captured_at) = date_trunc('day', r.captured_at)
      ), 0)) * 100 AS mention_pct,
      COUNT(DISTINCT r.id)::int,
      now()
    FROM "app"."benchmark_brand_mention" m
    JOIN "app"."benchmark_run" r ON r.id = m.run_id
    JOIN "app"."benchmark_prompt" p ON p.id = r.prompt_id
    WHERE m.brand_id IS NOT NULL
      AND r.extraction_status = 'done'
      AND r.captured_at >= now() - INTERVAL '365 days'
    GROUP BY m.brand_id, r.model_id, p.category_id, d;
  `);
}

export async function rebuildModelBiasMatrix(db: DB): Promise<void> {
  await db.execute(sql`
    DELETE FROM "app"."agg_model_bias_matrix";

    INSERT INTO "app"."agg_model_bias_matrix" ("prompt_id", "model_id", "top_brand_ids", "updated_at")
    SELECT
      prompt_id,
      model_id,
      jsonb_agg(brand_id ORDER BY weighted_score DESC) FILTER (WHERE rn <= 5) AS top_brand_ids,
      now()
    FROM (
      SELECT
        prompt_id, model_id, brand_id, weighted_score,
        ROW_NUMBER() OVER (PARTITION BY prompt_id, model_id ORDER BY weighted_score DESC) AS rn
      FROM "app"."agg_brand_rank_by_prompt"
      WHERE window_days = 30
    ) t
    GROUP BY prompt_id, model_id;
  `);
}

export async function rebuildAllAggregates(db: DB): Promise<{
  ok: true;
  durations: { rank: number; trends: number; matrix: number };
}> {
  const t0 = Date.now();
  await rebuildBrandRankByPrompt(db);
  const t1 = Date.now();
  await rebuildBrandTrendsByDay(db);
  const t2 = Date.now();
  await rebuildModelBiasMatrix(db);
  const t3 = Date.now();
  return {
    ok: true,
    durations: { rank: t1 - t0, trends: t2 - t1, matrix: t3 - t2 },
  };
}
```

- [ ] **Step 2: Create cron route**

```ts
// src/app/api/cron/benchmark-aggregate/route.ts
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { rebuildAllAggregates } from "@/server/benchmark/aggregate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await rebuildAllAggregates(db);
    return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[benchmark-aggregate] error", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 3: Register cron schedule**

Open the project's cron configuration (likely `vercel.json` at repo root — check). Add an entry:

```json
{ "path": "/api/cron/benchmark-aggregate", "schedule": "0 * * * *" }
```

If `vercel.json` does not exist, match the pattern used by an existing cron — grep `rg "benchmark-aggregate|impact-aggregation" vercel.json` to confirm file location. If crons are registered a different way (Payload hooks, etc.), follow the existing pattern for another cron.

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/benchmark/aggregate.ts src/app/api/cron/benchmark-aggregate vercel.json
git commit -m "feat(benchmark): aggregate cron + rebuild functions"
```

### Task 14: Nightly weight recompute cron

**Files:**
- Create: `src/app/api/cron/benchmark-weights/route.ts`
- Modify: `src/server/benchmark/weighting.ts` (add DB-facing function)

- [ ] **Step 1: Extend weighting module with DB function**

Append to `src/server/benchmark/weighting.ts`:

```ts
import { sql } from "drizzle-orm";
import type { db as _db } from "@/server/db";
type DB = typeof _db;

export async function recomputeRunWeights(db: DB): Promise<void> {
  await db.execute(sql`
    WITH agreement AS (
      SELECT
        r.id AS run_id,
        COUNT(DISTINCT r2.submitted_by_user_id) FILTER (
          WHERE m2.brand_id = m.brand_id
        ) AS brand_agreement,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY
          COUNT(DISTINCT r2.submitted_by_user_id)
        ) OVER (PARTITION BY r.prompt_id, r.model_id) AS median_agreement
      FROM "app"."benchmark_run" r
      JOIN "app"."benchmark_brand_mention" m ON m.run_id = r.id AND m.brand_id IS NOT NULL
      JOIN "app"."benchmark_run" r2 ON r2.prompt_id = r.prompt_id AND r2.model_id = r.model_id
        AND r2.captured_at >= now() - INTERVAL '30 days'
      JOIN "app"."benchmark_brand_mention" m2 ON m2.run_id = r2.id
      WHERE r.captured_at >= now() - INTERVAL '30 days'
      GROUP BY r.id, r.prompt_id, r.model_id, m.brand_id
    )
    UPDATE "app"."benchmark_run" r
    SET weight = LEAST(1.0,
      COALESCE(
        (SELECT AVG(LEAST(1.0, a.brand_agreement::numeric / NULLIF(a.median_agreement, 0)))
         FROM agreement a WHERE a.run_id = r.id),
        1.0
      )
    )
    WHERE r.captured_at >= now() - INTERVAL '30 days'
      AND r.extraction_status = 'done';
  `);
}
```

- [ ] **Step 2: Create cron route**

```ts
// src/app/api/cron/benchmark-weights/route.ts
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { recomputeRunWeights } from "@/server/benchmark/weighting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    await recomputeRunWeights(db);
    return NextResponse.json({ success: true, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[benchmark-weights] error", err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 3: Add cron schedule**

Append to cron config:
```json
{ "path": "/api/cron/benchmark-weights", "schedule": "15 3 * * *" }
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/benchmark/weighting.ts src/app/api/cron/benchmark-weights vercel.json
git commit -m "feat(benchmark): nightly weight recompute cron"
```

---

## Phase 6 — Payload Admin

### Task 15: Add Payload collections for admin review

**Files:**
- Modify: `src/collections/` (path confirmed by existing Payload config — adjust as needed)

- [ ] **Step 1: Inspect existing Payload pattern**

Run: `rg "export const \w+: CollectionConfig" src/collections | head -5`
Pick an example (e.g. `Events`) to mirror.

- [ ] **Step 2: Create `BenchmarkPrompts` collection**

Create (path mirrors existing collection files):
```ts
// src/collections/BenchmarkPrompts.ts
import type { CollectionConfig } from "payload";

export const BenchmarkPrompts: CollectionConfig = {
  slug: "benchmark-prompts",
  labels: { singular: "Benchmark Prompt", plural: "Benchmark Prompts" },
  dbName: "benchmark_prompt",
  access: {
    read: () => true,
    create: () => false, // submissions go through tRPC
    update: ({ req: { user } }) => Boolean(user?.roles?.includes("admin")),
    delete: () => false,
  },
  admin: {
    useAsTitle: "text",
    defaultColumns: ["text", "status", "category", "intent", "submittedByUser", "createdAt"],
  },
  fields: [
    { name: "text", type: "textarea", required: true, admin: { readOnly: true } },
    { name: "status", type: "select", options: ["pending", "approved", "rejected"], defaultValue: "pending", required: true },
    { name: "category", type: "relationship", relationTo: "benchmark-categories", required: true, admin: { readOnly: true } },
    { name: "intent", type: "relationship", relationTo: "benchmark-intents", required: true, admin: { readOnly: true } },
    { name: "locale", type: "text", defaultValue: "en-US", admin: { readOnly: true } },
    { name: "submittedByUser", type: "relationship", relationTo: "users", admin: { readOnly: true } },
    { name: "approvedByUser", type: "relationship", relationTo: "users" },
    { name: "approvedAt", type: "date" },
    { name: "notes", type: "textarea" },
  ],
  hooks: {
    beforeChange: [
      ({ data, req, operation }) => {
        if (operation === "update" && data?.status === "approved" && !data.approvedByUser) {
          data.approvedByUser = req.user?.id;
          data.approvedAt = new Date();
        }
        return data;
      },
    ],
  },
};
```

Create similar minimal collections for `BenchmarkCategories`, `BenchmarkIntents`, `Brands`, `BrandAliasQueue`. Keep categories/intents editable, brands editable, alias queue read + status-update.

- [ ] **Step 3: Register collections**

Open Payload config (`src/payload.config.ts` or similar — grep to confirm) and add each new collection to the `collections` array.

Run: `rg "collections:" src/payload.config.ts`

- [ ] **Step 4: Rebuild Payload types**

Run: `pnpm payload generate:types`
(If the script name differs, check `package.json` for `payload` scripts.)

- [ ] **Step 5: Run app and verify**

Run: `pnpm dev` (in background or other shell).
Open `http://localhost:3000/admin`. Confirm new collections appear and at least one prompt can be approved via the UI. Check that `approved_by_user_id` + `approved_at` are populated in DB.

- [ ] **Step 6: Commit**

```bash
git add src/collections/Benchmark*.ts src/collections/Brand*.ts src/payload.config.ts src/payload-types.ts
git commit -m "feat(benchmark): Payload collections for admin review"
```

---

## Phase 7 — Frontend Shell

### Task 16: Install Recharts and rewrite `/benchmark` page as tab shell

**Files:**
- Modify: `package.json`
- Modify (rewrite): `src/app/[locale]/benchmark/page.tsx`
- Create: `src/app/[locale]/benchmark/_components/submit-prompt-tab.tsx`
- Create: `src/app/[locale]/benchmark/_components/run-prompts-tab.tsx`
- Create: `src/app/[locale]/benchmark/_components/dashboard-tab.tsx`

- [ ] **Step 1: Install Recharts**

Run: `pnpm add recharts`
Expected: package installed; `package.json` updated.

- [ ] **Step 2: Rewrite page**

```tsx
// src/app/[locale]/benchmark/page.tsx
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SubmitPromptTab } from "./_components/submit-prompt-tab";
import { RunPromptsTab } from "./_components/run-prompts-tab";
import { DashboardTab } from "./_components/dashboard-tab";

export default function BenchmarkPage() {
  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">AI Brand Bias Benchmark</h1>
        <p className="text-muted-foreground">
          Community-curated prompts, community-run models, shared brand trends.
        </p>
      </header>

      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList>
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="run">Run Prompts</TabsTrigger>
          <TabsTrigger value="submit">Submit Prompt</TabsTrigger>
        </TabsList>
        <TabsContent value="dashboard"><DashboardTab /></TabsContent>
        <TabsContent value="run"><RunPromptsTab /></TabsContent>
        <TabsContent value="submit"><SubmitPromptTab /></TabsContent>
      </Tabs>
    </main>
  );
}
```

- [ ] **Step 3: Create stub tab components**

```tsx
// src/app/[locale]/benchmark/_components/submit-prompt-tab.tsx
"use client";
export function SubmitPromptTab() {
  return <div className="py-6 text-muted-foreground">Prompt submission coming up.</div>;
}
```

```tsx
// src/app/[locale]/benchmark/_components/run-prompts-tab.tsx
"use client";
export function RunPromptsTab() {
  return <div className="py-6 text-muted-foreground">Run prompts coming up.</div>;
}
```

```tsx
// src/app/[locale]/benchmark/_components/dashboard-tab.tsx
"use client";
export function DashboardTab() {
  return <div className="py-6 text-muted-foreground">Dashboard coming up.</div>;
}
```

- [ ] **Step 4: Typecheck + dev verify**

Run: `pnpm typecheck`
Expected: PASS.
Run dev server, open `/en-US/benchmark` (or whatever locale prefix is current), confirm three tabs render.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/app/\[locale\]/benchmark
git commit -m "feat(benchmark): tab-based page shell + Recharts dep"
```

---

## Phase 8 — Submit Prompt Tab

### Task 17: Implement submit prompt form

**Files:**
- Modify: `src/app/[locale]/benchmark/_components/submit-prompt-tab.tsx`

- [ ] **Step 1: Build form**

```tsx
// src/app/[locale]/benchmark/_components/submit-prompt-tab.tsx
"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export function SubmitPromptTab() {
  const categories = api.benchmark.listCategories.useQuery();
  const intents = api.benchmark.listIntents.useQuery();
  const submissions = api.benchmark.listMySubmissions.useQuery();
  const utils = api.useUtils();

  const [text, setText] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [intentId, setIntentId] = useState("");

  const submit = api.benchmark.submitPrompt.useMutation({
    onSuccess: () => {
      toast.success("Prompt submitted for review.");
      setText("");
      void utils.benchmark.listMySubmissions.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const canSubmit = text.trim().length >= 4 && categoryId && intentId && !submit.isPending;

  return (
    <div className="grid gap-6 py-4 md:grid-cols-2">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Propose a prompt</h2>
        <Textarea
          placeholder="e.g. What is the best CRM for early-stage startups?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          rows={4}
        />
        <div className="grid gap-3 md:grid-cols-2">
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              {categories.data?.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={intentId} onValueChange={setIntentId}>
            <SelectTrigger><SelectValue placeholder="Intent" /></SelectTrigger>
            <SelectContent>
              {intents.data?.map((i) => (
                <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          onClick={() =>
            submit.mutate({ text: text.trim(), categoryId, intentId, locale: "en-US" })
          }
          disabled={!canSubmit}
        >
          {submit.isPending ? "Submitting…" : "Submit for review"}
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">My submissions</h2>
        <ul className="flex flex-col divide-y rounded-md border text-sm">
          {submissions.data?.prompts.length === 0 && (
            <li className="p-3 text-muted-foreground">No submissions yet.</li>
          )}
          {submissions.data?.prompts.map((p) => (
            <li key={p.id} className="flex justify-between gap-3 p-3">
              <span className="truncate">{p.text}</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {p.status}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verify shadcn primitives exist**

Run: `ls src/components/ui/{button,textarea,select}.tsx`
If any are missing, add via `pnpm dlx shadcn@latest add <name>` (matches the project's shadcn usage).

- [ ] **Step 3: Typecheck + dev test**

Run: `pnpm typecheck`
Expected: PASS.
Manually submit a test prompt with dev server running. Confirm it appears in admin and in "My submissions" as `pending`.

- [ ] **Step 4: Commit**

```bash
git add src/app/\[locale\]/benchmark/_components/submit-prompt-tab.tsx
git commit -m "feat(benchmark): submit-prompt tab with live query list"
```

---

## Phase 9 — Run Prompts Tab

### Task 18: Implement run prompts listing + manual submission

**Files:**
- Modify: `src/app/[locale]/benchmark/_components/run-prompts-tab.tsx`
- Create: `src/app/[locale]/benchmark/_components/manual-run-form.tsx`
- Create: `src/app/[locale]/benchmark/_components/agent-run-modal.tsx`

- [ ] **Step 1: Build run-prompts list component**

```tsx
// src/app/[locale]/benchmark/_components/run-prompts-tab.tsx
"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ManualRunForm } from "./manual-run-form";
import { AgentRunModal } from "./agent-run-modal";

export function RunPromptsTab() {
  const categories = api.benchmark.listCategories.useQuery();
  const intents = api.benchmark.listIntents.useQuery();
  const [categoryId, setCategoryId] = useState<string>("");
  const [intentId, setIntentId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [manualFor, setManualFor] = useState<string | null>(null);
  const [agentFor, setAgentFor] = useState<string | null>(null);

  const prompts = api.benchmark.listApprovedPrompts.useQuery({
    categoryId: categoryId || undefined,
    intentId: intentId || undefined,
    search: search || undefined,
    page: 1,
    pageSize: 24,
  });
  const mine = api.benchmark.listMySubmissions.useQuery();

  return (
    <div className="flex flex-col gap-6 py-4">
      <div className="flex flex-wrap gap-3">
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All categories</SelectItem>
            {categories.data?.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={intentId} onValueChange={setIntentId}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All intents" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">All intents</SelectItem>
            {intents.data?.map((i) => (<SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Input
          className="w-64"
          placeholder="Search prompts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <ul className="grid gap-3 md:grid-cols-2">
        {prompts.data?.map((p) => (
          <li key={p.id} className="flex flex-col gap-3 rounded-md border p-4">
            <p className="font-medium leading-snug">{p.text}</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setAgentFor(p.id)}>Run with my agent</Button>
              <Button size="sm" variant="outline" onClick={() => setManualFor(p.id)}>Manual submit</Button>
            </div>
            {manualFor === p.id && (
              <ManualRunForm promptId={p.id} onDone={() => setManualFor(null)} />
            )}
          </li>
        ))}
      </ul>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium">My recent runs</h2>
        <ul className="flex flex-col divide-y rounded-md border text-sm">
          {mine.data?.runs.length === 0 && <li className="p-3 text-muted-foreground">No runs yet.</li>}
          {mine.data?.runs.map((r) => (
            <li key={r.id} className="flex justify-between gap-3 p-3">
              <span className="truncate">{r.modelProvider} · {r.modelId}</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {r.extractionStatus}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {agentFor && <AgentRunModal promptId={agentFor} onClose={() => setAgentFor(null)} />}
    </div>
  );
}
```

- [ ] **Step 2: Manual run form**

```tsx
// src/app/[locale]/benchmark/_components/manual-run-form.tsx
"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { BENCHMARK_MODEL_PROVIDERS } from "@/lib/benchmark-constants";

export function ManualRunForm({ promptId, onDone }: { promptId: string; onDone: () => void }) {
  const utils = api.useUtils();
  const [provider, setProvider] = useState<string>("openai");
  const [modelId, setModelId] = useState("");
  const [rawAnswer, setRawAnswer] = useState("");

  const submit = api.benchmark.submitRun.useMutation({
    onSuccess: () => {
      toast.success("Run submitted. Extraction will run shortly.");
      void utils.benchmark.listMySubmissions.invalidate();
      onDone();
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/30 p-3">
      <div className="grid gap-2 md:grid-cols-2">
        <Select value={provider} onValueChange={setProvider}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {BENCHMARK_MODEL_PROVIDERS.map((p) => (<SelectItem key={p} value={p}>{p}</SelectItem>))}
          </SelectContent>
        </Select>
        <Input placeholder="model id, e.g. gpt-5-pro" value={modelId} onChange={(e) => setModelId(e.target.value)} />
      </div>
      <Textarea placeholder="Paste the model's raw answer…" value={rawAnswer} onChange={(e) => setRawAnswer(e.target.value)} rows={6} />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button
          size="sm"
          disabled={!modelId.trim() || !rawAnswer.trim() || submit.isPending}
          onClick={() => submit.mutate({
            promptId,
            modelProvider: provider as (typeof BENCHMARK_MODEL_PROVIDERS)[number],
            modelId: modelId.trim(),
            rawAnswer,
          })}
        >
          {submit.isPending ? "Submitting…" : "Submit run"}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Agent run modal (docs + code snippet)**

```tsx
// src/app/[locale]/benchmark/_components/agent-run-modal.tsx
"use client";

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function AgentRunModal({ promptId, onClose }: { promptId: string; onClose: () => void }) {
  const snippet = `// Node.js snippet using your AIT agent API key
const res = await fetch("https://ait.com/api/trpc/benchmark.submitRun?batch=1", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: "Bearer <YOUR_AGENT_API_KEY>"
  },
  body: JSON.stringify({ 0: { json: {
    promptId: "${promptId}",
    modelProvider: "openai",
    modelId: "gpt-5-pro",
    rawAnswer: "<your model's raw output>",
    capturedAt: new Date().toISOString()
  }}})
});
console.log(await res.json());`;

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Run with your agent</DialogTitle>
          <DialogDescription>
            Use your AIT agent API key to submit runs programmatically. Max one
            submission per prompt/model per day.
          </DialogDescription>
        </DialogHeader>
        <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs"><code>{snippet}</code></pre>
        <DialogFooter><Button onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Typecheck + manual verify**

Run: `pnpm typecheck`
Expected: PASS.
In dev: approve a seeded prompt, open Run tab, submit manual run, confirm it lands in DB as `extraction_status='pending'`.

- [ ] **Step 5: Commit**

```bash
git add src/app/\[locale\]/benchmark/_components/run-prompts-tab.tsx src/app/\[locale\]/benchmark/_components/manual-run-form.tsx src/app/\[locale\]/benchmark/_components/agent-run-modal.tsx
git commit -m "feat(benchmark): run-prompts tab with manual + agent submit"
```

---

## Phase 10 — Dashboard Widgets

### Task 19: Prompt-focus widget (top brands bar chart)

**Files:**
- Create: `src/app/[locale]/benchmark/_components/widgets/prompt-focus.tsx`

- [ ] **Step 1: Build widget**

```tsx
// src/app/[locale]/benchmark/_components/widgets/prompt-focus.tsx
"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function PromptFocusWidget() {
  const prompts = api.benchmark.listApprovedPrompts.useQuery({ page: 1, pageSize: 50 });
  const [promptId, setPromptId] = useState<string>("");
  const [mode, setMode] = useState<"weighted" | "raw">("weighted");
  const dash = api.benchmark.getPromptDashboard.useQuery(
    { promptId, windowDays: 30 },
    { enabled: !!promptId },
  );

  const chartData = (dash.data?.rankRows ?? [])
    .map((r) => ({
      brandId: r.brandId,
      score: mode === "weighted" ? Number(r.weightedScore) : r.mentionCount,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Top brands by prompt</h3>
        <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="weighted">Weighted</SelectItem>
            <SelectItem value="raw">Raw count</SelectItem>
          </SelectContent>
        </Select>
      </header>
      <Select value={promptId} onValueChange={setPromptId}>
        <SelectTrigger><SelectValue placeholder="Pick a prompt…" /></SelectTrigger>
        <SelectContent>
          {prompts.data?.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.text}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="h-64">
        {promptId && chartData.length === 0 && dash.isFetched && (
          <p className="py-10 text-center text-sm text-muted-foreground">No mentions yet for this prompt.</p>
        )}
        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="brandId" type="category" width={120} />
              <Tooltip />
              <Bar dataKey="score" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\[locale\]/benchmark/_components/widgets/prompt-focus.tsx
git commit -m "feat(benchmark): prompt-focus widget"
```

### Task 20: Model bias matrix widget (heatmap)

**Files:**
- Create: `src/app/[locale]/benchmark/_components/widgets/model-bias-matrix.tsx`

- [ ] **Step 1: Build widget**

```tsx
// src/app/[locale]/benchmark/_components/widgets/model-bias-matrix.tsx
"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function ModelBiasMatrixWidget() {
  const prompts = api.benchmark.listApprovedPrompts.useQuery({ page: 1, pageSize: 50 });
  const [promptId, setPromptId] = useState<string>("");
  const dash = api.benchmark.getPromptDashboard.useQuery(
    { promptId, windowDays: 30 },
    { enabled: !!promptId },
  );

  const matrix = dash.data?.matrixRows ?? [];
  const allBrands = Array.from(new Set(matrix.flatMap((m) => (m.topBrandIds as string[]) ?? []))).slice(0, 8);
  const models = matrix.map((m) => m.modelId);

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Model bias matrix</h3>
      </header>
      <Select value={promptId} onValueChange={setPromptId}>
        <SelectTrigger><SelectValue placeholder="Pick a prompt…" /></SelectTrigger>
        <SelectContent>
          {prompts.data?.map((p) => (<SelectItem key={p.id} value={p.id}>{p.text}</SelectItem>))}
        </SelectContent>
      </Select>
      {models.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr>
                <th className="border p-1 text-left">Model</th>
                {allBrands.map((b) => (<th key={b} className="border p-1">{b.slice(0, 8)}</th>))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row) => {
                const top = (row.topBrandIds as string[]) ?? [];
                return (
                  <tr key={row.modelId}>
                    <td className="border p-1 font-mono">{row.modelId}</td>
                    {allBrands.map((b) => {
                      const idx = top.indexOf(b);
                      const intensity = idx < 0 ? 0 : 1 - idx / 5;
                      return (
                        <td
                          key={b}
                          className="border p-1 text-center"
                          style={{ background: `rgba(37, 99, 235, ${intensity})`, color: intensity > 0.5 ? "white" : undefined }}
                        >
                          {idx < 0 ? "·" : `#${idx + 1}`}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\[locale\]/benchmark/_components/widgets/model-bias-matrix.tsx
git commit -m "feat(benchmark): model-bias-matrix widget"
```

### Task 21: Brand trend line chart

**Files:**
- Create: `src/app/[locale]/benchmark/_components/widgets/brand-trend.tsx`

- [ ] **Step 1: Build widget**

```tsx
// src/app/[locale]/benchmark/_components/widgets/brand-trend.tsx
"use client";

import { useMemo, useState } from "react";
import { api } from "@/trpc/react";
import { Line, LineChart, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer, Legend } from "recharts";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function BrandTrendWidget() {
  const [slug, setSlug] = useState("openai");
  const brand = api.benchmark.getBrandProfile.useQuery({ slug }, { enabled: slug.length > 0, retry: false });
  const [windowDays, setWindowDays] = useState<number>(90);
  const trend = api.benchmark.getTrend.useQuery(
    { brandId: brand.data?.brand.id ?? "", windowDays },
    { enabled: Boolean(brand.data?.brand.id) },
  );

  const chartData = useMemo(() => {
    const grouped = new Map<string, Record<string, number | string>>();
    for (const row of trend.data ?? []) {
      const date = (row.date as unknown as string).slice(0, 10);
      if (!grouped.has(date)) grouped.set(date, { date });
      grouped.get(date)![row.modelId] = Number(row.mentionPct);
    }
    return [...grouped.values()].sort((a, b) => (a.date as string).localeCompare(b.date as string));
  }, [trend.data]);

  const modelIds = Array.from(new Set((trend.data ?? []).map((r) => r.modelId)));

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <header className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Brand trend over time</h3>
        <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="30">30d</SelectItem>
            <SelectItem value="90">90d</SelectItem>
            <SelectItem value="365">1y</SelectItem>
          </SelectContent>
        </Select>
      </header>
      <Input placeholder="brand slug, e.g. openai" value={slug} onChange={(e) => setSlug(e.target.value)} />
      <div className="h-64">
        {chartData.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              {modelIds.map((m) => (<Line key={m} type="monotone" dataKey={m} />))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\[locale\]/benchmark/_components/widgets/brand-trend.tsx
git commit -m "feat(benchmark): brand-trend widget"
```

### Task 22: Category leaderboard widget

**Files:**
- Create: `src/app/[locale]/benchmark/_components/widgets/category-leaderboard.tsx`

- [ ] **Step 1: Build widget**

```tsx
// src/app/[locale]/benchmark/_components/widgets/category-leaderboard.tsx
"use client";

import { useState } from "react";
import { api } from "@/trpc/react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis, ResponsiveContainer } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function CategoryLeaderboardWidget() {
  const categories = api.benchmark.listCategories.useQuery();
  const [categoryId, setCategoryId] = useState("");
  const lb = api.benchmark.getCategoryLeaderboard.useQuery(
    { categoryId, windowDays: 30 },
    { enabled: !!categoryId },
  );

  const rows = (lb.data as Array<{ id: string; canonical_name: string; total_weighted: string }> | undefined) ?? [];
  const data = rows.map((r) => ({ name: r.canonical_name, score: Number(r.total_weighted) }));

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <header><h3 className="text-sm font-medium">Category leaderboard</h3></header>
      <Select value={categoryId} onValueChange={setCategoryId}>
        <SelectTrigger><SelectValue placeholder="Pick a category…" /></SelectTrigger>
        <SelectContent>
          {categories.data?.map((c) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
        </SelectContent>
      </Select>
      <div className="h-64">
        {data.length > 0 && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="name" type="category" width={140} />
              <Tooltip />
              <Bar dataKey="score" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/\[locale\]/benchmark/_components/widgets/category-leaderboard.tsx
git commit -m "feat(benchmark): category-leaderboard widget"
```

### Task 23: Brand search + latest runs feed

**Files:**
- Create: `src/app/[locale]/benchmark/_components/widgets/brand-search.tsx`
- Create: `src/app/[locale]/benchmark/_components/widgets/latest-runs-feed.tsx`

- [ ] **Step 1: Brand search widget (links to profile page)**

```tsx
// src/app/[locale]/benchmark/_components/widgets/brand-search.tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function BrandSearchWidget() {
  const [slug, setSlug] = useState("");
  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <h3 className="text-sm font-medium">Brand profile</h3>
      <div className="flex gap-2">
        <Input placeholder="brand slug" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
        <Button asChild disabled={!slug}>
          <Link href={`/benchmark/brands/${slug}`}>Open</Link>
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Latest runs feed**

```tsx
// src/app/[locale]/benchmark/_components/widgets/latest-runs-feed.tsx
"use client";

import { api } from "@/trpc/react";

export function LatestRunsFeedWidget() {
  const runs = api.benchmark.getLatestRunsFeed.useQuery({ limit: 20 });
  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <h3 className="text-sm font-medium">Latest runs</h3>
      <ul className="flex flex-col divide-y text-xs">
        {runs.data?.map((r) => (
          <li key={r.id} className="flex justify-between gap-2 p-2">
            <span className="font-mono">{r.modelProvider}/{r.modelId}</span>
            <span className="text-muted-foreground">
              {new Date(r.capturedAt as unknown as string).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: Wire all widgets into dashboard tab**

Replace `src/app/[locale]/benchmark/_components/dashboard-tab.tsx`:

```tsx
"use client";

import { PromptFocusWidget } from "./widgets/prompt-focus";
import { ModelBiasMatrixWidget } from "./widgets/model-bias-matrix";
import { BrandTrendWidget } from "./widgets/brand-trend";
import { CategoryLeaderboardWidget } from "./widgets/category-leaderboard";
import { BrandSearchWidget } from "./widgets/brand-search";
import { LatestRunsFeedWidget } from "./widgets/latest-runs-feed";

export function DashboardTab() {
  return (
    <div className="grid gap-4 py-4 md:grid-cols-2">
      <PromptFocusWidget />
      <ModelBiasMatrixWidget />
      <BrandTrendWidget />
      <CategoryLeaderboardWidget />
      <BrandSearchWidget />
      <LatestRunsFeedWidget />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + dev verify**

Run: `pnpm typecheck`
Expected: PASS.
Open `/benchmark` in dev after seeding (Task 25). All six widgets render without errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/\[locale\]/benchmark/_components/widgets src/app/\[locale\]/benchmark/_components/dashboard-tab.tsx
git commit -m "feat(benchmark): wire remaining widgets + brand search"
```

---

## Phase 11 — Brand Profile Page

### Task 24: Brand detail page

**Files:**
- Create: `src/app/[locale]/benchmark/brands/[slug]/page.tsx`

- [ ] **Step 1: Build page**

```tsx
// src/app/[locale]/benchmark/brands/[slug]/page.tsx
"use client";

import { use } from "react";
import { api } from "@/trpc/react";
import { Badge } from "@/components/ui/badge";

export default function BrandProfilePage({
  params,
}: {
  params: Promise<{ slug: string; locale: string }>;
}) {
  const { slug } = use(params);
  const q = api.benchmark.getBrandProfile.useQuery({ slug });

  if (q.isLoading) return <main className="p-6">Loading…</main>;
  if (q.error) return <main className="p-6">Brand not found.</main>;

  const { brand, mentions } = q.data!;

  return (
    <main className="container mx-auto flex flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold">{brand.canonicalName}</h1>
        {brand.website && (
          <a className="text-sm text-blue-600 underline" href={brand.website} target="_blank" rel="noreferrer">
            {brand.website}
          </a>
        )}
        {brand.aliases.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {brand.aliases.map((a) => (<Badge key={a} variant="secondary">{a}</Badge>))}
          </div>
        )}
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Recent mentions across models</h2>
        <ul className="flex flex-col gap-2">
          {mentions.map((m, i) => (
            <li key={i} className="flex flex-col gap-1 rounded-md border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs">{m.modelProvider}/{m.modelId}</span>
                <Badge variant={
                  m.sentiment === "positive" ? "default"
                  : m.sentiment === "negative" ? "destructive"
                  : "secondary"
                }>{m.sentiment}</Badge>
              </div>
              {m.context && <p className="text-muted-foreground">"{m.context}"</p>}
              <span className="text-xs text-muted-foreground">
                {new Date(m.capturedAt as unknown as string).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\[locale\]/benchmark/brands
git commit -m "feat(benchmark): brand profile page"
```

---

## Phase 12 — Seed + Extractor Agent + Launch

### Task 25: Seed script

**Files:**
- Create: `src/scripts/seed-benchmark.ts`
- Modify: `package.json` (add `benchmark:seed` script)

- [ ] **Step 1: Write seed script**

```ts
// src/scripts/seed-benchmark.ts
import { db } from "@/server/db";
import {
  benchmarkCategories,
  benchmarkIntents,
  benchmarkPrompts,
  brands,
} from "@/server/db/schema";
import { SEED_INTENTS } from "@/lib/benchmark-constants";
import { eq } from "drizzle-orm";

async function main() {
  // Intents
  for (const i of SEED_INTENTS) {
    await db.insert(benchmarkIntents)
      .values({ slug: i.slug, name: i.name, description: i.description })
      .onConflictDoNothing();
  }

  // Top-level categories
  const CATS = [
    { slug: "saas", name: "SaaS" },
    { slug: "ecommerce", name: "E-commerce" },
    { slug: "travel", name: "Travel" },
    { slug: "finance", name: "Finance" },
    { slug: "devtools", name: "DevTools" },
    { slug: "ai-tools", name: "AI Tools" },
    { slug: "health", name: "Health" },
    { slug: "media", name: "Media" },
  ];
  for (const c of CATS) {
    await db.insert(benchmarkCategories)
      .values({ slug: c.slug, name: c.name })
      .onConflictDoNothing();
  }

  const aiToolsRow = await db
    .select().from(benchmarkCategories).where(eq(benchmarkCategories.slug, "ai-tools")).limit(1);
  const aiTools = aiToolsRow[0];

  // Starter brands for AI tools
  const AI_BRANDS = [
    { slug: "openai", canonicalName: "OpenAI", aliases: ["chatgpt", "gpt-4", "gpt"] },
    { slug: "anthropic", canonicalName: "Anthropic", aliases: ["claude"] },
    { slug: "google-gemini", canonicalName: "Google Gemini", aliases: ["gemini", "bard"] },
    { slug: "meta-llama", canonicalName: "Meta Llama", aliases: ["llama"] },
    { slug: "perplexity", canonicalName: "Perplexity", aliases: [] },
  ];
  for (const b of AI_BRANDS) {
    await db.insert(brands)
      .values({ slug: b.slug, canonicalName: b.canonicalName, aliases: b.aliases, categoryIds: [aiTools.id], verified: true })
      .onConflictDoNothing();
  }

  console.log("Seeded benchmark taxonomy + starter brands.");
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Add npm script**

Edit `package.json` scripts:

```json
"benchmark:seed": "tsx src/scripts/seed-benchmark.ts"
```

(If `tsx` is not already used in scripts, match the runner other scripts use — `rg '"scripts":' -A 30 package.json` to confirm.)

- [ ] **Step 3: Run seed**

Run: `pnpm benchmark:seed`
Expected: stdout `Seeded benchmark taxonomy + starter brands.`

- [ ] **Step 4: Commit**

```bash
git add src/scripts/seed-benchmark.ts package.json
git commit -m "feat(benchmark): seed script for taxonomy + starter brands"
```

### Task 26: Standalone extractor agent

**Files:**
- Create: `src/scripts/benchmark-extractor/run.ts`
- Create: `src/scripts/benchmark-extractor/README.md`

- [ ] **Step 1: Write agent script**

```ts
// src/scripts/benchmark-extractor/run.ts
import Anthropic from "@anthropic-ai/sdk"; // install if not present
import { EXTRACTOR_VERSION } from "@/server/benchmark/extractor-prompt";

const API_BASE = process.env.AIT_API_BASE ?? "http://localhost:3000";
const API_KEY = process.env.AIT_EXTRACTOR_API_KEY!;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY!;

if (!API_KEY || !ANTHROPIC_KEY) {
  console.error("Set AIT_EXTRACTOR_API_KEY and ANTHROPIC_API_KEY.");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey: ANTHROPIC_KEY });

async function trpc<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}/api/trpc/${path}?batch=1`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ 0: { json: body } }),
  });
  const data = await res.json();
  if (!res.ok || data[0]?.error) throw new Error(JSON.stringify(data));
  return data[0].result.data.json as T;
}

async function processRun(runId: string) {
  const fetched = await trpc<{ renderedPrompt: string }>(
    "benchmark.getRunForExtraction",
    { runId },
  );

  const resp = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: fetched.renderedPrompt }],
  });

  const text = resp.content.map((c) => (c.type === "text" ? c.text : "")).join("");
  const json = JSON.parse(text);

  await trpc("benchmark.submitExtraction", {
    runId,
    extractorVersion: EXTRACTOR_VERSION,
    mentions: json.mentions,
  });
  console.log("ok", runId);
}

// Entry: accept run IDs on argv OR poll endpoint that returns pending runs.
const runIds = process.argv.slice(2);
if (runIds.length === 0) {
  console.error("Usage: tsx run.ts <runId> [runId...]");
  process.exit(1);
}
for (const id of runIds) {
  try { await processRun(id); } catch (err) { console.error("fail", id, err); }
}
```

- [ ] **Step 2: Write README**

```md
# Benchmark Extractor Agent

Listens (or is dispatched) to `benchmark.run.created` webhook events, calls the
extractor model, and posts structured brand mentions back to AIT.

## Setup

1. Register an AIT agent under the extractor-owner account. Copy its API key.
2. Configure webhook (category = `benchmark`, URL = this service).
3. `ANTHROPIC_API_KEY=… AIT_EXTRACTOR_API_KEY=… pnpm tsx src/scripts/benchmark-extractor/run.ts <runId>`

Production: deploy as a small Node service receiving webhook POSTs and
spawning the process per run.
```

- [ ] **Step 3: Add Anthropic SDK dep if missing**

Run: `rg '"@anthropic-ai/sdk"' package.json || pnpm add @anthropic-ai/sdk`

- [ ] **Step 4: Commit**

```bash
git add src/scripts/benchmark-extractor package.json pnpm-lock.yaml
git commit -m "feat(benchmark): extractor agent script + README"
```

### Task 27: Seed starter approved prompts

**Files:**
- Modify: `src/scripts/seed-benchmark.ts`

- [ ] **Step 1: Append prompt seeding after brands section**

```ts
  // Starter approved prompts (requires at least one admin user)
  const [anyUser] = await db.execute<{ id: string }>(`SELECT id FROM "public"."user" LIMIT 1` as any);
  if (anyUser) {
    const recommendation = (await db.select().from(benchmarkIntents).where(eq(benchmarkIntents.slug, "recommendation")).limit(1))[0];
    const starterPrompts = [
      "What is the best CRM for early-stage startups?",
      "Which AI coding assistant should a solo indie developer use?",
      "Name the top three LLM APIs for building a chatbot.",
      "Best password manager for small teams?",
      "What's the most reliable email-newsletter platform?",
    ];
    for (const p of starterPrompts) {
      await db.insert(benchmarkPrompts)
        .values({
          text: p,
          categoryId: aiTools.id,
          intentId: recommendation.id,
          submittedByUserId: anyUser.id as unknown as string,
          status: "approved",
          approvedByUserId: anyUser.id as unknown as string,
          approvedAt: new Date(),
        })
        .onConflictDoNothing();
    }
  }
```

- [ ] **Step 2: Re-run seed**

Run: `pnpm benchmark:seed`
Expected: additional prompts inserted; verify with `pnpm db:studio` that `benchmark_prompt` has 5 approved rows.

- [ ] **Step 3: Commit**

```bash
git add src/scripts/seed-benchmark.ts
git commit -m "feat(benchmark): seed starter approved prompts"
```

### Task 28: End-to-end smoke + launch checklist

**Files:**
- None (verification only).

- [ ] **Step 1: Run full check**

Run: `pnpm check && pnpm test`
Expected: lint + typecheck + all tests pass.

- [ ] **Step 2: Manual smoke**

With `pnpm dev` running:
1. Seed DB (`pnpm benchmark:seed`).
2. Visit `/benchmark` → three tabs render.
3. Log in as an approved user; Submit tab → propose a prompt.
4. In Payload admin (`/admin`), approve the new prompt.
5. Run tab → submit manual run on a seeded prompt.
6. Trigger extractor locally: `AIT_EXTRACTOR_API_KEY=… ANTHROPIC_API_KEY=… pnpm tsx src/scripts/benchmark-extractor/run.ts <runId>`.
7. Confirm mentions appear in DB; confirm run `extraction_status='done'`.
8. Trigger aggregate cron: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/benchmark-aggregate`.
9. Refresh Dashboard tab; confirm at least one widget renders with data.
10. Open `/benchmark/brands/openai`; confirm brand profile renders.

- [ ] **Step 3: Launch PR**

```bash
git checkout -b feat/brand-bias-benchmark
git push -u origin feat/brand-bias-benchmark
gh pr create --title "feat: brand-bias benchmark (replaces quiz benchmark)" --body "$(cat <<'EOF'
## Summary
- Replace correctness quiz with community brand-bias benchmark
- Prompt submission + approval, agent/manual runs, async extractor
- Tab-based UI with six dashboard widgets
- Drops old benchmark tables; seeds starter taxonomy + prompts

## Test plan
- [ ] pnpm check
- [ ] pnpm test
- [ ] Manual flow per plan §28
EOF
)"
```
