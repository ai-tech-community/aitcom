import { and, eq, inArray } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import type { ModelSurface } from "@/server/db/schema";
import { benchmarkRuns } from "@/server/db/schema";

import { ENABLED_SURFACES } from "./proxy";
import { surfacesForLocale } from "./proxy/locale-eligibility";

type DB = typeof _db;

export interface SeedQueuedRunsInput {
  promptId: string;
  locale: string;
}

export interface SeedQueuedRunsResult {
  /** Surfaces that produced a new queued row. */
  seeded: ModelSurface[];
  /**
   * Surfaces skipped because a queued or running row already exists for
   * (prompt, surface). Idempotent re-seeds do not duplicate work.
   */
  skippedExisting: ModelSurface[];
  /** Surfaces skipped because their allowed-locales set excludes the prompt locale. */
  skippedLocale: ModelSurface[];
}

/**
 * Pure decision logic: given the candidate surfaces, the prompt's locale, and
 * the surfaces that already have a queued/running row for this prompt, decide
 * which surfaces still need seeding and why each one was skipped.
 */
export function decideSurfacesToSeed(
  candidates: readonly ModelSurface[],
  locale: string,
  alreadyQueuedOrRunning: readonly ModelSurface[],
): SeedQueuedRunsResult {
  const localeEligible = surfacesForLocale(candidates, locale);
  const skippedLocale = candidates.filter((s) => !localeEligible.includes(s));
  const alreadyHave = new Set(alreadyQueuedOrRunning);
  const seeded = localeEligible.filter((s) => !alreadyHave.has(s));
  const skippedExisting = localeEligible.filter((s) => alreadyHave.has(s));
  return { seeded, skippedExisting, skippedLocale };
}

/**
 * Insert one queued benchmark_run row per enabled surface that allows the
 * prompt's locale. Idempotent: surfaces that already have a queued or running
 * row for this prompt are skipped.
 *
 * Placeholder values are used for fields the worker fills in on success
 * (model_provider, model_id, raw_answer, captured_at). The worker treats
 * `proxy_status='queued'` rows as work to do regardless of placeholder
 * content.
 */
export async function seedQueuedRunsForApprovedPrompt(
  db: DB,
  input: SeedQueuedRunsInput,
  options: { enabledSurfaces?: readonly ModelSurface[] } = {},
): Promise<SeedQueuedRunsResult> {
  const candidates = options.enabledSurfaces ?? ENABLED_SURFACES;

  const localeEligible = surfacesForLocale(candidates, input.locale);
  if (localeEligible.length === 0) {
    return decideSurfacesToSeed(candidates, input.locale, []);
  }

  const existing = await db
    .select({ surface: benchmarkRuns.modelSurface })
    .from(benchmarkRuns)
    .where(
      and(
        eq(benchmarkRuns.promptId, input.promptId),
        inArray(benchmarkRuns.modelSurface, localeEligible),
        inArray(benchmarkRuns.proxyStatus, ["queued", "running"]),
      ),
    );

  const decision = decideSurfacesToSeed(
    candidates,
    input.locale,
    existing.map((r) => r.surface),
  );

  if (decision.seeded.length === 0) {
    return decision;
  }

  const now = new Date();
  await db.insert(benchmarkRuns).values(
    decision.seeded.map((surface) => ({
      promptId: input.promptId,
      submittedByUserId: null,
      modelProvider: "pending",
      modelId: "pending",
      modelSurface: surface,
      rawAnswer: "",
      locale: input.locale,
      capturedAt: now,
      proxyStatus: "queued" as const,
      extractionStatus: "skipped",
    })),
  );

  return decision;
}
