import type { db as _db } from "@/server/db";
import {
  activityEvents,
  challengeEnrollments,
  challengeProgress,
} from "@/server/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getPayloadClient } from "@/server/payload";
import { awardXp, awardBadge } from "@/lib/gamification";
import { classifyPersonality, deriveContextType } from "@/lib/impact-metrics";
import { computeCommissionedCellXp } from "./commissioned-cell-xp";

export {
  computeCommissionedCellXp,
  COMMISSIONED_VERIFICATION_WEIGHT,
} from "./commissioned-cell-xp";

// Accept either the root db or a transaction handle so callers can thread these
// writes into their own transaction (e.g. verifyCellResult's atomic
// result-flip + commissioned-cell XP award, CR-3).
type Tx = Parameters<Parameters<(typeof _db)["transaction"]>[0]>[0];
type DB = typeof _db | Tx;

/**
 * Verification-gated XP for a commissioned [[work-cell]] (ADR-0022/0023).
 *
 * XP is gated behind the cell's verification mode — a weighting modelled on
 * challenge XP in `challenges.ts` (`VERIFICATION_WEIGHT`) but which deliberately
 * diverges: a lower self-report fraction (0.2 vs 0.8) plus a new consensus tier
 * (1.5), per the ADR-0022 anti-farm rationale. Strong verification (consensus /
 * test) pays full weight; a bare self-report pays a small fraction;
 * a failed or still-pending outcome pays nothing. A self-reported commissioned
 * result must never mint the same XP as a consensus-verified one — verification
 * is the gate, not submission.
 *
 * The pure math lives in `./commissioned-cell-xp` (db-free, re-exported above);
 * this wrapper adds the XP-award + activity-event writes.
 */

/**
 * Award the cell owner XP for a *verified* commissioned cell and log a
 * `workcell.completed` activity event carrying `metadata.isCommissioned=true`.
 *
 * The owner is the human who commissioned their agent (the commission's owner),
 * NOT the agent. XP is scaled by `verificationMode` and zeroed unless the
 * outcome is "verified". The activity event is deliberately kept OUT of
 * `CONTRIBUTION_ACTIONS` and is additionally tagged `isCommissioned` so the
 * at-risk / unactivated / greeter signals exclude it (commissioned execution is
 * not an activation signal — ADR-0022).
 */
export async function awardCommissionedCellXp(
  db: DB,
  args: {
    ownerId: string;
    cellId: string;
    gridId: string;
    verificationMode: string;
    verificationOutcome: "verified" | "failed" | "pending";
    communityId?: string | null;
  },
) {
  // Verification is the gate: only a verified outcome pays. A self-reported
  // verified cell still pays only the small self-report fraction.
  const xp = computeCommissionedCellXp(
    args.verificationMode,
    args.verificationOutcome,
  );

  if (xp > 0) {
    await awardXp(db, args.ownerId, xp);
  }

  await db.insert(activityEvents).values({
    actorId: args.ownerId,
    actorType: "member",
    action: "workcell.completed",
    targetType: "work_cell",
    targetId: args.cellId,
    communityId: args.communityId ?? null,
    metadata: {
      isCommissioned: true,
      gridId: args.gridId,
      verificationMode: args.verificationMode,
      verificationOutcome: args.verificationOutcome,
      xp,
    },
  });

  return xp;
}

export async function logActivity(
  db: DB,
  event: {
    actorId: string;
    actorType: "member" | "agent" | "system";
    action: string;
    targetType?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
    collabSessionId?: string;
    recipientId?: string;
    communityId?: string;
  },
) {
  const personalityLabel = classifyPersonality(event.action);
  const contextType = deriveContextType(event.action);

  await db.insert(activityEvents).values({
    actorId: event.actorId,
    actorType: event.actorType,
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    collabSessionId: event.collabSessionId ?? null,
    contextType: contextType ?? null,
    recipientId: event.recipientId ?? null,
    communityId: event.communityId,
    metadata: {
      ...event.metadata,
      ...(personalityLabel ? { personalityLabel } : {}),
    },
  });

  // Fire-and-forget: check challenge progress for member platform actions
  if (event.actorType === "member") {
    checkPlatformActionProgress(
      db,
      event.actorId,
      event.action,
      event.metadata,
    ).catch((err) => console.error("[challenges] progress check failed:", err));
  }
}

/**
 * Enrich metadata with challenge collaboration model.
 * Call this when logging challenge-related activities.
 */
export async function enrichChallengeMetadata(
  challengeId: number,
  metadata: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  try {
    const payload = await getPayloadClient();
    const challenge = await payload.findByID({
      collection: "challenges",
      id: challengeId,
      depth: 0,
    });
    return {
      ...metadata,
      collaborationModel: challenge?.collaborationModel ?? "solo-ai",
      generatedBy: challenge?.generatedBy ?? "human",
    };
  } catch {
    return metadata;
  }
}

/**
 * Check if a member's platform action advances any "platform-action" objectives.
 * Other verification modes (test, self-report, peer-review) are handled by
 * explicit MCP tool calls in the challenges/agent routers.
 */
