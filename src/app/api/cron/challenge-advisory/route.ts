import { NextResponse } from "next/server";
import { eq, and, sql } from "drizzle-orm";
import { db } from "@/server/db";
import {
  challengeEnrollments,
  challengeProgress,
  challengeChannels,
  agentProfiles,
  conversations,
  conversationParticipants,
  messages,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cron job: runs daily to send proactive challenge advice from agents to members.
 * Protected by CRON_SECRET header to prevent unauthorized access.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await getPayloadClient();

  // Get all active challenges
  const { docs: activeChallenges } = await payload.find({
    collection: "challenges",
    where: { status: { equals: "active" } },
    limit: 100,
    depth: 0,
  });

  let advisorySent = 0;

  for (const challenge of activeChallenges) {
    // Get active enrollments for this challenge
    const enrollments = await db
      .select({
        enrollmentId: challengeEnrollments.id,
        userId: challengeEnrollments.userId,
      })
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
        .select({ id: agentProfiles.id, name: agentProfiles.name })
        .from(agentProfiles)
        .where(
          and(
            eq(agentProfiles.ownerId, enrollment.userId),
            eq(agentProfiles.status, "active"),
          ),
        )
        .limit(1);

      if (!agent) continue;

      // Get incomplete objectives
      const progressRows = await db
        .select()
        .from(challengeProgress)
        .where(
          and(
            eq(challengeProgress.enrollmentId, enrollment.enrollmentId),
            sql`${challengeProgress.completedAt} IS NULL`,
          ),
        );

      if (progressRows.length === 0) continue;

      // Build advice message
      const objectives =
        (
          challenge.objectives as
            | { description: string; action: string; targetCount: number; verification: string }[]
            | undefined
        ) ?? [];
      const totalObjectives = objectives.length;
      const completedCount = totalObjectives - progressRows.length;

      // Check if challenge has a repo URL
      const repoUrl = (challenge.repo as { templateUrl?: string } | undefined)?.templateUrl;

      // Look up the challenge channel
      const [channel] = await db
        .select({ id: challengeChannels.id })
        .from(challengeChannels)
        .where(eq(challengeChannels.challengeId, challenge.id))
        .limit(1);

      let message = `**Challenge Update: "${challenge.title}"**\n\n`;
      message += `You've completed ${completedCount}/${totalObjectives} objectives. Here's what's left:\n\n`;

      for (const progress of progressRows) {
        const objective = objectives[progress.objectiveIndex];
        if (!objective) continue;
        const modeLabel = progress.verificationMode ?? objective.verification ?? "self-report";
        message += `- **${objective.description}** (${progress.currentCount}/${objective.targetCount}) — verification: *${modeLabel}*\n`;
      }

      if (repoUrl) {
        message += `\nRepo: ${repoUrl}`;
      }

      if (channel) {
        message += `\nJoin the challenge channel to discuss progress and ask questions.`;
      }

      message += `\nI'll keep scouting for opportunities. Check the community forum and ideas board!`;

      // Find or create agent conversation
      const [existingConv] = await db
        .select({ id: conversations.id })
        .from(conversations)
        .innerJoin(
          conversationParticipants,
          eq(conversationParticipants.conversationId, conversations.id),
        )
        .where(
          and(
            eq(conversations.type, "agent"),
            eq(conversationParticipants.userId, enrollment.userId),
          ),
        )
        .limit(1);

      let convId: string;
      if (existingConv) {
        convId = existingConv.id;
      } else {
        const [newConv] = await db
          .insert(conversations)
          .values({ type: "agent" })
          .returning();
        await db.insert(conversationParticipants).values({
          conversationId: newConv!.id,
          userId: enrollment.userId,
          isPinned: true,
        });
        convId = newConv!.id;
      }

      // Send the advisory message
      await db.insert(messages).values({
        conversationId: convId,
        senderId: enrollment.userId,
        senderType: "agent",
        content: message,
        metadata: {
          type: "challenge_advisory",
          challengeId: challenge.id,
        },
      });

      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, convId));

      advisorySent++;
    }
  }

  return NextResponse.json({
    success: true,
    advisorySent,
    timestamp: new Date().toISOString(),
  });
}
