import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { getPayloadClient } from "@/server/payload";
import {
  challengeEnrollments,
  challengeChannels,
  challengeThreads,
  challengeReplies,
  notifications,
  agentProfiles,
} from "@/server/db/schema";
import { eq, and, sql, gte } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  let digestsSent = 0;

  const payload = await getPayloadClient();
  const { docs: activeChallenges } = await payload.find({
    collection: "challenges",
    where: { status: { equals: "active" } },
    limit: 100,
    depth: 0,
  });

  for (const challenge of activeChallenges) {
    // Get channel
    const [channel] = await db
      .select()
      .from(challengeChannels)
      .where(eq(challengeChannels.challengeId, challenge.id))
      .limit(1);

    if (!channel) continue;

    // Count new threads and replies this week
    const [threadCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(challengeThreads)
      .where(
        and(
          eq(challengeThreads.channelId, channel.id),
          gte(challengeThreads.createdAt, oneWeekAgo),
        ),
      );

    const [replyCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(challengeReplies)
      .innerJoin(
        challengeThreads,
        eq(challengeReplies.threadId, challengeThreads.id),
      )
      .where(
        and(
          eq(challengeThreads.channelId, channel.id),
          gte(challengeReplies.createdAt, oneWeekAgo),
        ),
      );

    const threads = threadCount?.count ?? 0;
    const replies = replyCount?.count ?? 0;

    if (threads === 0 && replies === 0) continue;

    // Get active enrollments
    const enrollments = await db
      .select({ userId: challengeEnrollments.userId })
      .from(challengeEnrollments)
      .where(
        and(
          eq(challengeEnrollments.challengeId, challenge.id),
          eq(challengeEnrollments.status, "active"),
        ),
      );

    for (const enrollment of enrollments) {
      // Check if member has an active agent
      const [agent] = await db
        .select({ id: agentProfiles.id })
        .from(agentProfiles)
        .where(
          and(
            eq(agentProfiles.ownerId, enrollment.userId),
            eq(agentProfiles.status, "active"),
          ),
        )
        .limit(1);

      if (!agent) continue;

      const digestMessage = [
        `**Weekly Digest: "${challenge.title}"**`,
        ``,
        `This week in the challenge channel:`,
        `- ${threads} new thread${threads !== 1 ? "s" : ""}`,
        `- ${replies} new repl${replies !== 1 ? "ies" : "y"}`,
        ``,
        `Check the challenge channel for the latest discussions and progress updates.`,
      ].join("\n");

      await db.insert(notifications).values({
        userId: enrollment.userId,
        type: "challenge_digest",
        title: `Weekly Digest: "${challenge.title}"`,
        content: digestMessage,
        metadata: {
          challengeId: challenge.id,
        },
      });

      digestsSent++;
    }
  }

  return NextResponse.json({
    success: true,
    digestsSent,
    timestamp: new Date().toISOString(),
  });
}
