import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  publicProcedure,
  communityProcedure,
} from "@/server/api/trpc";
import {
  communities,
  communityMemberships,
  spaces,
  spaceMemberships,
  memberProfiles,
  notifications,
  user,
} from "@/server/db/schema";
import {
  canJoinDirectly,
  roomSlugFromName,
} from "@/server/communities/room-access";
import { roomAccessRequestRecipients } from "@/server/communities/room-notifications";
import { getOrCreateRoomConversation } from "@/server/communities/room-conversation";
import { getAvatarUrl } from "@/lib/avatar";

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
      const roomIds = rooms.map((r) => r.id);
      // Two scoped lookups over the listed rooms: the caller's membership, and
      // each room's active-member count. A grouped count (not an inline
      // correlated subquery) — Drizzle emits the interpolated outer column
      // unqualified inside a sql`` subquery, which silently mis-correlates.
      const [mine, counts] = roomIds.length
        ? await Promise.all([
            ctx.db
              .select({
                spaceId: spaceMemberships.spaceId,
                status: spaceMemberships.status,
              })
              .from(spaceMemberships)
              .where(
                and(
                  eq(spaceMemberships.userId, ctx.session.user.id),
                  inArray(spaceMemberships.spaceId, roomIds),
                ),
              ),
            ctx.db
              .select({
                spaceId: spaceMemberships.spaceId,
                count: sql<number>`COUNT(*)::int`,
              })
              .from(spaceMemberships)
              .where(
                and(
                  inArray(spaceMemberships.spaceId, roomIds),
                  eq(spaceMemberships.status, "active"),
                ),
              )
              .groupBy(spaceMemberships.spaceId),
          ])
        : [[], []];
      const byId = new Map(mine.map((mem) => [mem.spaceId, mem.status]));
      const countById = new Map(counts.map((c) => [c.spaceId, c.count]));
      return rooms.map((r) => ({
        ...r,
        membership: byId.get(r.id) ?? null,
        memberCount: countById.get(r.id) ?? 0,
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
        .values({
          spaceId: room.id,
          userId: ctx.session.user.id,
          status: "active",
        })
        .onConflictDoNothing();
      return { success: true };
    }),

  /** Request access to a PRIVATE room (creates a pending_request membership). */
  requestAccess: communityProcedure
    .input(z.object({ slug: z.string(), spaceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.communityRole) throw new TRPCError({ code: "FORBIDDEN" });
      const [room] = await ctx.db
        .select({
          id: spaces.id,
          visibility: spaces.visibility,
          name: spaces.name,
          slug: spaces.slug,
        })
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
      if (room.visibility !== "private") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "This room is public — join it directly.",
        });
      }
      const inserted = await ctx.db
        .insert(spaceMemberships)
        .values({
          spaceId: room.id,
          userId: ctx.session.user.id,
          status: "pending_request",
        })
        .onConflictDoNothing()
        .returning({ id: spaceMemberships.id });

      // Only notify on a genuinely new request (a duplicate re-request inserts
      // nothing and must not re-ping admins).
      if (inserted.length > 0) {
        const admins = await ctx.db
          .select({ userId: communityMemberships.userId })
          .from(communityMemberships)
          .where(
            and(
              eq(communityMemberships.communityId, ctx.community.id),
              eq(communityMemberships.status, "active"),
              sql`${communityMemberships.role} IN ('owner', 'admin')`,
            ),
          );
        const recipients = roomAccessRequestRecipients(
          admins.map((a) => a.userId),
          ctx.session.user.id,
        );
        if (recipients.length > 0) {
          await ctx.db.insert(notifications).values(
            recipients.map((adminId) => ({
              userId: adminId,
              type: "room_access_request",
              title: "New room access request",
              content: `A member requested access to ${room.name ?? "a room"} in ${ctx.community.name}.`,
              metadata: {
                reviewPath: `/communities/${input.slug}/spaces/${room.slug}`,
                linkLabel: "Review request",
                spaceId: room.id,
              },
              communityId: ctx.community.id,
            })),
          );
        }
      }
      return { success: true };
    }),

  /** Approve a pending member (owner/admin). */
  approveMember: communityProcedure
    .input(
      z.object({ slug: z.string(), spaceId: z.string(), userId: z.string() }),
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.communityRole !== "owner" && ctx.communityRole !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN" });
      }
      // Confirm the room belongs to this community before mutating membership.
      const [room] = await ctx.db
        .select({ id: spaces.id, name: spaces.name, slug: spaces.slug })
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
      // Only flip a genuinely pending request → active. Gating on the status
      // keeps a no-op re-approve of an already-active member from firing a
      // duplicate "Access approved" notification (mirrors denyMember's guard).
      const updated = await ctx.db
        .update(spaceMemberships)
        .set({ status: "active" })
        .where(
          and(
            eq(spaceMemberships.spaceId, input.spaceId),
            eq(spaceMemberships.userId, input.userId),
            eq(spaceMemberships.status, "pending_request"),
          ),
        )
        .returning({ id: spaceMemberships.id });

      if (updated.length > 0) {
        await ctx.db.insert(notifications).values({
          userId: input.userId,
          type: "room_access_approved",
          title: "Access approved",
          content: `You're now a member of ${room.name ?? "a room"} in ${ctx.community.name}.`,
          metadata: {
            reviewPath: `/communities/${input.slug}/spaces/${room.slug}`,
            linkLabel: "Open room",
            spaceId: input.spaceId,
          },
          communityId: ctx.community.id,
        });
      }
      return { success: true };
    }),

  /** Deny (remove) a pending access request (owner/admin). Never touches active members. */
  denyMember: communityProcedure
    .input(
      z.object({ slug: z.string(), spaceId: z.string(), userId: z.string() }),
    )
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
      // Only a still-pending request is removable here — guard against deleting
      // an active member by racing status.
      await ctx.db
        .delete(spaceMemberships)
        .where(
          and(
            eq(spaceMemberships.spaceId, input.spaceId),
            eq(spaceMemberships.userId, input.userId),
            eq(spaceMemberships.status, "pending_request"),
          ),
        );
      return { success: true };
    }),

  /** Public-within-community room lookup: meta + caller's membership + conversationId when active. */
  getRoom: communityProcedure
    .input(z.object({ slug: z.string(), spaceSlug: z.string() }))
    .query(async ({ ctx, input }) => {
      const [room] = await ctx.db
        .select({
          id: spaces.id,
          name: spaces.name,
          purpose: spaces.purpose,
          visibility: spaces.visibility,
          slug: spaces.slug,
        })
        .from(spaces)
        .where(
          and(
            eq(spaces.communityId, ctx.community.id),
            eq(spaces.kind, "room"),
            eq(spaces.slug, input.spaceSlug),
            isNull(spaces.archivedAt),
          ),
        )
        .limit(1);
      if (!room) throw new TRPCError({ code: "NOT_FOUND" });
      const [mine] = await ctx.db
        .select({ status: spaceMemberships.status })
        .from(spaceMemberships)
        .where(
          and(
            eq(spaceMemberships.spaceId, room.id),
            eq(spaceMemberships.userId, ctx.session.user.id),
          ),
        )
        .limit(1);
      let conversationId: string | null = null;
      if (mine?.status === "active") {
        conversationId = await getOrCreateRoomConversation(ctx.db, room.id);
      }

      // Header enrichments: member count, viewer admin flag, avatar stack.
      const [countRow] = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(spaceMemberships)
        .where(
          and(
            eq(spaceMemberships.spaceId, room.id),
            eq(spaceMemberships.status, "active"),
          ),
        );
      const memberCount = Number(countRow?.count ?? 0);

      const viewerIsAdmin =
        ctx.communityRole === "owner" || ctx.communityRole === "admin";

      const avatarRows = await ctx.db
        .select({
          userId: spaceMemberships.userId,
          displayName: memberProfiles.displayName,
          email: user.email,
          image: user.image,
        })
        .from(spaceMemberships)
        .leftJoin(
          memberProfiles,
          eq(memberProfiles.userId, spaceMemberships.userId),
        )
        .leftJoin(user, eq(user.id, spaceMemberships.userId))
        .where(
          and(
            eq(spaceMemberships.spaceId, room.id),
            eq(spaceMemberships.status, "active"),
          ),
        )
        .limit(5);
      const memberAvatars = avatarRows.map((r) => ({
        userId: r.userId,
        displayName: r.displayName ?? null,
        avatarUrl: getAvatarUrl(r.email, r.image),
      }));

      return {
        ...room,
        membership: mine?.status ?? null,
        conversationId,
        memberCount,
        viewerIsAdmin,
        memberAvatars,
      };
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
      const rows = await ctx.db
        .select({
          userId: spaceMemberships.userId,
          role: spaceMemberships.role,
          status: spaceMemberships.status,
          displayName: memberProfiles.displayName,
          email: user.email,
          image: user.image,
        })
        .from(spaceMemberships)
        .leftJoin(
          memberProfiles,
          eq(memberProfiles.userId, spaceMemberships.userId),
        )
        .leftJoin(user, eq(user.id, spaceMemberships.userId))
        .where(eq(spaceMemberships.spaceId, input.spaceId))
        // pending_request first, then active — approval queue visible at top.
        .orderBy(
          sql`CASE WHEN ${spaceMemberships.status} = 'pending_request' THEN 0 ELSE 1 END`,
          asc(spaceMemberships.userId),
        );
      return rows.map((r) => ({
        userId: r.userId,
        role: r.role,
        status: r.status,
        displayName: r.displayName ?? null,
        avatarUrl: getAvatarUrl(r.email, r.image),
      }));
    }),

  /** Add a community member to a room (owner/admin). Upserts to active status. */
  addMember: communityProcedure
    .input(
      z.object({ slug: z.string(), spaceId: z.string(), userId: z.string() }),
    )
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
        .insert(spaceMemberships)
        .values({ spaceId: room.id, userId: input.userId, status: "active" })
        .onConflictDoUpdate({
          target: [spaceMemberships.spaceId, spaceMemberships.userId],
          set: { status: "active" },
        });
      return { success: true };
    }),
});
