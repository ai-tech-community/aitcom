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

/** Max IDs per IN(...) clause — avoids oversized query plans on large communities. */
const CHUNK_SIZE = 500;

/** Split an array into consecutive chunks of at most `size` elements. */
function chunks<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size)
    result.push(arr.slice(i, i + size));
  return result;
}

/** Compose and send a PROMOTIONAL broadcast to a community's active members.
 *  In-app notification is created for opted-in members; email is ceiling-gated
 *  per member.  Transactional class is system-reserved (event reminders) — not
 *  sendable here. */
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

  // Record when the broadcast was dispatched (audit trail only — not a
  // double-send guard; a tRPC retry still creates a new broadcasts row).
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
  // Chunked to avoid oversized IN(...) on large communities.
  const optedOutRows = (
    await Promise.all(
      chunks(memberIds, CHUNK_SIZE).map((chunk) =>
        db
          .select({ userId: notificationOptouts.userId })
          .from(notificationOptouts)
          .where(
            and(
              inArray(notificationOptouts.userId, chunk),
              eq(notificationOptouts.communityId, communityId),
              eq(notificationOptouts.category, "broadcast"),
            ),
          ),
      ),
    )
  ).flat();
  const optedOut = new Set(optedOutRows.map((r) => r.userId));

  const eligibleMembers = members.filter((m) => !optedOut.has(m.userId));
  const eligibleIds = eligibleMembers.map((m) => m.userId);
  if (eligibleIds.length === 0) {
    return { broadcastId: broadcast!.id, emailed: 0 };
  }

  // --- Claim-before-send (ceiling race guard) ---
  // Insert one delivery row per eligible member with dedupeKey =
  // "broadcast:<broadcastId>".  The existing partial unique index
  // broadcast_delivery_dedupe_uidx (userId, dedupeKey) WHERE dedupeKey IS NOT
  // NULL prevents duplicate delivery if this function is retried for the same
  // broadcast.  onConflictDoNothing: rows that already exist (retry) are
  // silently skipped, and the returning clause tells us which claims we won.
  const broadcastDedupeKey = `broadcast:${broadcast!.id}`;
  const claimRows = eligibleMembers.map((m) => ({
    broadcastId: broadcast!.id,
    userId: m.userId,
    communityId,
    class: "promotional" as const,
    emailSent: false,
    windowKey,
    dedupeKey: broadcastDedupeKey,
  }));

  // Batch insert claims; chunk to stay within parameter limits.
  const claimedUserIds = new Set<string>(
    (
      await Promise.all(
        chunks(claimRows, CHUNK_SIZE).map((chunk) =>
          db
            .insert(broadcastDeliveries)
            .values(chunk)
            .onConflictDoNothing()
            .returning({ userId: broadcastDeliveries.userId }),
        ),
      )
    )
      .flat()
      .map((r) => r.userId),
  );

  if (claimedUserIds.size === 0) {
    // All claims were already held — this is a pure retry with no new work.
    return { broadcastId: broadcast!.id, emailed: 0 };
  }

  const claimedMembers = eligibleMembers.filter((m) =>
    claimedUserIds.has(m.userId),
  );
  const claimedIds = [...claimedUserIds];

  // Each member's total active-community count (fair-share denominator).
  // Chunked — large communities may have members in many IDs.
  const communityCountRows = (
    await Promise.all(
      chunks(claimedIds, CHUNK_SIZE).map((chunk) =>
        db
          .select({
            userId: communityMemberships.userId,
            n: sql<number>`count(*)::int`,
          })
          .from(communityMemberships)
          .where(
            and(
              inArray(communityMemberships.userId, chunk),
              eq(communityMemberships.status, "active"),
            ),
          )
          .groupBy(communityMemberships.userId),
      ),
    )
  ).flat();
  const communityCounts = new Map<string, number>(
    communityCountRows.map((r) => [r.userId, r.n]),
  );

  // Each member's promotional emails already sent this window, per community.
  // Re-read POST-claim so that concurrent broadcasts' claimed rows are visible,
  // tightening (not eliminating) the ceiling race across distinct broadcasts.
  // Chunked for scale.
  const priorSendRows = (
    await Promise.all(
      chunks(claimedIds, CHUNK_SIZE).map((chunk) =>
        db
          .select({
            userId: broadcastDeliveries.userId,
            communityId: broadcastDeliveries.communityId,
            n: sql<number>`count(*)::int`,
          })
          .from(broadcastDeliveries)
          .where(
            and(
              inArray(broadcastDeliveries.userId, chunk),
              eq(broadcastDeliveries.windowKey, windowKey),
              eq(broadcastDeliveries.class, "promotional"),
              eq(broadcastDeliveries.emailSent, true),
            ),
          )
          .groupBy(broadcastDeliveries.userId, broadcastDeliveries.communityId),
      ),
    )
  ).flat();

  const sendsByUser = new Map<string, Record<string, number>>();
  for (const r of priorSendRows) {
    const m = sendsByUser.get(r.userId) ?? {};
    if (r.communityId) m[r.communityId] = r.n;
    sendsByUser.set(r.userId, m);
  }

  const notificationRows: (typeof notifications.$inferInsert)[] = [];
  const emailedUserIds: string[] = [];

  let emailed = 0;
  for (const member of claimedMembers) {
    // In-app notification for opted-in members (pull channel, not ceiling-limited).
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

    if (emailAllowed) {
      let emailSent = false;
      try {
        emailSent = await sendBroadcastEmail(
          member.email,
          opts.subject,
          opts.body,
        );
      } catch (err) {
        console.error(`broadcast: send failed for ${member.userId}`, err);
      }
      if (emailSent) {
        emailedUserIds.push(member.userId);
        emailed++;
      }
    }
  }

  if (notificationRows.length)
    await db.insert(notifications).values(notificationRows);

  // Mark delivery rows as emailSent=true for members who were successfully emailed.
  // Chunked to avoid oversized IN(...).
  if (emailedUserIds.length > 0) {
    await Promise.all(
      chunks(emailedUserIds, CHUNK_SIZE).map((chunk) =>
        db
          .update(broadcastDeliveries)
          .set({ emailSent: true })
          .where(
            and(
              eq(broadcastDeliveries.broadcastId, broadcast!.id),
              inArray(broadcastDeliveries.userId, chunk),
            ),
          ),
      ),
    );
  }

  return { broadcastId: broadcast!.id, emailed };
}
