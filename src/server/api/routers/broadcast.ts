import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";

import { createTRPCRouter, communityProcedure } from "@/server/api/trpc";
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

export const broadcastRouter = createTRPCRouter({
  /** Compose and send a PROMOTIONAL broadcast to a community's active members.
   *  In-app notification is always created; email is ceiling-gated per member.
   *  Transactional class is system-reserved (event reminders) — not sendable here. */
  send: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        subject: z.string().min(1).max(200),
        body: z.string().min(1).max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const communityId = ctx.community.id;
      const now = new Date();
      const windowKey = currentWindowKey(now);

      const [broadcast] = await ctx.db
        .insert(broadcasts)
        .values({
          communityId,
          authorId: ctx.session.user.id,
          subject: input.subject,
          body: input.body,
          class: "promotional",
        })
        .returning({ id: broadcasts.id });

      // Active members of this community.
      const members = await ctx.db
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
      const memberIds = members.map((m) => m.userId);
      if (memberIds.length === 0) {
        await ctx.db
          .update(broadcasts)
          .set({ sentAt: now })
          .where(eq(broadcasts.id, broadcast!.id));
        return { broadcastId: broadcast!.id, emailed: 0 };
      }

      // Members who opted out of THIS community's broadcasts.
      const optedOut = new Set(
        (
          await ctx.db
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
          await ctx.db
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
      const priorSends = await ctx.db
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

      let emailed = 0;
      for (const m of members) {
        if (optedOut.has(m.userId)) continue;

        // In-app notification: always (pull, not ceiling-limited).
        await ctx.db.insert(notifications).values({
          userId: m.userId,
          type: "broadcast",
          title: input.subject,
          content: input.body,
          communityId,
          metadata: { broadcastId: broadcast!.id },
        });

        const emailAllowed = allowPromotional({
          sendsByCommunity: sendsByUser.get(m.userId) ?? {},
          communityId,
          nCommunities: communityCounts.get(m.userId) ?? 1,
          ceiling: BROADCAST_CEILING,
        });

        let emailSent = false;
        if (emailAllowed) {
          try {
            emailSent = await sendBroadcastEmail(m.email, input.subject, input.body);
          } catch (err) {
            console.error(`broadcast: send failed for ${m.userId}`, err);
          }
          if (emailSent) emailed++;
        }
        await ctx.db.insert(broadcastDeliveries).values({
          broadcastId: broadcast!.id,
          userId: m.userId,
          communityId,
          class: "promotional",
          emailSent,
          windowKey,
        });
      }

      await ctx.db
        .update(broadcasts)
        .set({ sentAt: now })
        .where(eq(broadcasts.id, broadcast!.id));

      return { broadcastId: broadcast!.id, emailed };
    }),
});
