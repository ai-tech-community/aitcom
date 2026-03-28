import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  challengeEnrollments,
  challengeProgress,
  activityEvents,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { awardXp } from "@/lib/gamification";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron job: runs daily to expire challenges past their end date.
 * Awards partial XP for incomplete enrollments.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await getPayloadClient();

  // Find active challenges past their end date (skip open-ended challenges)
  const { docs: expiredChallenges } = await payload.find({
    collection: "challenges",
    where: {
      and: [
        { status: { equals: "active" } },
        { type: { not_equals: "open-ended" } },
        { endsAt: { exists: true } },
        { endsAt: { less_than: new Date().toISOString() } },
      ],
    },
    limit: 100,
    depth: 0,
  });

  let expired = 0;

  for (const challenge of expiredChallenges) {
    // Mark challenge as completed in CMS
    await payload.update({
      collection: "challenges",
      id: challenge.id,
      data: { status: "completed" },
    });

    // Find active enrollments
    const activeEnrollments = await db
      .select()
      .from(challengeEnrollments)
      .where(
        and(
          eq(challengeEnrollments.challengeId, challenge.id),
          eq(challengeEnrollments.status, "active"),
        ),
      );

    for (const enrollment of activeEnrollments) {
      // Calculate partial completion
      const objectives =
        (challenge.objectives as { targetCount: number }[] | undefined) ?? [];
      const totalObjectives = objectives.length;

      const [completedResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(challengeProgress)
        .where(
          and(
            eq(challengeProgress.enrollmentId, enrollment.id),
            sql`${challengeProgress.completedAt} IS NOT NULL`,
          ),
        );

      const completedCount = completedResult?.count ?? 0;

      // Mark as abandoned
      await db
        .update(challengeEnrollments)
        .set({ status: "abandoned" })
        .where(eq(challengeEnrollments.id, enrollment.id));

      // Award partial XP (proportional to objectives completed)
      const xpReward = challenge.rewards?.xpReward;
      if (
        completedCount > 0 &&
        xpReward &&
        typeof xpReward === "number"
      ) {
        const partialXp = Math.round(
          (xpReward * completedCount) / totalObjectives,
        );
        if (partialXp > 0) {
          await awardXp(db, enrollment.userId, partialXp);
        }
      }

      // Log activity
      await db.insert(activityEvents).values({
        actorId: enrollment.userId,
        actorType: "member",
        action: "challenge.abandoned",
        targetType: "challenges",
        targetId: String(challenge.id),
        contextType: "challenge",
        collabSessionId: enrollment.progressLogThreadId ?? undefined,
        metadata: {
          title: challenge.title,
          completedObjectives: completedCount,
          totalObjectives,
          personalityLabel: "builder",
        },
      });

      expired++;
    }
  }

  return NextResponse.json({
    success: true,
    expiredEnrollments: expired,
    expiredChallenges: expiredChallenges.length,
    timestamp: new Date().toISOString(),
  });
}
