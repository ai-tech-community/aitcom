import { z } from "zod";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  publicProcedure,
  communityProcedure,
} from "@/server/api/trpc";
import { communities, spaces, spaceMemberships } from "@/server/db/schema";
import { canJoinDirectly, roomSlugFromName } from "@/server/communities/room-access";
import { getOrCreateRoomConversation } from "@/server/communities/room-conversation";

/** Enabled spaces for the public nav, position-ordered. */
export const spacesRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx, input }) => {
      const community = await ctx.db.query.communities.findFirst({
        where: and(
          eq(communities.slug, input.slug),
          isNull(communities.deletedAt),
        ),
      });
      if (!community) throw new TRPCError({ code: "NOT_FOUND" });

      return ctx.db
        .select({
          id: spaces.id,
          kind: spaces.kind,
          builtinSurface: spaces.builtinSurface,
          name: spaces.name,
          slug: spaces.slug,
          position: spaces.position,
        })
        .from(spaces)
        .where(
          and(eq(spaces.communityId, community.id), isNull(spaces.archivedAt)),
        )
        .orderBy(asc(spaces.position));
    }),

  /** All spaces incl. disabled, for the admin Compose page. */
  listForAdmin: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const rows = await ctx.db
        .select({
          id: spaces.id,
          kind: spaces.kind,
          builtinSurface: spaces.builtinSurface,
          name: spaces.name,
          slug: spaces.slug,
          position: spaces.position,
          archivedAt: spaces.archivedAt,
        })
        .from(spaces)
        .where(eq(spaces.communityId, ctx.community.id))
        .orderBy(asc(spaces.position));
      return rows.map((r) => ({ ...r, enabled: r.archivedAt === null }));
    }),

  /** Persist a new ordering: ids in display order → position = index. */
  reorder: communityProcedure
    .input(z.object({ slug: z.string(), orderedIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      await ctx.db.transaction(async (tx) => {
        await Promise.all(
          input.orderedIds.map((id, position) =>
            tx
              .update(spaces)
              .set({ position })
              .where(
                and(
                  eq(spaces.id, id),
                  eq(spaces.communityId, ctx.community.id),
                ),
              ),
          ),
        );
      });
      return { success: true };
    }),

  /** Enable/disable a space (disable = archive; builtins only in Plan 1). */
  setEnabled: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        spaceId: z.string(),
        enabled: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [updated] = await ctx.db
        .update(spaces)
        .set({ archivedAt: input.enabled ? null : new Date() })
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
          ),
        )
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  /** Set or clear the display-name override (null/empty resets to default). */
  rename: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        spaceId: z.string(),
        name: z.string().max(60).nullable(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const trimmed = input.name?.trim();
      const [updated] = await ctx.db
        .update(spaces)
        .set({ name: trimmed && trimmed.length > 0 ? trimmed : null })
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
          ),
        )
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  /** Create a room (owner/admin). Auto-creates its space conversation and adds the creator as a member. */
  createRoom: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        name: z.string().min(1).max(60),
        purpose: z.string().max(500).optional(),
        visibility: z.enum(["public", "private"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [maxPos] = await ctx.db
        .select({ position: spaces.position })
        .from(spaces)
        .where(eq(spaces.communityId, ctx.community.id))
        .orderBy(desc(spaces.position))
        .limit(1);
      const room = await ctx.db.transaction(async (tx) => {
        const id = crypto.randomUUID();
        const [created] = await tx
          .insert(spaces)
          .values({
            id,
            communityId: ctx.community.id,
            kind: "room",
            name: input.name,
            purpose: input.purpose,
            visibility: input.visibility,
            slug: roomSlugFromName(input.name, id.slice(0, 6)),
            position: (maxPos?.position ?? 0) + 1,
            createdBy: ctx.session.user.id,
          })
          .returning();
        await tx.insert(spaceMemberships).values({
          spaceId: created!.id,
          userId: ctx.session.user.id,
          role: "moderator",
          status: "active",
        });
        return created!;
      });
      // Eagerly create the conversation so the first open is instant.
      await getOrCreateRoomConversation(ctx.db, room.id);
      return room;
    }),

  /** Update a room's name/purpose/visibility (owner/admin). */
  updateRoom: communityProcedure
    .input(
      z.object({
        slug: z.string(),
        spaceId: z.string(),
        name: z.string().min(1).max(60),
        purpose: z.string().max(500).optional(),
        visibility: z.enum(["public", "private"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [updated] = await ctx.db
        .update(spaces)
        .set({
          name: input.name,
          purpose: input.purpose,
          visibility: input.visibility,
        })
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
            eq(spaces.kind, "room"),
          ),
        )
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return updated;
    }),

  /** Archive a room (owner/admin). */
  archiveRoom: communityProcedure
    .input(z.object({ slug: z.string(), spaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      const [updated] = await ctx.db
        .update(spaces)
        .set({ archivedAt: new Date() })
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
            eq(spaces.kind, "room"),
          ),
        )
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
      return { success: true };
    }),

  /** Rooms the caller can see: active rooms in the community + the caller's membership status for each. */
  listRooms: communityProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ ctx }) => {
      const rooms = await ctx.db
        .select({
          id: spaces.id,
          name: spaces.name,
          purpose: spaces.purpose,
          slug: spaces.slug,
          visibility: spaces.visibility,
        })
        .from(spaces)
        .where(
          and(
            eq(spaces.communityId, ctx.community.id),
            eq(spaces.kind, "room"),
            isNull(spaces.archivedAt),
          ),
        )
        .orderBy(asc(spaces.position));
      const mine = await ctx.db
        .select({
          spaceId: spaceMemberships.spaceId,
          status: spaceMemberships.status,
        })
        .from(spaceMemberships)
        .where(eq(spaceMemberships.userId, ctx.session.user.id));
      const byId = new Map(mine.map((m) => [m.spaceId, m.status]));
      return rooms.map((r) => ({
        ...r,
        membership: byId.get(r.id) ?? null,
      }));
    }),

  /** Join a PUBLIC room instantly (active community member). */
  joinRoom: communityProcedure
    .input(z.object({ slug: z.string(), spaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole) throw new TRPCError({ code: "FORBIDDEN" });
      const [room] = await ctx.db
        .select({ id: spaces.id, visibility: spaces.visibility })
        .from(spaces)
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
            eq(spaces.kind, "room"),
            isNull(spaces.archivedAt),
          ),
        )
        .limit(1);
      if (!room) throw new TRPCError({ code: "NOT_FOUND" });
      if (!canJoinDirectly(room.visibility)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This room is private — request access instead.",
        });
      }
      await ctx.db
        .insert(spaceMemberships)
        .values({ spaceId: room.id, userId: ctx.session.user.id, status: "active" })
        .onConflictDoNothing();
      return { success: true };
    }),

  /** Request access to a PRIVATE room (creates a pending_request membership). */
  requestAccess: communityProcedure
    .input(z.object({ slug: z.string(), spaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole) throw new TRPCError({ code: "FORBIDDEN" });
      const [room] = await ctx.db
        .select({ id: spaces.id })
        .from(spaces)
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
            eq(spaces.kind, "room"),
            isNull(spaces.archivedAt),
          ),
        )
        .limit(1);
      if (!room) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db
        .insert(spaceMemberships)
        .values({
          spaceId: room.id,
          userId: ctx.session.user.id,
          status: "pending_request",
        })
        .onConflictDoNothing();
      return { success: true };
    }),

  /** Approve a pending member (owner/admin). */
  approveMember: communityProcedure
    .input(z.object({ slug: z.string(), spaceId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Confirm the room belongs to this community before mutating membership.
      const [room] = await ctx.db
        .select({ id: spaces.id })
        .from(spaces)
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
            eq(spaces.kind, "room"),
          ),
        )
        .limit(1);
      if (!room) throw new TRPCError({ code: "NOT_FOUND" });
      await ctx.db
        .update(spaceMemberships)
        .set({ status: "active" })
        .where(
          and(
            eq(spaceMemberships.spaceId, input.spaceId),
            eq(spaceMemberships.userId, input.userId),
          ),
        );
      return { success: true };
    }),

  /** List a room's members (owner/admin) — for Plan 2b approval UI. */
  listRoomMembers: communityProcedure
    .input(z.object({ slug: z.string(), spaceId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Confirm the room belongs to this community before reading memberships.
      const [room] = await ctx.db
        .select({ id: spaces.id })
        .from(spaces)
        .where(
          and(
            eq(spaces.id, input.spaceId),
            eq(spaces.communityId, ctx.community.id),
            eq(spaces.kind, "room"),
          ),
        )
        .limit(1);
      if (!room) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db
        .select({
          userId: spaceMemberships.userId,
          role: spaceMemberships.role,
          status: spaceMemberships.status,
        })
        .from(spaceMemberships)
        .where(eq(spaceMemberships.spaceId, input.spaceId));
    }),
});
