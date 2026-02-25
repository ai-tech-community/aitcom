import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getPayloadClient } from "@/server/payload";
import {
  challengeEnrollments,
  challengeProgress,
  conversations,
  conversationParticipants,
  messages,
  memberProfiles,
} from "@/server/db/schema";
import { eq, and, sql, isNull } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  let remindersSent = 0;

  // Find enrollments with peer-review objectives that are submitted but not reviewed
  const staleSubmissions = await db
    .select({
      enrollmentId: challengeEnrollments.id,
      challengeId: challengeEnrollments.challengeId,
      userId: challengeEnrollments.userId,
      submittedAt: challengeEnrollments.submittedAt,
    })
    .from(challengeEnrollments)
    .where(
      and(
        sql`${challengeEnrollments.submittedAt} IS NOT NULL`,
        sql`${challengeEnrollments.submittedAt} < ${threeDaysAgo}`,
        eq(challengeEnrollments.status, "active"),
      ),
    );

  const payload = await getPayloadClient();

  // Group by challenge to send one reminder per challenge creator
  const challengeMap = new Map<number, { challengeId: number; participants: string[] }>();
  for (const sub of staleSubmissions) {
    // Check if there are unreviewed peer-review objectives
    const [unreviewedCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(challengeProgress)
      .where(
        and(
          eq(challengeProgress.enrollmentId, sub.enrollmentId),
          eq(challengeProgress.verificationMode, "peer-review"),
          isNull(challengeProgress.reviewedAt),
          isNull(challengeProgress.completedAt),
        ),
      );

    if ((unreviewedCount?.count ?? 0) === 0) continue;

    const entry = challengeMap.get(sub.challengeId) ?? {
      challengeId: sub.challengeId,
      participants: [],
    };
    entry.participants.push(sub.userId);
    challengeMap.set(sub.challengeId, entry);
  }

  for (const [challengeId, { participants }] of challengeMap) {
    let challenge;
    try {
      challenge = await payload.findByID({
        collection: "challenges",
        id: challengeId,
        depth: 0,
      });
    } catch {
      continue;
    }

    const creatorId = challenge.creatorId;
    if (!creatorId) continue;

    // Get participant names
    const names = await db
      .select({ displayName: memberProfiles.displayName })
      .from(memberProfiles)
      .where(
        sql`${memberProfiles.userId} IN (${sql.join(
          participants.map((id) => sql`${id}`),
          sql`, `,
        )})`,
      );

    const nameList = names.map((n) => n.displayName).join(", ");

    // Find creator's agent conversation
    const [conv] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        eq(conversationParticipants.conversationId, conversations.id),
      )
      .where(
        and(
          eq(conversations.type, "agent"),
          eq(conversationParticipants.userId, creatorId),
        ),
      )
      .limit(1);

    if (!conv) continue;

    const reminderMessage = [
      `**Review Reminder: "${challenge.title}"**`,
      ``,
      `${participants.length} participant${participants.length !== 1 ? "s have" : " has"} pending peer reviews waiting for more than 3 days:`,
      `${nameList}`,
      ``,
      `Please review their solutions in the challenge channel.`,
    ].join("\n");

    await db.insert(messages).values({
      conversationId: conv.id,
      senderId: creatorId,
      senderType: "agent",
      content: reminderMessage,
      metadata: { type: "stale_review_reminder", challengeId },
    });

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conv.id));

    remindersSent++;
  }

  return NextResponse.json({
    success: true,
    remindersSent,
    timestamp: new Date().toISOString(),
  });
}