async function checkPlatformActionProgress(
  db: DB,
  userId: string,
  action: string,
  metadata?: Record<string, unknown>,
) {
  const enrollments = await db
    .select({
      enrollmentId: challengeEnrollments.id,
      challengeId: challengeEnrollments.challengeId,
      progressLogThreadId: challengeEnrollments.progressLogThreadId,
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
    const challenge = await payload.findByID({
      collection: "challenges",
      id: enrollment.challengeId,
      depth: 0,
    });

    const objectives =
      (challenge.objectives as
        | {
            verification?: string;
            action?: string;
            targetCount: number;
            filter?: Record<string, unknown>;
          }[]
        | undefined) ?? [];

    for (let i = 0; i < objectives.length; i++) {
      const objective = objectives[i]!;

      // Only handle platform-action verification
      if (objective.verification !== "platform-action") continue;
      if (objective.action !== action) continue;

      // Check filter match
      if (objective.filter && metadata) {
        const filterMatch = Object.entries(objective.filter).every(
          ([key, value]) => metadata[key] === value,
        );
        if (!filterMatch) continue;
      }

      // Increment progress (only for platform-action objectives)
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
            eq(challengeProgress.verificationMode, "platform-action"),
            sql`${challengeProgress.completedAt} IS NULL`,
          ),
        )
        .returning();

      if (updated && updated.currentCount >= objective.targetCount) {
        await db.insert(activityEvents).values({
          actorId: userId,
          actorType: "member",
          action: "challenge.objective_completed",
          targetType: "challenges",
          targetId: String(enrollment.challengeId),
          collabSessionId: enrollment.progressLogThreadId ?? null,
          contextType: "challenge",
          communityId: challenge.communityId ?? null,
          metadata: {
            title: challenge.title,
            objectiveIndex: i,
            objectiveDescription: objective.action,
            personalityLabel: classifyPersonality(
              "challenge.objective_completed",
            ),
            collaborationModel: challenge.collaborationModel ?? "solo-ai",
          },
        });
      }
    }

    // Check if all objectives are now complete
    await checkEnrollmentCompletion(
      db,
      enrollment.enrollmentId,
      enrollment.challengeId,
      userId,
    );
  }
}

/**
 * Shared function: check if all objectives for an enrollment are complete.
 * Called by platform-action progress, test results, self-report, and peer-review flows.
 */
export async function checkEnrollmentCompletion(
  db: DB,
  enrollmentId: string,
  challengeId: number,
  userId: string,
) {
  const [progress] = await db
    .select({
      total: sql<number>`count(*)::int`,
      incomplete: sql<number>`count(*) FILTER (WHERE ${challengeProgress.completedAt} IS NULL)::int`,
    })
    .from(challengeProgress)
    .where(eq(challengeProgress.enrollmentId, enrollmentId));

  // Zero tracked objectives (e.g. hackathon-scaffolded challenges with empty
  // objectives) can never auto-complete — completing requires at least one
  // objective to have existed. Without this, incomplete === 0 vacuously and the
  // first progress-adjacent event would flip the enrollment mid-hackathon.
  if ((progress?.total ?? 0) === 0) return;
  if ((progress?.incomplete ?? 0) !== 0) return;

  // All objectives complete - mark enrollment
  const [enrollment] = await db
    .update(challengeEnrollments)
    .set({ status: "completed", completedAt: new Date() })
    .where(
      and(
        eq(challengeEnrollments.id, enrollmentId),
        eq(challengeEnrollments.status, "active"),
      ),
    )
    .returning();

  if (!enrollment) return; // Already completed

  const payload = await getPayloadClient();
  const challenge = await payload.findByID({
    collection: "challenges",
    id: challengeId,
    depth: 0,
  });

  const rewards = challenge.rewards as
    | { xpReward?: number; badgeReward?: string }
    | undefined;

  let xpAwarded = 0;

  if (rewards?.xpReward && typeof rewards.xpReward === "number") {
    xpAwarded = rewards.xpReward;

    // Monthly XP cap for community-proposed challenges (sponsor challenges uncapped)
    if (challenge.publishedBy === "member") {
      const COMMUNITY_MONTHLY_XP_CAP = 500;
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      const [earned] = await db
        .select({
          total: sql<number>`coalesce(sum((metadata->>'xp')::int), 0)`,
        })
        .from(activityEvents)
        .where(
          and(
            eq(activityEvents.actorId, userId),
            eq(activityEvents.action, "challenge.completed"),
            sql`${activityEvents.createdAt} >= ${monthStart.toISOString()}`,
          ),
        );

      const alreadyEarned = earned?.total ?? 0;
      const remaining = Math.max(0, COMMUNITY_MONTHLY_XP_CAP - alreadyEarned);
      xpAwarded = Math.min(xpAwarded, remaining);
    }

    if (xpAwarded > 0) {
      await awardXp(db, userId, xpAwarded);
    }
  }

  if (rewards?.badgeReward && typeof rewards.badgeReward === "string") {
    await awardBadge(db, userId, rewards.badgeReward);
  }

  await db.insert(activityEvents).values({
    actorId: userId,
    actorType: "member",
    action: "challenge.completed",
    targetType: "challenges",
    targetId: String(challengeId),
    collabSessionId: enrollment.progressLogThreadId ?? null,
    contextType: "challenge",
    communityId: challenge.communityId ?? null,
    metadata: {
      title: challenge.title,
      xp: xpAwarded,
      publishedBy: challenge.publishedBy,
      personalityLabel: classifyPersonality("challenge.completed"),
      collaborationModel: challenge.collaborationModel ?? "solo-ai",
    },
  });
}
