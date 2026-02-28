import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import { clampRate, safeDelta, safePercent, toWeeklyBuckets } from "@/lib/impact-metrics";
import { createTRPCRouter, protectedProcedure, publicProcedure } from "@/server/api/trpc";
import {
  activityEvents,
  challengeEnrollments,
  dailyCollabMix,
  dailyCoreMetrics,
  dailyExperimentalMetrics,
  eventRegistrations,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";

function extractCount(rows: { count: number }[]): number {
  return rows[0]?.count ?? 0;
}

function getSinceDate(range: "30d" | "all"): Date | null {
  if (range === "all") return null;
  return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday-start week key from a "YYYY-MM-DD" date string. */
function startOfWeekStr(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

function weekLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// ---------------------------------------------------------------------------
// Fallback: compute from raw events (used when aggregate tables are empty)
// ---------------------------------------------------------------------------
type DbCtx = { db: Parameters<Parameters<typeof publicProcedure.query>[0]>[0]["ctx"]["db"] };

async function computeFromRawEvents(
  ctx: DbCtx,
  since: Date | null,
  previousSince: Date | null,
) {
  const now = new Date();
  const contributionWhere = since ? gte(activityEvents.createdAt, since) : undefined;
  const previousWhere = previousSince
    ? and(
        gte(activityEvents.createdAt, previousSince),
        sql`${activityEvents.createdAt} < ${since!.toISOString()}`,
      )
    : undefined;

  const totalContributions = extractCount(
    await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityEvents)
      .where(contributionWhere),
  );

  const aiAssisted = extractCount(
    await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityEvents)
      .where(
        contributionWhere
          ? and(contributionWhere, eq(activityEvents.actorType, "agent"))
          : eq(activityEvents.actorType, "agent"),
      ),
  );

  const humanReviewedAi = extractCount(
    await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityEvents)
      .where(
        contributionWhere
          ? and(
              contributionWhere,
              eq(activityEvents.actorType, "member"),
              sql`(${activityEvents.metadata}->>'generatedBy' = 'ai' OR ${activityEvents.metadata}->>'aiAssisted' = 'true')`,
            )
          : and(
              eq(activityEvents.actorType, "member"),
              sql`(${activityEvents.metadata}->>'generatedBy' = 'ai' OR ${activityEvents.metadata}->>'aiAssisted' = 'true')`,
            ),
      ),
  );

  const collaborationRate = clampRate(
    safePercent(aiAssisted + humanReviewedAi, Math.max(totalContributions, 1)),
  );

  const previousTotal = extractCount(
    await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityEvents)
      .where(previousWhere),
  );
  const previousAi = extractCount(
    await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityEvents)
      .where(
        previousWhere
          ? and(previousWhere, eq(activityEvents.actorType, "agent"))
          : eq(activityEvents.actorType, "agent"),
      ),
  );
  const previousHumanReviewed = extractCount(
    await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(activityEvents)
      .where(
        previousWhere
          ? and(
              previousWhere,
              eq(activityEvents.actorType, "member"),
              sql`(${activityEvents.metadata}->>'generatedBy' = 'ai' OR ${activityEvents.metadata}->>'aiAssisted' = 'true')`,
            )
          : and(
              eq(activityEvents.actorType, "member"),
              sql`(${activityEvents.metadata}->>'generatedBy' = 'ai' OR ${activityEvents.metadata}->>'aiAssisted' = 'true')`,
            ),
      ),
  );
  const previousCollabRate = clampRate(
    safePercent(previousAi + previousHumanReviewed, Math.max(previousTotal, 1)),
  );

  const payload = await getPayloadClient();
  const [threadsTotal, threadsAnswered, replySamples] = await Promise.all([
    payload.find({
      collection: "forum-threads",
      limit: 1,
      depth: 0,
      where: since ? { createdAt: { greater_than_equal: since.toISOString() } } : undefined,
    }),
    payload.find({
      collection: "forum-threads",
      limit: 1,
      depth: 0,
      where: {
        and: [
          { replyCount: { greater_than: 0 } },
          ...(since ? [{ createdAt: { greater_than_equal: since.toISOString() } }] : []),
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
          ...(since ? [{ createdAt: { greater_than_equal: since.toISOString() } }] : []),
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
      if (Number.isNaN(created) || Number.isNaN(last) || last < created) return null;
      return Math.round((last - created) / 60000);
    })
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);
  const medianFirstResponse =
    responseMinutes.length === 0
      ? null
      : responseMinutes[Math.floor(responseMinutes.length / 2)] ?? null;

  const challengeDateWhere = since ? gte(challengeEnrollments.enrolledAt, since) : undefined;
  const challengeParticipation = extractCount(
    await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(challengeEnrollments)
      .where(challengeDateWhere),
  );
  const challengeCompleted = extractCount(
    await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(challengeEnrollments)
      .where(
        challengeDateWhere
          ? and(challengeDateWhere, eq(challengeEnrollments.status, "completed"))
          : eq(challengeEnrollments.status, "completed"),
      ),
  );
  const challengeCompletionRate = safePercent(
    challengeCompleted,
    Math.max(challengeParticipation, 1),
  );

  const eventDateWhere = since ? gte(eventRegistrations.registeredAt, since) : undefined;
  const eventLinkedParticipation = extractCount(
    await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(eventRegistrations)
      .where(
        eventDateWhere
          ? and(
              eventDateWhere,
              sql`${eventRegistrations.status} IN ('registered', 'attended')`,
            )
          : sql`${eventRegistrations.status} IN ('registered', 'attended')`,
      ),
  );

  const collaborationGrowth4w = safeDelta(collaborationRate, previousCollabRate);

  // Weekly active contributors (distinct actors in the last 7 days)
  const fallbackWeeklyActiveRows = await ctx.db
    .select({ count: sql<number>`count(distinct ${activityEvents.actorId})::int` })
    .from(activityEvents)
    .where(gte(activityEvents.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const fallbackWeeklyActiveContributors = fallbackWeeklyActiveRows[0]?.count ?? 0;

  const trendSince = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);
  const trendRows = await ctx.db
    .select({
      createdAt: activityEvents.createdAt,
      actorType: activityEvents.actorType,
      action: activityEvents.action,
      targetType: activityEvents.targetType,
      targetId: activityEvents.targetId,
    })
    .from(activityEvents)
    .where(gte(activityEvents.createdAt, trendSince))
    .orderBy(activityEvents.createdAt);
  const weekly = toWeeklyBuckets(trendRows, 8);

  return {
    kpis: {
      totalContributions,
      aiAssisted,
      humanReviewedAi,
      collaborationRate,
      forumHelpfulness,
      medianFirstResponse,
      challengeParticipationRate: safePercent(
        challengeParticipation,
        Math.max(totalContributions, 1),
      ),
      challengeCompletionRate,
      eventLinkedParticipation,
      collaborationGrowth4w,
    },
    trends: {
      weeklyCollaboration: weekly.map((bucket) => ({
        label: bucket.label,
        value: clampRate(
          safePercent(
            bucket.collaborative,
            Math.max(bucket.collaborative + bucket.aiOnly + bucket.humanOnly, 1),
          ),
        ),
      })),
      contributionMix: weekly.map((bucket) => ({
        label: bucket.label,
        aiOnly: bucket.aiOnly,
        humanOnly: bucket.humanOnly,
        collaborative: bucket.collaborative,
      })),
    },
    audienceBlocks: {
      visitors: {
        momentum: collaborationGrowth4w,
        outcomes: challengeCompleted,
        weeklyActiveContributors: fallbackWeeklyActiveContributors,
        ideaToImplMedian: null,
      },
      members: {
        responseHealth: medianFirstResponse,
        answeredThreads: threadsAnswered.totalDocs ?? 0,
        personalityDistribution: {} as Record<string, number>,
        learningLoopSignal: "stable" as string,
      },
      sponsors: {
        deliveryRate: challengeCompletionRate,
        activeBuilders: challengeParticipation,
        reuseRatio: 0,
        pairingDiversity: 0,
      },
    },
    experimental: {
      confidence: "experimental" as const,
      items: [
        {
          key: "agentPersonalityMix",
          displayType: "distribution" as const,
          value: {} as Record<string, number>,
        },
        {
          key: "humanOverrideRate",
          displayType: "percentage" as const,
          value: clampRate(safePercent(humanReviewedAi, Math.max(aiAssisted, 1))),
        },
        {
          key: "creativityIndex",
          displayType: "percentage" as const,
          value: clampRate(safePercent(challengeCompleted, Math.max(challengeParticipation, 1))),
        },
        {
          key: "collaborationDepth",
          displayType: "number" as const,
          value: Number((humanReviewedAi / Math.max(challengeCompleted, 1)).toFixed(1)),
          suffix: "rounds",
        },
        {
          key: "ideaToImplTime",
          displayType: "duration" as const,
          value: null,
          suffix: "days",
        },
        {
          key: "crossPersonalityPairing",
          displayType: "pairings" as const,
          value: [],
        },
        {
          key: "reuseRatio",
          displayType: "percentage" as const,
          value: 0,
        },
        {
          key: "learningLoop",
          displayType: "trend" as const,
          value: "stable",
          data: {},
        },
      ],
    },
    lastUpdatedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Build weekly trend buckets from dailyCollabMix rows
// ---------------------------------------------------------------------------
type MixRow = typeof dailyCollabMix.$inferSelect;

function mixRowsToWeeklyBuckets(rows: MixRow[], weeks = 8) {
  const now = new Date();
  // Build week keys for the last N weeks (Monday-start)
  const firstWeekDate = new Date(now.getTime() - (weeks - 1) * 7 * 24 * 60 * 60 * 1000);
  const firstWeekKey = startOfWeekStr(toDateStr(firstWeekDate));

  const bucketMap = new Map<string, { label: string; aiOnly: number; humanOnly: number; collaborative: number }>();
  for (let i = 0; i < weeks; i++) {
    const wkDate = new Date(new Date(firstWeekKey + "T00:00:00Z").getTime() + i * 7 * 24 * 60 * 60 * 1000);
    const key = toDateStr(wkDate);
    bucketMap.set(key, { label: weekLabel(key), aiOnly: 0, humanOnly: 0, collaborative: 0 });
  }

  for (const row of rows) {
    const wk = startOfWeekStr(row.date);
    const bucket = bucketMap.get(wk);
    if (!bucket) continue;
    bucket.aiOnly += row.aiOnly;
    bucket.humanOnly += row.humanOnly;
    bucket.collaborative += row.collaborative;
  }

  return [...bucketMap.values()];
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
export const impactRouter = createTRPCRouter({
  getOverview: publicProcedure
    .input(z.object({ range: z.enum(["30d", "all"]).default("30d") }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const since = getSinceDate(input.range);
      const previousSince = since
        ? new Date(since.getTime() - 30 * 24 * 60 * 60 * 1000)
        : null;
      const sinceStr = since ? toDateStr(since) : undefined;

      // ------- Query aggregate tables (fall back if tables don't exist yet) -------
      let coreRows: (typeof dailyCoreMetrics.$inferSelect)[] = [];
      let mixRows: (typeof dailyCollabMix.$inferSelect)[] = [];
      let expRows: (typeof dailyExperimentalMetrics.$inferSelect)[] = [];

      try {
        [coreRows, mixRows, expRows] = await Promise.all([
          ctx.db
            .select()
            .from(dailyCoreMetrics)
            .where(sinceStr ? gte(dailyCoreMetrics.date, sinceStr) : undefined)
            .orderBy(dailyCoreMetrics.date),
          ctx.db
            .select()
            .from(dailyCollabMix)
            .where(sinceStr ? gte(dailyCollabMix.date, sinceStr) : undefined)
            .orderBy(dailyCollabMix.date),
          ctx.db
            .select()
            .from(dailyExperimentalMetrics)
            .where(sinceStr ? gte(dailyExperimentalMetrics.date, sinceStr) : undefined)
            .orderBy(desc(dailyExperimentalMetrics.date)),
        ]);
      } catch {
        // Tables may not exist yet (pre-migration); fall through to raw fallback
      }

      // ------- Fallback: if no aggregate data yet, use raw queries -------
      if (coreRows.length === 0) {
        return computeFromRawEvents(ctx, since, previousSince);
      }

      // ------- Aggregate core rows (SUM counts, LATEST for rates) -------
      const latestCore = coreRows[coreRows.length - 1]!;

      const totalContributions = coreRows.reduce((s, r) => s + r.totalContributions, 0);
      const aiAssisted = coreRows.reduce((s, r) => s + r.aiAssisted, 0);
      const humanReviewedAi = coreRows.reduce((s, r) => s + r.humanReviewed, 0);
      const challengeParticipation = coreRows.reduce((s, r) => s + r.challengeParticipation, 0);
      const challengeCompletion = coreRows.reduce((s, r) => s + r.challengeCompletion, 0);
      const eventParticipation = coreRows.reduce((s, r) => s + r.eventParticipation, 0);

      const collaborationRate = clampRate(Number(latestCore.collaborationRate));
      const forumHelpfulness = Number(latestCore.forumHelpfulness);
      const collaborationGrowth4w = Number(latestCore.growth4w);

      // Latest non-null medianResponseMinutes
      let medianFirstResponse: number | null = null;
      for (let i = coreRows.length - 1; i >= 0; i--) {
        if (coreRows[i]!.medianResponseMinutes != null) {
          medianFirstResponse = coreRows[i]!.medianResponseMinutes;
          break;
        }
      }

      const challengeCompletionRate = safePercent(
        challengeCompletion,
        Math.max(challengeParticipation, 1),
      );

      // ------- Trends from dailyCollabMix -------
      const weekly = mixRowsToWeeklyBuckets(mixRows, 8);

      // ------- Experimental metrics (latest + averages) -------
      const latestExp = expRows.length > 0 ? expRows[0]! : null;

      const avgNumeric = (getter: (r: typeof expRows[number]) => string) => {
        if (expRows.length === 0) return 0;
        const sum = expRows.reduce((s, r) => s + Number(getter(r)), 0);
        return Number((sum / expRows.length).toFixed(1));
      };

      const avgOverrideRate = avgNumeric((r) => r.overrideRate);
      const avgCreativityIndex = avgNumeric((r) => r.creativityIndex);
      const avgCollabDepth = avgNumeric((r) => r.collaborationDepth);
      const avgReuseRatio = avgNumeric((r) => r.reuseRatio);

      // Median ideaToImplMedianMinutes across rows that have a non-null value
      const implMinutes = expRows
        .map((r) => r.ideaToImplMedianMinutes)
        .filter((v): v is number => v != null)
        .sort((a, b) => a - b);
      const medianIdeaToImpl =
        implMinutes.length === 0
          ? null
          : Number(
              ((implMinutes[Math.floor(implMinutes.length / 2)] ?? 0) / 1440).toFixed(1),
            );

      // Weekly active contributors (distinct actors in the last 7 days)
      const weeklyActiveRows = await ctx.db
        .select({ count: sql<number>`count(distinct ${activityEvents.actorId})::int` })
        .from(activityEvents)
        .where(gte(activityEvents.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
      const weeklyActiveContributors = weeklyActiveRows[0]?.count ?? 0;

      return {
        kpis: {
          totalContributions,
          aiAssisted,
          humanReviewedAi,
          collaborationRate,
          forumHelpfulness,
          medianFirstResponse,
          challengeParticipationRate: safePercent(
            challengeParticipation,
            Math.max(totalContributions, 1),
          ),
          challengeCompletionRate,
          eventLinkedParticipation: eventParticipation,
          collaborationGrowth4w,
        },
        trends: {
          weeklyCollaboration: weekly.map((bucket) => ({
            label: bucket.label,
            value: clampRate(
              safePercent(
                bucket.collaborative,
                Math.max(bucket.collaborative + bucket.aiOnly + bucket.humanOnly, 1),
              ),
            ),
          })),
          contributionMix: weekly.map((bucket) => ({
            label: bucket.label,
            aiOnly: bucket.aiOnly,
            humanOnly: bucket.humanOnly,
            collaborative: bucket.collaborative,
          })),
        },
        audienceBlocks: {
          visitors: {
            momentum: collaborationGrowth4w,
            outcomes: challengeCompletion,
            weeklyActiveContributors,
            ideaToImplMedian: medianIdeaToImpl,
          },
          members: {
            responseHealth: medianFirstResponse,
            answeredThreads: Math.round(forumHelpfulness),
            personalityDistribution: latestExp?.personalityDistribution ?? {},
            learningLoopSignal: latestExp?.learningLoopSignal ?? "stable",
          },
          sponsors: {
            deliveryRate: challengeCompletionRate,
            activeBuilders: challengeParticipation,
            reuseRatio: avgReuseRatio,
            pairingDiversity: (latestExp?.topPairings ?? []).length,
          },
        },
        experimental: {
          confidence: "experimental" as const,
          items: [
            {
              key: "agentPersonalityMix",
              displayType: "distribution" as const,
              value: latestExp?.personalityDistribution ?? {},
            },
            {
              key: "humanOverrideRate",
              displayType: "percentage" as const,
              value: avgOverrideRate,
            },
            {
              key: "creativityIndex",
              displayType: "percentage" as const,
              value: avgCreativityIndex,
            },
            {
              key: "collaborationDepth",
              displayType: "number" as const,
              value: avgCollabDepth,
              suffix: "rounds",
            },
            {
              key: "ideaToImplTime",
              displayType: "duration" as const,
              value: medianIdeaToImpl,
              suffix: "days",
            },
            {
              key: "crossPersonalityPairing",
              displayType: "pairings" as const,
              value: latestExp?.topPairings ?? [],
            },
            {
              key: "reuseRatio",
              displayType: "percentage" as const,
              value: avgReuseRatio,
            },
            {
              key: "learningLoop",
              displayType: "trend" as const,
              value: latestExp?.learningLoopSignal ?? "stable",
              data: latestExp?.learningLoopData ?? {},
            },
          ],
        },
        lastUpdatedAt: now.toISOString(),
      };
    }),

  getQADetails: protectedProcedure
    .input(z.object({
      range: z.enum(["7d", "30d", "90d", "all"]).default("30d"),
    }))
    .query(async ({ ctx, input }) => {
      // Compute since date based on range
      const rangeDays = { "7d": 7, "30d": 30, "90d": 90, all: null } as const;
      const days = rangeDays[input.range];
      const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
      const sinceStr = since ? toDateStr(since) : undefined;

      // Read daily aggregate rows (fall back gracefully if tables don't exist yet)
      let coreRows: (typeof dailyCoreMetrics.$inferSelect)[] = [];
      let mixRows: (typeof dailyCollabMix.$inferSelect)[] = [];
      let expRows: (typeof dailyExperimentalMetrics.$inferSelect)[] = [];

      try {
        [coreRows, mixRows, expRows] = await Promise.all([
          ctx.db.select().from(dailyCoreMetrics)
            .where(sinceStr ? gte(dailyCoreMetrics.date, sinceStr) : undefined)
            .orderBy(dailyCoreMetrics.date),
          ctx.db.select().from(dailyCollabMix)
            .where(sinceStr ? gte(dailyCollabMix.date, sinceStr) : undefined)
            .orderBy(dailyCollabMix.date),
          ctx.db.select().from(dailyExperimentalMetrics)
            .where(sinceStr ? gte(dailyExperimentalMetrics.date, sinceStr) : undefined)
            .orderBy(dailyExperimentalMetrics.date),
        ]);
      } catch {
        // Tables may not exist yet (pre-migration)
      }

      // Per-metric confidence: low if N < 30 data points
      const dataPoints = coreRows.length;
      const confidence = dataPoints < 30 ? "low" : "ok";

      // Daily sparkline data
      const sparklines = {
        totalContributions: coreRows.map(r => ({ date: r.date, value: r.totalContributions })),
        collaborationRate: coreRows.map(r => ({ date: r.date, value: Number(r.collaborationRate) })),
        forumHelpfulness: coreRows.map(r => ({ date: r.date, value: Number(r.forumHelpfulness) })),
        collabMix: mixRows.map(r => ({ date: r.date, aiOnly: r.aiOnly, humanOnly: r.humanOnly, collaborative: r.collaborative })),
        overrideRate: expRows.map(r => ({ date: r.date, value: Number(r.overrideRate) })),
        creativityIndex: expRows.map(r => ({ date: r.date, value: Number(r.creativityIndex) })),
      };

      // Aggregated metrics summary (same as getOverview but simpler)
      const totalContributions = coreRows.reduce((s, r) => s + r.totalContributions, 0);
      const aiAssisted = coreRows.reduce((s, r) => s + r.aiAssisted, 0);
      const humanReviewed = coreRows.reduce((s, r) => s + r.humanReviewed, 0);
      const latestCore = coreRows.length > 0 ? coreRows[coreRows.length - 1]! : null;
      const latestExp = expRows.length > 0 ? expRows[expRows.length - 1]! : null;

      // Admin-only: data quality metrics
      // Check user role from session. The user object should have a `role` field.
      const isAdmin = (ctx.session.user as { role?: string }).role === "admin";

      let admin = null;
      if (isAdmin) {
        // Data quality: % of events with enriched metadata
        const totalEvents = extractCount(
          await ctx.db.select({ count: sql<number>`count(*)::int` })
            .from(activityEvents)
            .where(since ? gte(activityEvents.createdAt, since) : undefined),
        );

        const withSessionId = extractCount(
          await ctx.db.select({ count: sql<number>`count(*)::int` })
            .from(activityEvents)
            .where(
              since
                ? and(gte(activityEvents.createdAt, since), sql`${activityEvents.collabSessionId} IS NOT NULL`)
                : sql`${activityEvents.collabSessionId} IS NOT NULL`,
            ),
        );

        const withPersonality = extractCount(
          await ctx.db.select({ count: sql<number>`count(*)::int` })
            .from(activityEvents)
            .where(
              since
                ? and(gte(activityEvents.createdAt, since), sql`${activityEvents.metadata}->>'personalityLabel' IS NOT NULL`)
                : sql`${activityEvents.metadata}->>'personalityLabel' IS NOT NULL`,
            ),
        );

        admin = {
          dataQuality: {
            totalEvents,
            withSessionId: safePercent(withSessionId, Math.max(totalEvents, 1)),
            withPersonality: safePercent(withPersonality, Math.max(totalEvents, 1)),
          },
          aggregateRows: {
            core: coreRows.length,
            mix: mixRows.length,
            experimental: expRows.length,
          },
        };
      }

      return {
        confidence,
        dataPoints,
        metrics: {
          totalContributions,
          aiAssisted,
          humanReviewed,
          collaborationRate: latestCore ? Number(latestCore.collaborationRate) : 0,
          forumHelpfulness: latestCore ? Number(latestCore.forumHelpfulness) : 0,
          personalityDistribution: latestExp?.personalityDistribution ?? {},
          learningLoopSignal: latestExp?.learningLoopSignal ?? "stable",
        },
        sparklines,
        admin,
      };
    }),
});
