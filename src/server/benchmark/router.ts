import type { db as _db } from "@/server/db";
import type { ModelSurface } from "@/server/db/schema";

import { ENABLED_SURFACES } from "./proxy";
import { surfaceAllowsLocale } from "./proxy/locale-eligibility";
import { seedQueuedRunsForApprovedPrompt } from "./seed-queued-runs";

type DB = typeof _db;

/**
 * A `(prompt, surface)` cell the router is considering for refresh. The
 * router scores and orders these, then queues the top K within budget.
 *
 * `newestDoneAt = null` means this surface has never produced a `done` run
 * for this prompt — it gets priority over stale-but-existing cells.
 */
export interface RefreshCandidate {
  promptId: string;
  promptLocale: string;
  newestDoneAt: Date | null;
}

/**
 * Database operations the router needs. Drizzle adapter implements this;
 * tests inject a fake.
 */
export interface RouterDb {
  /**
   * Spend in cents per surface today (UTC). Identical contract to the
   * proxy-runner's spentTodayBySurface so a single Drizzle implementation
   * can back both if desired.
   */
  spentTodayBySurface(): Promise<Map<ModelSurface, number>>;

  /**
   * Find approved prompts that need a refresh on `surface`. A prompt is
   * eligible when:
   *   - the surface allows its locale (the adapter enforces this via the
   *     allowedLocales argument);
   *   - it has no `queued` or `running` row on this surface;
   *   - it has no `done` run on this surface OR its newest `done` run is
   *     older than `staleAfterDays`.
   * Results MUST be ordered: missing-entirely first, then oldest-stale
   * first, then promptId for stable ordering.
   */
  findRefreshCandidates(args: {
    surface: ModelSurface;
    allowedLocales: readonly string[];
    staleAfterDays: number;
    limit: number;
  }): Promise<RefreshCandidate[]>;
}

export interface RouterTickOptions {
  enabledSurfaces?: readonly ModelSurface[];
  staleAfterDays?: number;
  /** Max cells to enqueue per surface per tick. Default 10. */
  perSurfaceLimit?: number;
  /** Daily spend cap in cents per surface; absent surface = no cap. */
  budgetCentsBySurface?: Partial<Record<ModelSurface, number>>;
  /**
   * Per-surface allowed-locales lookup. Defaults to the production map
   * from proxy/locale-eligibility. Override in tests so the SQL filter
   * matches the fake adapter.
   */
  allowedLocales?: (surface: ModelSurface) => readonly string[];
}

export interface RouterTickResult {
  /** Cells the router queued per surface. */
  queuedBySurface: Record<string, number>;
  /** Surfaces skipped entirely because their daily budget was exhausted. */
  skippedSurfaces: ModelSurface[];
}

const DEFAULT_LOCALES: Record<ModelSurface, readonly string[]> = {
  chatgpt_grounded: [
    "en-US",
    "en-GB",
    "de-DE",
    "fr-FR",
    "es-ES",
    "it-IT",
    "nl-NL",
    "pt-BR",
    "pt-PT",
    "ja-JP",
  ],
  chatgpt_ungrounded: [],
  claude_grounded: [],
  claude_ungrounded: [],
  gemini_grounded: [],
  gemini_ungrounded: [],
  perplexity: [],
  kimi_grounded: [],
  legacy_unverified: [],
};

function defaultAllowedLocales(surface: ModelSurface): readonly string[] {
  return DEFAULT_LOCALES[surface];
}

/**
 * Decide which surfaces still have budget remaining. Mirrors
 * decideEligibleSurfaces in proxy-runner.ts — duplicated rather than
 * shared so the two cron jobs evolve independently.
 */
export function decideRouterEligibleSurfaces(
  enabled: readonly ModelSurface[],
  spent: Map<ModelSurface, number>,
  budget: Partial<Record<ModelSurface, number>> | undefined,
): { eligible: ModelSurface[]; skipped: ModelSurface[] } {
  const eligible: ModelSurface[] = [];
  const skipped: ModelSurface[] = [];
  for (const surface of enabled) {
    const cap = budget?.[surface];
    const used = spent.get(surface) ?? 0;
    if (typeof cap === "number" && used >= cap) {
      skipped.push(surface);
    } else {
      eligible.push(surface);
    }
  }
  return { eligible, skipped };
}

/**
 * Pure ordering: missing-entirely (newestDoneAt === null) ranks above
 * any stale-but-existing cell; within each group, older comes first.
 * `promptId` ASC breaks ties for deterministic tests.
 */
export function orderRefreshCandidates(
  candidates: readonly RefreshCandidate[],
): RefreshCandidate[] {
  return [...candidates].sort((a, b) => {
    const aMissing = a.newestDoneAt === null ? 0 : 1;
    const bMissing = b.newestDoneAt === null ? 0 : 1;
    if (aMissing !== bMissing) return aMissing - bMissing;
    const aT = a.newestDoneAt?.getTime() ?? 0;
    const bT = b.newestDoneAt?.getTime() ?? 0;
    if (aT !== bT) return aT - bT;
    return a.promptId.localeCompare(b.promptId);
  });
}

/**
 * One router tick. Loops over enabled surfaces with budget, finds the
 * top-K refresh candidates per surface, and seeds queued rows via the
 * existing auto-seed helper. The helper's idempotency check prevents
 * double-queueing if two ticks race.
 *
 * Demand signals (brand watches, profile views, cross-surface gap) are
 * intentionally not part of the V1 score — they require data the system
 * doesn't yet have (view tracking) or are moot with one enabled surface
 * (cross-surface gap). When the second surface lands or view tracking
 * is added, extend RefreshCandidate and re-key the ordering.
 */
export async function runBenchmarkRouterTick(
  db: DB,
  routerDb: RouterDb,
  options: RouterTickOptions = {},
): Promise<RouterTickResult> {
  const enabled = options.enabledSurfaces ?? ENABLED_SURFACES;
  const staleAfterDays = options.staleAfterDays ?? 14;
  const perSurfaceLimit = options.perSurfaceLimit ?? 10;
  const allowedLocalesFn = options.allowedLocales ?? defaultAllowedLocales;

  const spent = await routerDb.spentTodayBySurface();
  const { eligible, skipped } = decideRouterEligibleSurfaces(
    enabled,
    spent,
    options.budgetCentsBySurface,
  );

  const queuedBySurface: Record<string, number> = {};

  for (const surface of eligible) {
    const allowedLocales = allowedLocalesFn(surface);
    if (allowedLocales.length === 0) continue;

    const candidates = await routerDb.findRefreshCandidates({
      surface,
      allowedLocales,
      staleAfterDays,
      limit: perSurfaceLimit,
    });

    let queued = 0;
    for (const c of candidates) {
      // Defence in depth — the adapter already filtered by locale, but a
      // misconfigured allowedLocales arg shouldn't queue an ineligible cell.
      if (!surfaceAllowsLocale(surface, c.promptLocale)) continue;

      const result = await seedQueuedRunsForApprovedPrompt(
        db,
        { promptId: c.promptId, locale: c.promptLocale },
        { enabledSurfaces: [surface] },
      );
      if (result.seeded.includes(surface)) queued += 1;
    }
    queuedBySurface[surface] = queued;
  }

  return { queuedBySurface, skippedSurfaces: skipped };
}
