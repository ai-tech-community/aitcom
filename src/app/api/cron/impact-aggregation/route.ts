import { NextResponse } from "next/server";
import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "@/server/db";
import {
  activityEvents,
  challengeEnrollments,
  eventRegistrations,
  dailyCoreMetrics,
  dailyCollabMix,
  dailyExperimentalMetrics,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { safePercent, clampRate, safeDelta } from "@/lib/impact-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractCount(rows: { count: number }[]): number {
  return rows[0]?.count ?? 0;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? null;
}

function todayRange(): { start: Date; end: Date; dateStr: string } {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  const dateStr = start.toISOString().slice(0, 10); // "YYYY-MM-DD"
  return { start, end, dateStr };
}

/**
 * Generate unique pair combinations from an array of labels and count them.
 */
function countPairs(
  labels: string[],
): Array<{ pair: [string, string]; count: number }> {
  const map = new Map<string, number>();
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i]!;
      const b = labels[j]!;
      const key = a < b ? `${a}|${b}` : `${b}|${a}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  }
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, count]) => {
      const [a, b] = key.split("|") as [string, string];
      return { pair: [a, b], count };
    });
}

// ---------------------------------------------------------------------------
// Cron handler — hourly aggregation of daily impact metrics
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { start, end, dateStr } = todayRange();
    const computedAt = new Date();

    // -----------------------------------------------------------------------
    // Time-window helpers for Drizzle
    // -----------------------------------------------------------------------
    const todayWhere = and(
      gte(activityEvents.createdAt, start),
      sql`${activityEvents.createdAt} < ${end.toISOString()}`,
    );

    // 4-week windows for growth calculation
    const fourWeeksMs = 28 * 24 * 60 * 60 * 1000;
    const fourWeeksAgo = new Date(start.getTime() - fourWeeksMs);
    const eightWeeksAgo = new Date(start.getTime() - 2 * fourWeeksMs);

    const current4wWhere = and(
      gte(activityEvents.createdAt, fourWeeksAgo),
      sql`${activityEvents.createdAt} < ${end.toISOString()}`,
    );
    const prev4wWhere = and(
      gte(activityEvents.createdAt, eightWeeksAgo),
      sql`${activityEvents.createdAt} < ${fourWeeksAgo.toISOString()}`,
    );

    // -----------------------------------------------------------------------
    // 1. Core Metrics
    // -----------------------------------------------------------------------

    const totalContributions = extractCount(
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(todayWhere),
    );

    const aiAssisted = extractCount(
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(and(todayWhere, eq(activityEvents.actorType, "agent"))),
    );

    const humanReviewed = extractCount(
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(
          and(
            todayWhere,
            eq(activityEvents.actorType, "member"),
            sql`(${activityEvents.metadata}->>'generatedBy' = 'ai' OR ${activityEvents.metadata}->>'aiAssisted' = 'true')`,
          ),
        ),
    );

    const collaborationRate = clampRate(
      safePercent(aiAssisted + humanReviewed, Math.max(totalContributions, 1)),
    );

    // Forum helpfulness & median response
    const payload = await getPayloadClient();
    const [threadsTotal, threadsAnswered, replySamples] = await Promise.all([
      payload.find({
        collection: "forum-threads",
        limit: 1,
        depth: 0,
        where: {
          createdAt: {
            greater_than_equal: start.toISOString(),
            less_than: end.toISOString(),
          },
        },
      }),
      payload.find({
        collection: "forum-threads",
        limit: 1,
        depth: 0,
        where: {
          and: [
            { replyCount: { greater_than: 0 } },
            { createdAt: { greater_than_equal: start.toISOString() } },
            { createdAt: { less_than: end.toISOString() } },
          ],
        },
      }),
      payload.find({
        collection: "forum-threads",
        limit: 200,
        depth: 0,
        where: {
          and: [
            { replyCount: { greater_than: 0 } },
            { createdAt: { greater_than_equal: start.toISOString() } },
            { createdAt: { less_than: end.toISOString() } },
          ],
        },
        sort: "-lastActivityAt",
      }),
    ]);

    const forumHelpfulness = safePercent(
      threadsAnswered.totalDocs ?? 0,
      Math.max(threadsTotal.totalDocs ?? 0, 1),
    );

    const responseMinutes = replySamples.docs
      .map((thread) => {
        if (!thread.createdAt || !thread.lastActivityAt) return null;
        const created = new Date(thread.createdAt).getTime();
        const last = new Date(thread.lastActivityAt).getTime();
        if (Number.isNaN(created) || Number.isNaN(last) || last < created)
          return null;
        return Math.round((last - created) / 60000);
      })
      .filter((v): v is number => v !== null);
    const medianResponseMinutes = median(responseMinutes);

    // Challenge participation & completion (enrolled today)
    const challengeDateWhere = and(
      gte(challengeEnrollments.enrolledAt, start),
      sql`${challengeEnrollments.enrolledAt} < ${end.toISOString()}`,
    );

    const challengeParticipation = extractCount(
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(challengeEnrollments)
        .where(challengeDateWhere),
    );

    const challengeCompletion = extractCount(
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(challengeEnrollments)
        .where(
          and(challengeDateWhere, eq(challengeEnrollments.status, "completed")),
        ),
    );

    // Event participation
    const eventDateWhere = and(
      gte(eventRegistrations.registeredAt, start),
      sql`${eventRegistrations.registeredAt} < ${end.toISOString()}`,
    );

    const eventParticipation = extractCount(
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(eventRegistrations)
        .where(
          and(
            eventDateWhere,
            sql`${eventRegistrations.status} IN ('registered', 'attended')`,
          ),
        ),
    );

    // Growth 4w: compare current 4w collab rate vs previous 4w
    const [cur4wTotalRows, cur4wAiRows, cur4wHRRows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(current4wWhere),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(and(current4wWhere, eq(activityEvents.actorType, "agent"))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(
          and(
            current4wWhere,
            eq(activityEvents.actorType, "member"),
            sql`(${activityEvents.metadata}->>'generatedBy' = 'ai' OR ${activityEvents.metadata}->>'aiAssisted' = 'true')`,
          ),
        ),
    ]);
    const cur4wTotal = extractCount(cur4wTotalRows);
    const cur4wAi = extractCount(cur4wAiRows);
    const cur4wHR = extractCount(cur4wHRRows);
    const cur4wRate = clampRate(
      safePercent(cur4wAi + cur4wHR, Math.max(cur4wTotal, 1)),
    );

    const [prev4wTotalRows, prev4wAiRows, prev4wHRRows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(prev4wWhere),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(and(prev4wWhere, eq(activityEvents.actorType, "agent"))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(
          and(
            prev4wWhere,
            eq(activityEvents.actorType, "member"),
            sql`(${activityEvents.metadata}->>'generatedBy' = 'ai' OR ${activityEvents.metadata}->>'aiAssisted' = 'true')`,
          ),
        ),
    ]);
    const prev4wTotal = extractCount(prev4wTotalRows);
    const prev4wAi = extractCount(prev4wAiRows);
    const prev4wHR = extractCount(prev4wHRRows);
    const prev4wRate = clampRate(
      safePercent(prev4wAi + prev4wHR, Math.max(prev4wTotal, 1)),
    );
    const growth4w = safeDelta(cur4wRate, prev4wRate);

    // -----------------------------------------------------------------------
    // 2. Collab Mix
    // -----------------------------------------------------------------------

    const todayEvents = await db
      .select({
        actorType: activityEvents.actorType,
        action: activityEvents.action,
        targetType: activityEvents.targetType,
        targetId: activityEvents.targetId,
      })
      .from(activityEvents)
      .where(todayWhere);

    // Pass 1: find targets with both agent + member activity
    const targetActors = new Map<string, Set<string>>();
    for (const ev of todayEvents) {
      if (!ev.targetType || !ev.targetId) continue;
      const key = `${ev.targetType}:${ev.targetId}`;
      let actors = targetActors.get(key);
      if (!actors) {
        actors = new Set();
        targetActors.set(key, actors);
      }
      actors.add(ev.actorType);
    }

    const collabTargetKeys = new Set<string>();
    for (const [key, actors] of targetActors) {
      if (actors.has("agent") && actors.has("member")) {
        collabTargetKeys.add(key);
      }
    }

    // Pass 2: classify
    let aiOnly = 0;
    let humanOnly = 0;
    let collaborative = 0;

    for (const ev of todayEvents) {
      const key = ev.targetType && ev.targetId
        ? `${ev.targetType}:${ev.targetId}`
        : null;
      if (key && collabTargetKeys.has(key)) {
        collaborative++;
      } else if (ev.actorType === "agent") {
        aiOnly++;
      } else {
        humanOnly++;
      }
    }

    // -----------------------------------------------------------------------
    // 3. Experimental Metrics
    // -----------------------------------------------------------------------

    // --- personalityDistribution ---
    const personalityRows = await db
      .select({
        label: sql<string>`${activityEvents.metadata}->>'personalityLabel'`,
        count: sql<number>`count(*)::int`,
      })
      .from(activityEvents)
      .where(
        and(
          todayWhere,
          sql`${activityEvents.metadata}->>'personalityLabel' IS NOT NULL`,
        ),
      )
      .groupBy(sql`${activityEvents.metadata}->>'personalityLabel'`);

    const personalityDistribution: Record<string, number> = {};
    for (const row of personalityRows) {
      if (row.label) personalityDistribution[row.label] = row.count;
    }

    // --- overrideRate ---
    const overrideCount = extractCount(
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(
          and(
            todayWhere,
            sql`${activityEvents.metadata}->>'editSignificance' IN ('major', 'rejection')`,
          ),
        ),
    );
    const totalAiEvents = Math.max(aiAssisted, 1);
    const overrideRate = clampRate(safePercent(overrideCount, totalAiEvents));

    // --- creativityIndex ---
    // Count distinct (collaborationModel, action) pairs from activity events metadata
    // for completed challenge events today. Max combos ≈ 6 models × 5 actions = 30.
    const creativityRows = await db
      .select({
        pair: sql<string>`DISTINCT ${activityEvents.metadata}->>'collaborationModel' || '|' || ${activityEvents.action}`,
      })
      .from(activityEvents)
      .where(
        and(
          todayWhere,
          sql`${activityEvents.metadata}->>'collaborationModel' IS NOT NULL`,
          sql`${activityEvents.action} LIKE 'challenge.%'`,
        ),
      );
    const distinctPairs = creativityRows.filter((r) => r.pair).length;
    const creativityIndex = clampRate((distinctPairs / 30) * 100);

    // --- collaborationDepth ---
    // For sessions with completion events today, count events per session, return median
    const sessionCompletionRows = await db
      .select({ sessionId: activityEvents.collabSessionId })
      .from(activityEvents)
      .where(
        and(
          todayWhere,
          sql`${activityEvents.collabSessionId} IS NOT NULL`,
          sql`${activityEvents.action} LIKE '%.completed'`,
        ),
      );

    let collaborationDepth = 0;
    const completedSessionIds = [
      ...new Set(
        sessionCompletionRows
          .map((r) => r.sessionId)
          .filter((s): s is string => s !== null),
      ),
    ];

    if (completedSessionIds.length > 0) {
      const sessionCounts = await db
        .select({
          sessionId: activityEvents.collabSessionId,
          count: sql<number>`count(*)::int`,
        })
        .from(activityEvents)
        .where(
          sql`${activityEvents.collabSessionId} IN (${sql.join(
            completedSessionIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
        .groupBy(activityEvents.collabSessionId);

      const depths = sessionCounts.map((r) => r.count);
      const medianDepth = median(depths);
      collaborationDepth = clampRate(medianDepth ?? 0);
    }

    // --- ideaToImplMedianMinutes ---
    // Median of (submittedAt - challenge.createdAt) for enrollments submitted today
    const submittedToday = await db
      .select({
        challengeId: challengeEnrollments.challengeId,
        submittedAt: challengeEnrollments.submittedAt,
      })
      .from(challengeEnrollments)
      .where(
        and(
          sql`${challengeEnrollments.submittedAt} IS NOT NULL`,
          gte(challengeEnrollments.submittedAt, start),
          sql`${challengeEnrollments.submittedAt} < ${end.toISOString()}`,
        ),
      );

    let ideaToImplMedianMinutes: number | null = null;
    if (submittedToday.length > 0) {
      const challengeIds = [
        ...new Set(submittedToday.map((e) => e.challengeId)),
      ];
      const { docs: challengeDocs } = await payload.find({
        collection: "challenges",
        where: { id: { in: challengeIds.join(",") } },
        limit: challengeIds.length,
        depth: 0,
      });
      const challengeCreatedMap = new Map<number, Date>();
      for (const c of challengeDocs) {
        if (c.createdAt) challengeCreatedMap.set(c.id, new Date(c.createdAt));
      }

      const implMinutes = submittedToday
        .map((r) => {
          if (!r.submittedAt) return null;
          const challengeCreated = challengeCreatedMap.get(r.challengeId);
          if (!challengeCreated) return null;
          const diff =
            new Date(r.submittedAt).getTime() - challengeCreated.getTime();
          if (diff < 0) return null;
          return Math.round(diff / 60000);
        })
        .filter((v): v is number => v !== null);
      ideaToImplMedianMinutes = median(implMinutes);
    }

    // --- topPairings ---
    // For each session today, collect personality labels and generate pairs
    const sessionPersonalityRows = await db
      .select({
        sessionId: activityEvents.collabSessionId,
        label: sql<string>`${activityEvents.metadata}->>'personalityLabel'`,
      })
      .from(activityEvents)
      .where(
        and(
          todayWhere,
          sql`${activityEvents.collabSessionId} IS NOT NULL`,
          sql`${activityEvents.metadata}->>'personalityLabel' IS NOT NULL`,
        ),
      );

    const sessionLabelsMap = new Map<string, string[]>();
    for (const row of sessionPersonalityRows) {
      if (!row.sessionId || !row.label) continue;
      const existing = sessionLabelsMap.get(row.sessionId) ?? [];
      if (!existing.includes(row.label)) existing.push(row.label);
      sessionLabelsMap.set(row.sessionId, existing);
    }

    const allLabelsForPairing: string[] = [];
    for (const labels of sessionLabelsMap.values()) {
      allLabelsForPairing.push(...labels);
    }
    const topPairings =
      allLabelsForPairing.length >= 2 ? countPairs(allLabelsForPairing) : [];

    // --- reuseRatio ---
    const templateBasedCount = extractCount(
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(
          and(
            todayWhere,
            sql`${activityEvents.metadata}->>'templateBased' = 'true'`,
          ),
        ),
    );
    // Total "solution" events — events with action containing "solution"
    const solutionEventsCount = extractCount(
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(
          and(todayWhere, sql`${activityEvents.action} LIKE '%solution%'`),
        ),
    );
    const reuseRatio = clampRate(
      safePercent(templateBasedCount, Math.max(solutionEventsCount, 1)),
    );

    // --- learningLoopSignal & learningLoopData ---
    // Compare 4w approval rate vs prev 4w
    const approvalCount4w = extractCount(
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(
          and(
            current4wWhere,
            eq(activityEvents.action, "challenge.solution_approved"),
          ),
        ),
    );
    const totalReviews4w = extractCount(
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(
          and(
            current4wWhere,
            sql`${activityEvents.action} IN ('challenge.solution_approved', 'challenge.solution_rejected')`,
          ),
        ),
    );
    const approvalRate4w = safePercent(
      approvalCount4w,
      Math.max(totalReviews4w, 1),
    );

    const approvalCountPrev4w = extractCount(
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(
          and(
            prev4wWhere,
            eq(activityEvents.action, "challenge.solution_approved"),
          ),
        ),
    );
    const totalReviewsPrev4w = extractCount(
      await db
        .select({ count: sql<number>`count(*)::int` })
        .from(activityEvents)
        .where(
          and(
            prev4wWhere,
            sql`${activityEvents.action} IN ('challenge.solution_approved', 'challenge.solution_rejected')`,
          ),
        ),
    );
    const approvalRate4wPrev = safePercent(
      approvalCountPrev4w,
      Math.max(totalReviewsPrev4w, 1),
    );

    const approvalDelta = approvalRate4w - approvalRate4wPrev;
    let learningLoopSignal: "improving" | "stable" | "declining" = "stable";
    if (approvalDelta > 5) learningLoopSignal = "improving";
    else if (approvalDelta < -5) learningLoopSignal = "declining";

    const learningLoopData: Record<string, number> = {
      approvalRate4w,
      approvalRate4wPrev,
    };

    // -----------------------------------------------------------------------
    // 4. Upsert into aggregate tables
    // -----------------------------------------------------------------------

    await db
      .insert(dailyCoreMetrics)
      .values({
        date: dateStr,
        totalContributions,
        aiAssisted,
        humanReviewed,
        collaborationRate: String(collaborationRate),
        forumHelpfulness: String(forumHelpfulness),
        medianResponseMinutes,
        challengeParticipation,
        challengeCompletion,
        eventParticipation,
        growth4w: String(growth4w),
        computedAt,
      })
      .onConflictDoUpdate({
        target: dailyCoreMetrics.date,
        set: {
          totalContributions,
          aiAssisted,
          humanReviewed,
          collaborationRate: String(collaborationRate),
          forumHelpfulness: String(forumHelpfulness),
          medianResponseMinutes,
          challengeParticipation,
          challengeCompletion,
          eventParticipation,
          growth4w: String(growth4w),
          computedAt,
        },
      });

    await db
      .insert(dailyCollabMix)
      .values({
        date: dateStr,
        aiOnly,
        humanOnly,
        collaborative,
        computedAt,
      })
      .onConflictDoUpdate({
        target: dailyCollabMix.date,
        set: {
          aiOnly,
          humanOnly,
          collaborative,
          computedAt,
        },
      });

    await db
      .insert(dailyExperimentalMetrics)
      .values({
        date: dateStr,
        personalityDistribution,
        overrideRate: String(overrideRate),
        creativityIndex: String(creativityIndex),
        collaborationDepth: String(collaborationDepth),
        ideaToImplMedianMinutes,
        topPairings,
        reuseRatio: String(reuseRatio),
        learningLoopSignal,
        learningLoopData,
        computedAt,
      })
      .onConflictDoUpdate({
        target: dailyExperimentalMetrics.date,
        set: {
          personalityDistribution,
          overrideRate: String(overrideRate),
          creativityIndex: String(creativityIndex),
          collaborationDepth: String(collaborationDepth),
          ideaToImplMedianMinutes,
          topPairings,
          reuseRatio: String(reuseRatio),
          learningLoopSignal,
          learningLoopData,
          computedAt,
        },
      });

    return NextResponse.json({
      success: true,
      date: dateStr,
      core: {
        totalContributions,
        aiAssisted,
        humanReviewed,
        collaborationRate,
        forumHelpfulness,
        medianResponseMinutes,
        challengeParticipation,
        challengeCompletion,
        eventParticipation,
        growth4w,
      },
      collabMix: { aiOnly, humanOnly, collaborative },
      experimental: {
        personalityDistribution,
        overrideRate,
        creativityIndex,
        collaborationDepth,
        ideaToImplMedianMinutes,
        topPairings,
        reuseRatio,
        learningLoopSignal,
        learningLoopData,
      },
      computedAt: computedAt.toISOString(),
    });
  } catch (error) {
    console.error("[impact-aggregation] Cron failed:", error);
    return NextResponse.json(
      { success: false, error: "Internal error" },
      { status: 500 },
    );
  }
}
