/**
 * The badge backfill (ADR-0039): gives every member the track tiers they
 * already qualify for, and moves free-text prize rows out of
 * `member_badge` into `member_award`. The CLI is `scripts/backfill-badges.ts`;
 * this is its core, so it is tested against the test database.
 *
 * - Dry-run by default: reads only, and reports what `apply` would write.
 * - Idempotent: earning skips held badges, and a moved prize row is gone
 *   from `member_badge`, so a re-run writes nothing.
 * - Retroactive: backfilled badges get no XP bonus, activity event or
 *   notification (see `recordRetroactiveTiers`).
 * - Never deletes a stored badge row it cannot match to a challenge.
 * - Reports every failure (a metric read, a badge write, a prize move),
 *   continues with the rest, and `backfillSucceeded` is then false, so the
 *   CLI exits non-zero.
 */
import { and, asc, eq, gt, inArray } from "drizzle-orm";
import type { Payload } from "payload";

import {
  BADGE_TRACK_IDS,
  isBadgeSlug,
  reachedTiers,
  type BadgeTrackId,
} from "@/lib/badges/catalog";
import type { db as appDb } from "@/server/db";
import {
  challengeEnrollments,
  memberAwards,
  memberBadges,
  memberProfiles,
} from "@/server/db/schema";

import { awardLabel } from "./awards";
import { recordRetroactiveTiers } from "./engine";
import { TRACK_METRICS, type BadgeSources } from "./metrics";

type Db = typeof appDb;

export interface BackfillOptions {
  /** Write. Without it the run only reads and reports. */
  apply: boolean;
  /** Members per batch. */
  batchSize?: number;
  /** Limit the run to these members (targeted re-runs and tests). */
  userIds?: readonly string[];
  log?: (line: string) => void;
}

export type AwardMatch =
  /** Exactly one challenge with this prize text that the member joined. */
  | "matched"
  /** Several such challenges: kept, needs a person to decide. */
  | "ambiguous"
  /** No such challenge: kept, a candidate for removal by hand. */
  | "unmatched";

export interface OffCatalogSlug {
  slug: string;
  holders: number;
  /** Holders whose row matches a challenge prize, by outcome. */
  awards: Record<AwardMatch, number>;
}

/** A write the backfill could not make; the run went on without it. */
export type BackfillFailure =
  | { kind: "metrics"; userId: string; error: string }
  | { kind: "badges"; userId: string; track: BadgeTrackId; error: string }
  | { kind: "award"; userId: string; slug: string; error: string };

export interface BackfillReport {
  apply: boolean;
  members: number;
  /** Per track, per tier: members who reach the tier but do not hold it. */
  newTiers: Record<BadgeTrackId, Record<string, number>>;
  /** Badge rows written (apply only). */
  inserted: number;
  /** Stored badge rows whose slug is not in the catalog, by slug. */
  offCatalog: OffCatalogSlug[];
  /** Prize rows moved to `member_award` (apply only). */
  awardsMoved: number;
  /** Everything that failed, in the order it happened. */
  failures: BackfillFailure[];
}

