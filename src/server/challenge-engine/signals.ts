import { getPayloadClient } from "@/server/payload";
import { db } from "@/server/db";
import { activityEvents } from "@/server/db/schema";
import { sql, desc, gte } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SignalType =
  | "community-thread"
  | "member-request"
  | "external"
  | "insight-gap";

export interface ChallengeSignal {
  type: SignalType;
  reference: string;
  summary: string;
  /** 0 – 1 relevance score used for ranking. */
  relevanceScore: number;
  rawData: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return a `Date` that is `days` days before now. */
function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

// ---------------------------------------------------------------------------
// 1. Community signals (Payload CMS)
// ---------------------------------------------------------------------------

/**
 * Fetch recent forum threads and open community ideas from Payload CMS and
 * convert them into `ChallengeSignal` entries.
 *
 * - Forum threads: sorted by `-lastActivityAt`, limited to 50.
 *   Base relevance 0.5, boosted by reply count.
 * - Community ideas: filtered to `status === "open"`, sorted by `-voteCount`,
 *   limited to 20.  Base relevance 0.7, boosted by vote count.
 */
export async function detectCommunitySignals(
  dayWindow = 14,
): Promise<ChallengeSignal[]> {
  const payload = await getPayloadClient();
  const since = daysAgo(dayWindow).toISOString();

  // Fetch forum threads and community ideas in parallel.
  const [threadsResult, ideasResult] = await Promise.all([
    payload.find({
      collection: "forum-threads",
      sort: "-lastActivityAt",
      limit: 50,
      where: {
        createdAt: { greater_than_equal: since },
      },
    }),
    payload.find({
      collection: "community-ideas",
      sort: "-voteCount",
      limit: 20,
      where: {
        status: { equals: "open" },
      },
    }),
  ]);

  const signals: ChallengeSignal[] = [];

  // --- Forum threads ---
  for (const thread of threadsResult.docs) {
    const replyCount =
      typeof thread.replyCount === "number" ? thread.replyCount : 0;
    // Base 0.5, add up to 0.5 more depending on reply count (cap at 50 replies).
    const relevanceScore = Math.min(0.5 + (replyCount / 50) * 0.5, 1);

    signals.push({
      type: "community-thread",
      reference: `forum-threads/${String(thread.id)}`,
      summary: `Forum thread: ${String(thread.title)} (${replyCount} replies)`,
      relevanceScore,
      rawData: thread as unknown as Record<string, unknown>,
    });
  }

  // --- Community ideas ---
  for (const idea of ideasResult.docs) {
    const voteCount =
      typeof idea.voteCount === "number" ? idea.voteCount : 0;
    // Base 0.7, add up to 0.3 more depending on votes (cap at 30 votes).
    const relevanceScore = Math.min(0.7 + (voteCount / 30) * 0.3, 1);

    signals.push({
      type: "member-request",
      reference: `community-ideas/${String(idea.id)}`,
      summary: `Community idea: ${String(idea.title)} (${voteCount} votes)`,
      relevanceScore,
      rawData: idea as unknown as Record<string, unknown>,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// 2. Activity-pattern signals (Drizzle / activityEvents)
// ---------------------------------------------------------------------------

/**
 * Query the `activityEvents` table for the most common actions in the last
 * `dayWindow` days.  Each action type becomes an `insight-gap` signal whose
 * relevance is proportional to the number of occurrences (capped at 50).
 */
export async function detectActivitySignals(
  dayWindow = 14,
): Promise<ChallengeSignal[]> {
  const since = daysAgo(dayWindow);

  const rows = await db
    .select({
      action: activityEvents.action,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(activityEvents)
    .where(gte(activityEvents.createdAt, since))
    .groupBy(activityEvents.action)
    .orderBy(desc(sql`count(*)`))
    .limit(10);

  return rows.map((row) => {
    const count = Number(row.count);
    return {
      type: "insight-gap" as const,
      reference: `activity-action/${row.action}`,
      summary: `Activity pattern: "${row.action}" occurred ${count} times in the last ${dayWindow} days`,
      relevanceScore: Math.min(count / 50, 1),
      rawData: { action: row.action, count },
    };
  });
}

// ---------------------------------------------------------------------------
// 3. Aggregate collector
// ---------------------------------------------------------------------------

/**
 * Collect all signals in parallel and return them sorted by relevance
 * (highest first).
 */
export async function collectSignals(
  dayWindow = 14,
): Promise<ChallengeSignal[]> {
  const [communitySignals, activitySignals] = await Promise.all([
    detectCommunitySignals(dayWindow),
    detectActivitySignals(dayWindow),
  ]);

  return [...communitySignals, ...activitySignals].sort(
    (a, b) => b.relevanceScore - a.relevanceScore,
  );
}
