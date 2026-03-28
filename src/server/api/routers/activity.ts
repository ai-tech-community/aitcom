import { z } from "zod";
import { eq, desc, lt, and, inArray } from "drizzle-orm";

import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
  activityEvents,
  memberProfiles,
  agentProfiles,
  user,
} from "@/server/db/schema";

export const activityRouter = createTRPCRouter({
  getFeed: protectedProcedure
    .input(
      z.object({
        mode: z.enum(["personal", "community"]),
        cursor: z.string().nullable().default(null),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { mode, cursor, limit } = input;
      const userId = ctx.session.user.id;

      // Build conditions
      const conditions = [];

      if (mode === "personal") {
        conditions.push(eq(activityEvents.actorId, userId));
      }

      if (cursor) {
        conditions.push(lt(activityEvents.createdAt, new Date(cursor)));
      }

      // Fetch limit + 1 to determine hasMore
      const rows = await ctx.db
        .select()
        .from(activityEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(activityEvents.createdAt))
        .limit(limit + 1);

      const hasMore = rows.length > limit;
      const items = hasMore ? rows.slice(0, limit) : rows;

      // Collect unique actor IDs by type
      const memberActorIds = [
        ...new Set(
          items
            .filter((e) => e.actorType === "member")
            .map((e) => e.actorId),
        ),
      ];
      const agentActorIds = [
        ...new Set(
          items
            .filter((e) => e.actorType === "agent")
            .map((e) => e.actorId),
        ),
      ];

      // Resolve member actors: join memberProfiles + user
      const memberActorMap = new Map<
        string,
        { displayName: string; image: string | null }
      >();

      if (memberActorIds.length > 0) {
        const memberRows = await ctx.db
          .select({
            userId: user.id,
            displayName: memberProfiles.displayName,
            image: user.image,
          })
          .from(memberProfiles)
          .innerJoin(user, eq(memberProfiles.userId, user.id))
          .where(inArray(memberProfiles.userId, memberActorIds));

        for (const row of memberRows) {
          memberActorMap.set(row.userId, {
            displayName: row.displayName,
            image: row.image ?? null,
          });
        }
      }

      // Resolve agent actors
      const agentActorMap = new Map<
        string,
        { name: string; avatar: string | null }
      >();

      if (agentActorIds.length > 0) {
        const agentRows = await ctx.db
          .select({
            id: agentProfiles.id,
            name: agentProfiles.name,
            avatar: agentProfiles.avatar,
          })
          .from(agentProfiles)
          .where(inArray(agentProfiles.id, agentActorIds));

        for (const row of agentRows) {
          agentActorMap.set(row.id, {
            name: row.name,
            avatar: row.avatar ?? null,
          });
        }
      }

      // Enrich items with actor info
      const enrichedItems = items.map((event) => {
        let actor:
          | { type: "member"; displayName: string; image: string | null }
          | { type: "agent"; name: string; avatar: string | null }
          | { type: "unknown" };

        if (event.actorType === "member") {
          const memberInfo = memberActorMap.get(event.actorId);
          actor = memberInfo
            ? { type: "member", displayName: memberInfo.displayName, image: memberInfo.image }
            : { type: "unknown" };
        } else if (event.actorType === "agent") {
          const agentInfo = agentActorMap.get(event.actorId);
          actor = agentInfo
            ? { type: "agent", name: agentInfo.name, avatar: agentInfo.avatar }
            : { type: "unknown" };
        } else {
          actor = { type: "unknown" };
        }

        return {
          id: event.id,
          actorId: event.actorId,
          actorType: event.actorType,
          action: event.action,
          targetType: event.targetType,
          targetId: event.targetId,
          metadata: event.metadata,
          createdAt: event.createdAt,
          actor,
        };
      });

      const nextCursor = hasMore
        ? items[items.length - 1]!.createdAt.toISOString()
        : null;

      return {
        items: enrichedItems,
        nextCursor,
      };
    }),
});
