import { and, eq, inArray, sql } from "drizzle-orm";

import type { db as _db } from "@/server/db";
import {
  communityMemberships,
  notificationOptouts,
  notifications,
  broadcasts,
  broadcastDeliveries,
  user,
} from "@/server/db/schema";
import { allowPromotional } from "@/server/notifications/ceiling";
import {
  BROADCAST_CEILING,
  currentWindowKey,
} from "@/server/notifications/constants";
import { sendBroadcastEmail } from "@/server/email";

type DB = typeof _db;

/** Compose and send a PROMOTIONAL broadcast to a community's active members.
 *  In-app notification is always created; email is ceiling-gated per member.
 *  Transactional class is system-reserved (event reminders) — not sendable here. */
export async function sendCommunityBroadcast(
  db: DB,
  opts: {
    communityId: string;
    authorId: string;
    subject: string;
    body: string;
  },
): Promise<{ broadcastId: string; emailed: number }> {
  const communityId = opts.communityId;
  const now = new Date();
  const windowKey = currentWindowKey(now);

  const [broadcast] = await db
    .insert(broadcasts)
    .values({
      communityId,
      authorId: opts.authorId,
      subject: opts.subject,
      body: opts.body,
      class: "promotional",
    })
    .returning({ id: broadcasts.id });

  // Idempotency gate: mark sent immediately so a crash/retry can't double-send.
  await db
    .update(broadcasts)
    .set({ sentAt: now })
    .where(eq(broadcasts.id, broadcast!.id));

  // Active members of this community.
  const members = await db
    .select({
      userId: communityMemberships.userId,
      email: user.email,
    })
    .from(communityMemberships)
    .innerJoin(user, eq(communityMemberships.userId, user.id))
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.status, "active"),
      ),
    );
  const memberIds = members.map((member) => member.userId);
  if (memberIds.length === 0) {
    return { broadcastId: broadcast!.id, emailed: 0 };
  }

  // Members who opted out of THIS community's broadcasts.
  const optedOut = new Set(
    (
      await db
        .select({ userId: notificationOptouts.userId })
        .from(notificationOptouts)
        .where(
          and(
            inArray(notificationOptouts.userId, memberIds),
            eq(notificationOptouts.communityId, communityId),
            eq(notificationOptouts.category, "broadcast"),
          ),
        )
    ).map((r) => r.userId),
  );

  // Each member's total active-community count (fair-share denominator).
  const communityCounts = new Map<string, number>(
    (
      await db
        .select({
          userId: communityMemberships.userId,
          n: sql<number>`count(*)::int`,
        })
        .from(communityMemberships)
        .where(
          and(
            inArray(communityMemberships.userId, memberIds),
            eq(communityMemberships.status, "active"),
          ),
        )
        .groupBy(communityMemberships.userId)
    ).map((r) => [r.userId, r.n]),
  );

  // Each member's promotional emails already sent this window, per community.
  const priorSends = await db
    .select({
      userId: broadcastDeliveries.userId,
      communityId: broadcastDeliveries.communityId,
      n: sql<number>`count(*)::int`,
    })
    .from(broadcastDeliveries)
    .where(
      and(
        inArray(broadcastDeliveries.userId, memberIds),
        eq(broadcastDeliveries.windowKey, windowKey),
        eq(broadcastDeliveries.class, "promotional"),
        eq(broadcastDeliveries.emailSent, true),
      ),
    )
    .groupBy(broadcastDeliveries.userId, broadcastDeliveries.communityId);

  const sendsByUser = new Map<string, Record<string, number>>();
  for (const r of priorSends) {
    const m = sendsByUser.get(r.userId) ?? {};
    if (r.communityId) m[r.communityId] = r.n;
    sendsByUser.set(r.userId, m);
  }

  const notificationRows: (typeof notifications.$inferInsert)[] = [];
  const deliveryRows: (typeof broadcastDeliveries.$inferInsert)[] = [];

  let emailed = 0;
  for (const member of members) {
    if (optedOut.has(member.userId)) continue;

    // In-app notification: always (pull, not ceiling-limited).
    notificationRows.push({
      userId: member.userId,
      type: "broadcast",
      title: opts.subject,
      content: opts.body,
      communityId,
      metadata: { broadcastId: broadcast!.id },
    });

    const emailAllowed = allowPromotional({
      sendsByCommunity: sendsByUser.get(member.userId) ?? {},
      communityId,
      nCommunities: communityCounts.get(member.userId) ?? 1,
      ceiling: BROADCAST_CEILING,
    });

    let emailSent = false;
    if (emailAllowed) {
      try {
        emailSent = await sendBroadcastEmail(
          member.email,
          opts.subject,
          opts.body,
        );
      } catch (err) {
        console.error(`broadcast: send failed for ${member.userId}`, err);
      }
      if (emailSent) emailed++;
    }
    deliveryRows.push({
      broadcastId: broadcast!.id,
      userId: member.userId,
      communityId,
      class: "promotional",
      emailSent,
      windowKey,
    });
  }

  if (notificationRows.length)
    await db.insert(notifications).values(notificationRows);
  if (deliveryRows.length)
    await db.insert(broadcastDeliveries).values(deliveryRows);

  return { broadcastId: broadcast!.id, emailed };
}
