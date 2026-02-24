import type { db as _db } from "@/server/db";
import {
  activityEvents,
  challengeEnrollments,
  challengeProgress,
} from "@/server/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getPayloadClient } from "@/server/payload";
import { awardXp, awardBadge } from "@/lib/gamification";

type DB = typeof _db;

export async function logActivity(
  db: DB,
  event: {
    actorId: string;
    actorType: "member" | "agent";
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(activityEvents).values({
    actorId: event.actorId,
    actorType: event.actorType,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    metadata: event.metadata,
  });

  // Fire-and-forget: check challenge progress for member actions
  if (event.actorType === "member") {
    checkChallengeProgress(db, event.actorId, event.action, event.metadata).catch(
      (err) => console.error("[challenges] progress check failed:", err),
    );
  }
}

/**
 * Check if a member's action advances any active challenge objectives.
 */
async function checkChallengeProgress(
  db: DB,
  userId: string,
  action: string,
  metadata?: Record<string, unknown>,
) {
  // Find active enrollments for this user
  const enrollments = await db
    .select({
      enrollmentId: challengeEnrollments.id,
      challengeId: challengeEnrollments.challengeId,
    })
    .from(challengeEnrollments)
    .where(
      and(
        eq(challengeEnrollments.userId, userId),
        eq(challengeEnrollments.status, "active"),
      ),
    );

  if (enrollments.length === 0) return;

  const payload = await getPayloadClient();

  for (const enrollment of enrollments) {
    // Fetch challenge objectives
    const challenge = await payload.findByID({
      collection: "challenges",
      id: enrollment.challengeId,
      depth: 0,
    });

    const objectives =
      (challenge.objectives as
        | {
            action: string;
            targetCount: number;
            filter?: Record<string, unknown>;
          }[]
        | undefined) ?? [];

    for (let i = 0; i < objectives.length; i++) {
      const objective = objectives[i]!;

      // Check if this action matches the objective
      if (objective.action !== action) continue;

      // Check filter match (if present)
      if (objective.filter && metadata) {
        const filterMatch = Object.entries(objective.filter).every(
          ([key, value]) => metadata[key] === value,
        );
        if (!filterMatch) continue;
      }

      // Increment progress
      const [updated] = await db
        .update(challengeProgress)
        .set({
          currentCount: sql`${challengeProgress.currentCount} + 1`,
          completedAt: sql`CASE WHEN ${challengeProgress.currentCount} + 1 >= ${objective.targetCount} THEN CURRENT_TIMESTAMP ELSE ${challengeProgress.completedAt} END`,
        })
        .where(
          and(
            eq(challengeProgress.enrollmentId, enrollment.enrollmentId),
            eq(challengeProgress.objectiveIndex, i),
            sql`${challengeProgress.completedAt} IS NULL`, // Don't increment already completed
          ),
        )
        .returning();

      // Log objective completion for personal feed
      if (updated && updated.currentCount >= objective.targetCount) {
        await db.insert(activityEvents).values({
          actorId: userId,
          actorType: "member",
          action: "challenge.objective_completed",
          targetType: "challenges",
          targetId: String(enrollment.challengeId),
          metadata: {
            title: challenge.title,
            objectiveIndex: i,
            objectiveDescription: objective.action,
          },
        });
      }
    }

    // Check if all objectives are now complete
    const [incompleteCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(challengeProgress)
      .where(
        and(
          eq(challengeProgress.enrollmentId, enrollment.enrollmentId),
          sql`${challengeProgress.completedAt} IS NULL`,
        ),
      );

    if ((incompleteCount?.count ?? 0) === 0) {
      // All objectives complete — mark enrollment as completed
      await db
        .update(challengeEnrollments)
        .set({ status: "completed", completedAt: new Date() })
        .where(eq(challengeEnrollments.id, enrollment.enrollmentId));

      // Award XP
      if (challenge.xpReward && typeof challenge.xpReward === "number") {
        await awardXp(db, userId, challenge.xpReward);
      }

      // Award badge
      if (challenge.badgeReward && typeof challenge.badgeReward === "string") {
        await awardBadge(db, userId, challenge.badgeReward);
      }

      // Log challenge completion for community feed
      await db.insert(activityEvents).values({
        actorId: userId,
        actorType: "member",
        action: "challenge.completed",
        targetType: "challenges",
        targetId: String(enrollment.challengeId),
        metadata: {
          title: challenge.title,
          xpReward: challenge.xpReward,
        },
      });
    }
  }
}
