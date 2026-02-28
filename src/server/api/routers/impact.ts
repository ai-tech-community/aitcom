import { and, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import { clampRate, safeDelta, safePercent, toWeeklyBuckets } from "@/lib/impact-metrics";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import {
  activityEvents,
  challengeEnrollments,
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

export const impactRouter = createTRPCRouter({
  getOverview: publicProcedure
    .input(z.object({ range: z.enum(["30d", "all"]).default("30d") }))
    .query(async ({ ctx, input }) => {
      const now = new Date();
      const since = getSinceDate(input.range);
      const previousSince = since
        ? new Date(since.getTime() - 30 * 24 * 60 * 60 * 1000)
        : null;

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

      const trendSince = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);
      const trendRows = await ctx.db
        .select({
          createdAt: activityEvents.createdAt,
          actorType: activityEvents.actorType,
          action: activityEvents.action,
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
          },
          members: {
            responseHealth: medianFirstResponse,
            answeredThreads: threadsAnswered.totalDocs ?? 0,
          },
          sponsors: {
            deliveryRate: challengeCompletionRate,
            activeBuilders: challengeParticipation,
          },
        },
        experimental: {
          confidence: "experimental",
          items: [
            {
              key: "agentPersonalityMix",
              value: aiAssisted,
            },
            {
              key: "humanOverrideRate",
              value: clampRate(safePercent(humanReviewedAi, Math.max(aiAssisted, 1))),
            },
            {
              key: "creativityIndex",
              value: clampRate(safePercent(challengeCompleted, Math.max(challengeParticipation, 1))),
            },
            {
              key: "collaborationDepth",
              value: Number((humanReviewedAi / Math.max(challengeCompleted, 1)).toFixed(1)),
            },
          ],
        },
        lastUpdatedAt: now.toISOString(),
      };
    }),
});