/** Whether the run did everything it set out to do. */
export function backfillSucceeded(report: BackfillReport): boolean {
  return report.failures.length === 0;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

const DEFAULT_BATCH = 100;

function emptyNewTiers(): BackfillReport["newTiers"] {
  return Object.fromEntries(
    BADGE_TRACK_IDS.map((track) => [track, {}]),
  ) as BackfillReport["newTiers"];
}

async function memberBatch(
  db: Db,
  after: string | null,
  size: number,
  only: readonly string[] | undefined,
): Promise<string[]> {
  const conditions = [
    ...(after ? [gt(memberProfiles.userId, after)] : []),
    ...(only ? [inArray(memberProfiles.userId, [...only])] : []),
  ];
  const rows = await db
    .select({ userId: memberProfiles.userId })
    .from(memberProfiles)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(asc(memberProfiles.userId))
    .limit(size);
  return rows.map((row) => row.userId);
}

/** Evaluates every track for one batch of members. */
async function backfillTracks(
  db: Db,
  payload: () => Promise<Payload>,
  userIds: readonly string[],
  options: BackfillOptions,
  report: BackfillReport,
): Promise<void> {
  const held = await db
    .select({ userId: memberBadges.userId, slug: memberBadges.badgeSlug })
    .from(memberBadges)
    .where(inArray(memberBadges.userId, [...userIds]));
  const heldBy = new Map<string, Set<string>>();
  for (const row of held) {
    const set = heldBy.get(row.userId) ?? new Set<string>();
    set.add(row.slug);
    heldBy.set(row.userId, set);
  }

  const sources: BadgeSources = { db, payload };
  for (const userId of userIds) {
    const holds = heldBy.get(userId) ?? new Set<string>();
    let metrics: [BadgeTrackId, number][];
    try {
      metrics = [];
      for (const track of BADGE_TRACK_IDS) {
        metrics.push([track, await TRACK_METRICS[track](sources, userId)]);
      }
    } catch (err) {
      report.failures.push({
        kind: "metrics",
        userId,
        error: errorText(err),
      });
      options.log?.(`  ! ${userId}: metrics failed: ${errorText(err)}`);
      continue;
    }

    for (const [track, metric] of metrics) {
      const missing = reachedTiers(track, metric).filter(
        (badge) => !holds.has(badge.slug),
      );
      if (missing.length === 0) continue;
      for (const badge of missing) {
        report.newTiers[track][badge.slug] =
          (report.newTiers[track][badge.slug] ?? 0) + 1;
      }
      if (options.apply) {
        try {
          const earned = await recordRetroactiveTiers(
            db,
            userId,
            track,
            metric,
          );
          report.inserted += earned.length;
        } catch (err) {
          report.failures.push({
            kind: "badges",
            userId,
            track,
            error: errorText(err),
          });
          options.log?.(
            `  ! ${userId}: ${track} badges not written: ${errorText(err)}`,
          );
        }
      }
    }
  }
}

interface OffCatalogRow {
  id: string;
  userId: string;
  slug: string;
  earnedAt: Date;
}

/**
 * Stored rows whose slug is not in the catalog, each matched to the
 * challenge whose prize text it is: a challenge with that exact
 * `rewards.badgeReward` that the member joined.
 */
async function matchOffCatalogRows(
  db: Db,
  payload: () => Promise<Payload>,
  only: readonly string[] | undefined,
): Promise<{
  rows: (OffCatalogRow & { match: AwardMatch; challengeId: number | null })[];
}> {
  const stored = await db
    .select({
      id: memberBadges.id,
      userId: memberBadges.userId,
      slug: memberBadges.badgeSlug,
      earnedAt: memberBadges.earnedAt,
    })
    .from(memberBadges)
    .where(only ? inArray(memberBadges.userId, [...only]) : undefined);
  const offCatalog = stored.filter((row) => !isBadgeSlug(row.slug));
  if (offCatalog.length === 0) return { rows: [] };

  const texts = [...new Set(offCatalog.map((row) => row.slug))];
  const { docs: challenges } = await (
    await payload()
  ).find({
    collection: "challenges",
    where: { "rewards.badgeReward": { in: texts } },
    select: { rewards: true },
    pagination: false,
    depth: 0,
  });
  const challengesByText = new Map<string, number[]>();
  for (const challenge of challenges) {
    const text = challenge.rewards?.badgeReward;
    if (!text) continue;
    challengesByText.set(text, [
      ...(challengesByText.get(text) ?? []),
      challenge.id,
    ]);
  }

  const challengeIds = challenges.map((challenge) => challenge.id);
  const enrolments =
    challengeIds.length > 0
      ? await db
          .select({
            userId: challengeEnrollments.userId,
            challengeId: challengeEnrollments.challengeId,
          })
          .from(challengeEnrollments)
          .where(
            and(
              inArray(challengeEnrollments.challengeId, challengeIds),
              inArray(challengeEnrollments.userId, [
                ...new Set(offCatalog.map((row) => row.userId)),
              ]),
            ),
          )
      : [];
  const joined = new Set(
    enrolments.map((row) => `${row.userId}:${row.challengeId}`),
  );

  return {
    rows: offCatalog.map((row) => {
      const candidates = (challengesByText.get(row.slug) ?? []).filter((id) =>
        joined.has(`${row.userId}:${id}`),
      );
      const match: AwardMatch =
        candidates.length === 1
          ? "matched"
          : candidates.length > 1
            ? "ambiguous"
            : "unmatched";
      return {
        ...row,
        match,
        challengeId: candidates.length === 1 ? candidates[0]! : null,
      };
    }),
  };
}

/** Moves one matched prize row into `member_award`, keeping its date. */
async function moveToAward(
  db: Db,
  row: OffCatalogRow & { challengeId: number },
): Promise<boolean> {
  const label = awardLabel(row.slug);
  if (!label) return false;
  await db.transaction(async (tx) => {
    await tx
      .insert(memberAwards)
      .values({
        userId: row.userId,
        challengeId: row.challengeId,
        label,
        earnedAt: row.earnedAt,
      })
      .onConflictDoNothing();
    await tx.delete(memberBadges).where(eq(memberBadges.id, row.id));
  });
  return true;
}

export async function runBadgeBackfill(
  deps: { db: Db; payload: () => Promise<Payload> },
  options: BackfillOptions,
): Promise<BackfillReport> {
  const { db, payload } = deps;
  const batchSize = options.batchSize ?? DEFAULT_BATCH;
  const report: BackfillReport = {
    apply: options.apply,
    members: 0,
    newTiers: emptyNewTiers(),
    inserted: 0,
    offCatalog: [],
    awardsMoved: 0,
    failures: [],
  };

  // Off-catalog rows are reported as found; matched prize rows then move.
  const { rows } = await matchOffCatalogRows(db, payload, options.userIds);
  const bySlug = new Map<string, OffCatalogSlug>();
  for (const row of rows) {
    const entry = bySlug.get(row.slug) ?? {
      slug: row.slug,
      holders: 0,
      awards: { matched: 0, ambiguous: 0, unmatched: 0 },
    };
    entry.holders += 1;
    entry.awards[row.match] += 1;
    bySlug.set(row.slug, entry);
    if (options.apply && row.match === "matched" && row.challengeId !== null) {
      try {
        if (await moveToAward(db, { ...row, challengeId: row.challengeId })) {
          report.awardsMoved += 1;
        }
      } catch (err) {
        report.failures.push({
          kind: "award",
          userId: row.userId,
          slug: row.slug,
          error: errorText(err),
        });
        options.log?.(
          `  ! ${row.userId}: prize ${JSON.stringify(row.slug)} not moved: ${errorText(err)}`,
        );
      }
    }
  }
  report.offCatalog = [...bySlug.values()].sort((a, b) =>
    a.slug.localeCompare(b.slug),
  );

  let after: string | null = null;
  for (;;) {
    const batch = await memberBatch(db, after, batchSize, options.userIds);
    if (batch.length === 0) break;
    await backfillTracks(db, payload, batch, options, report);
    report.members += batch.length;
    after = batch[batch.length - 1]!;
    options.log?.(`  … ${report.members} members evaluated`);
  }

  return report;
}

/** The report as lines for the terminal. */
export function formatBackfillReport(report: BackfillReport): string[] {
  const lines = [
    report.apply ? "Badge backfill — APPLIED" : "Badge backfill — dry run",
    `Members evaluated: ${report.members}`,
    "",
    "Track tiers members reach but do not hold yet:",
  ];
  for (const track of BADGE_TRACK_IDS) {
    const tiers = Object.entries(report.newTiers[track]);
    lines.push(
      `  ${track}: ${
        tiers.length === 0
          ? "none"
          : tiers.map(([slug, count]) => `${slug} ${count}`).join(", ")
      }`,
    );
  }
  if (report.apply) lines.push(`Badge rows written: ${report.inserted}`);
  lines.push("", "Stored badge rows not in the catalog:");
  if (report.offCatalog.length === 0) lines.push("  none");
  for (const entry of report.offCatalog) {
    lines.push(
      `  ${JSON.stringify(entry.slug)}: ${entry.holders} holder(s) — ` +
        `award match ${entry.awards.matched}, ambiguous ${entry.awards.ambiguous}, ` +
        `unmatched ${entry.awards.unmatched}`,
    );
  }
  if (report.apply) {
    lines.push(`Prize rows moved to member_award: ${report.awardsMoved}`);
  }
  lines.push("", `Failures: ${report.failures.length}`);
  for (const failure of report.failures) {
    const what =
      failure.kind === "metrics"
        ? "metrics not read (member skipped)"
        : failure.kind === "badges"
          ? `${failure.track} badges not written`
          : `prize ${JSON.stringify(failure.slug)} not moved`;
    lines.push(`  ${failure.userId}: ${what} — ${failure.error}`);
  }
  if (!backfillSucceeded(report)) {
    lines.push("Some writes failed; fix the cause and re-run (it is safe).");
  }
  return lines;
}
