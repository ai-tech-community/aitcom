import { and, countDistinct, eq, inArray, ne, sql } from "drizzle-orm";
import type { Payload, PayloadRequest } from "payload";

import type { BadgeTrackId } from "@/lib/badges/catalog";
import { computeStreakData } from "@/lib/gamification";
import type { db as appDb } from "@/server/db";
import {
  agentProfiles,
  challengeEnrollments,
  courseCertificates,
  courseEnrollments,
  eventRegistrations,
  referralCredits,
} from "@/server/db/schema";
import { memberActiveDays } from "@/server/members/active-days";
import { HOSTED_EVENT_STATUSES } from "@/server/members/profile-work";

type Tx = Parameters<Parameters<(typeof appDb)["transaction"]>[0]>[0];

/** The app database, or a transaction on it. */
export type BadgeDb = typeof appDb | Tx;

/** Where a track's metric is read from. */
export interface BadgeSources {
  db: BadgeDb;
  /** Payload, loaded only when a metric needs it. */
  payload: () => Promise<Payload>;
  /**
   * The Payload request of a collection hook, so a metric read inside the
   * hook sees the document the hook's transaction just wrote.
   */
  req?: PayloadRequest;
}

/** Reads one track's count for a member from its source of truth. */
export type TrackMetric = (
  sources: BadgeSources,
  userId: string,
) => Promise<number>;

async function countRows(query: Promise<{ n: number }[]>): Promise<number> {
  const [row] = await query;
  return Number(row?.n ?? 0);
}

/** Events attended (`event_registration.status = attended`). */
const regular: TrackMetric = ({ db }, userId) =>
  countRows(
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.userId, userId),
          eq(eventRegistrations.status, "attended"),
        ),
      ),
  );

/**
 * Native events the member organised that took place: live (published or
 * completed, so never cancelled), not imported from Luma, and either
 * started already or with a member checked in at the door. The check-in
 * counts too because the organizer can check people in before the start
 * time, and that is the moment the Host track is evaluated.
 */
const host: TrackMetric = async ({ db, payload, req }, userId) => {
  const { docs } = await (
    await payload()
  ).find({
    collection: "events",
    where: {
      and: [
        { organizerId: { equals: userId } },
        { status: { in: [...HOSTED_EVENT_STATUSES] } },
        { discoverySource: { not_equals: "luma" } },
      ],
    },
    select: { date: true },
    pagination: false,
    depth: 0,
    req,
  });
  const now = Date.now();
  const started = docs.filter((e) => e.date && Date.parse(e.date) <= now);
  const notStarted = docs
    .filter((e) => !(e.date && Date.parse(e.date) <= now))
    .map((e) => e.id);
  if (notStarted.length === 0) return started.length;

  const checkedIn = await countRows(
    db
      .select({ n: countDistinct(eventRegistrations.eventId) })
      .from(eventRegistrations)
      .where(
        and(
          inArray(eventRegistrations.eventId, notStarted),
          eq(eventRegistrations.status, "attended"),
        ),
      ),
  );
  return started.length + checkedIn;
};

/** Challenges completed (`challenge_enrollment.status = completed`). */
const challenger: TrackMetric = ({ db }, userId) =>
  countRows(
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(challengeEnrollments)
      .where(
        and(
          eq(challengeEnrollments.userId, userId),
          eq(challengeEnrollments.status, "completed"),
        ),
      ),
  );

/** Articles published and approved. */
const writer: TrackMetric = async ({ payload, req }, userId) => {
  const { totalDocs } = await (
    await payload()
  ).count({
    collection: "articles",
    where: {
      and: [
        { authorId: { equals: userId } },
        { status: { equals: "published" } },
        { reviewStatus: { equals: "approved" } },
      ],
    },
    req,
  });
  return totalDocs;
};

/** Launchpad projects published. */
const builder: TrackMetric = async ({ payload, req }, userId) => {
  const { totalDocs } = await (
    await payload()
  ).count({
    collection: "launchpad-projects",
    where: {
      and: [
        { authorId: { equals: userId } },
        { status: { equals: "published" } },
      ],
    },
    req,
  });
  return totalDocs;
};

/** Courses completed (`course_certificate`). */
const learner: TrackMetric = ({ db }, userId) =>
  countRows(
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(courseCertificates)
      .where(eq(courseCertificates.userId, userId)),
  );

/** Enrolments by other members in courses the member authored. */
const teacher: TrackMetric = async ({ db, payload, req }, userId) => {
  const { docs } = await (
    await payload()
  ).find({
    collection: "courses",
    where: { authorId: { equals: userId } },
    select: { slug: true },
    pagination: false,
    depth: 0,
    req,
  });
  if (docs.length === 0) return 0;
  return countRows(
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(courseEnrollments)
      .where(
        and(
          inArray(
            courseEnrollments.courseId,
            docs.map((course) => course.id),
          ),
          ne(courseEnrollments.userId, userId),
        ),
      ),
  );
};

/** Referrals that became active (`referral_credit`). */
const connector: TrackMetric = ({ db }, userId) =>
  countRows(
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(referralCredits)
      .where(eq(referralCredits.referrerId, userId)),
  );

/** Contributions of the member's agent (`agent_profile.totalContributions`). */
const agentWrangler: TrackMetric = ({ db }, userId) =>
  countRows(
    db
      .select({ n: agentProfiles.totalContributions })
      .from(agentProfiles)
      .where(eq(agentProfiles.ownerId, userId))
      .limit(1),
  );

/**
 * Benchmark cells the member helped cover: cells (prompt × model surface)
 * where they have a run and that meet the public threshold in the 30-day
 * window (ADR-0008 decision 4).
 */
export const BENCHMARK_COVERAGE_CELLS_SQL = sql`
  SELECT
    r.submitted_by_user_id AS user_id,
    COUNT(DISTINCT (r.prompt_id, r.model_surface))::int AS cell_count
  FROM "app"."benchmark_run" r
  JOIN "app"."agg_coverage_by_cell" c
    ON c.prompt_id = r.prompt_id
   AND c.model_surface = r.model_surface
   AND c.window_days = 30
   AND c.meets_threshold = true
  WHERE r.submitted_by_user_id IS NOT NULL
    AND r.model_surface <> 'legacy_unverified'
`;

const benchmarker: TrackMetric = async ({ db }, userId) => {
  const res = await db.execute<{ user_id: string; cell_count: number }>(sql`
    ${BENCHMARK_COVERAGE_CELLS_SQL}
      AND r.submitted_by_user_id = ${userId}
    GROUP BY r.submitted_by_user_id
  `);
  return Number(res.rows[0]?.cell_count ?? 0);
};

/** Longest run of consecutive active days (`memberActiveDays`). */
const streak: TrackMetric = async ({ db }, userId) => {
  const days = await memberActiveDays(db, userId);
  const today = new Date().toISOString().slice(0, 10);
  return computeStreakData(days, today).longestStreak;
};

/** Each track's metric; thresholds live in the catalog. */
export const TRACK_METRICS: Record<BadgeTrackId, TrackMetric> = {
  regular,
  host,
  challenger,
  writer,
  builder,
  learner,
  teacher,
  connector,
  agent_wrangler: agentWrangler,
  benchmarker,
  streak,
};
