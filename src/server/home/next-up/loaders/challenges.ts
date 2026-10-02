import { and, eq } from "drizzle-orm";

import { challengeEnrollments } from "@/server/db/schema";

import type { NextUpChallengeItem, NextUpContext } from "../types";

/**
 * Challenges the member is working on: active enrollments joined to their
 * live (status "active") challenge in one batched Payload lookup. A
 * challenge whose deadline has passed is left out — there is nothing left
 * to do before it. With a deadline the item is time-bound; open-ended
 * challenges are ongoing work.
 */
export async function loadChallengeItems(
  ctx: NextUpContext,
): Promise<NextUpChallengeItem[]> {
  const enrollments = await ctx.db
    .select({
      id: challengeEnrollments.id,
      challengeId: challengeEnrollments.challengeId,
    })
    .from(challengeEnrollments)
    .where(
      and(
        eq(challengeEnrollments.userId, ctx.userId),
        eq(challengeEnrollments.status, "active"),
      ),
    );

  const challengeIds = [...new Set(enrollments.map((e) => e.challengeId))];
  if (challengeIds.length === 0) return [];

  const payload = await ctx.getPayload();
  const { docs } = await payload.find({
    collection: "challenges",
    where: {
      and: [{ id: { in: challengeIds } }, { status: { equals: "active" } }],
    },
    limit: challengeIds.length,
    depth: 0,
  });
  const challenges = new Map(docs.map((c) => [c.id, c]));

  return enrollments.flatMap((enrollment): NextUpChallengeItem[] => {
    const challenge = challenges.get(enrollment.challengeId);
    if (!challenge) return [];
    const deadline = challenge.endsAt ? new Date(challenge.endsAt) : null;
    const validDeadline =
      deadline && !Number.isNaN(deadline.getTime()) ? deadline : null;
    if (validDeadline && validDeadline.getTime() <= ctx.now.getTime()) {
      return [];
    }
    const endsAt = validDeadline?.toISOString() ?? null;
    return [
      {
        kind: "challenge",
        key: `challenge:${enrollment.id}`,
        urgency: endsAt
          ? { tier: "timeBound", at: endsAt }
          : { tier: "ongoing" },
        challengeId: challenge.id,
        slug: challenge.slug,
        title: challenge.title,
        endsAt,
      },
    ];
  });
}
