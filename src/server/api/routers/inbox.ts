import { z } from "zod";
import { eq, and, desc, lt, sql, ne, or, ilike, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import {
  createTRPCRouter,
  protectedProcedure,
  agentProcedure,
  requireScope,
  requireOwner,
} from "@/server/api/trpc";
import {
  conversations,
  conversationParticipants,
  messages,
  agentProfiles,
  memberProfiles,
  spaceMemberships,
  spaces,
  communities,
  user,
} from "@/server/db/schema";
import { isActiveMember } from "@/server/communities/room-access";
import { countRoomUnread } from "@/server/communities/room-unread";
import { logActivity } from "@/server/agent/activity";
import { publishInboxEvent } from "@/server/inbox/publish";
import { after } from "next/server";
import { dispatchEventImmediately } from "@/server/agent/dispatch-immediate";
import { resolveProducerTrust } from "@/lib/chat/trust";
import type { UiResource } from "@/lib/chat/types";
import { runUiTool } from "@/server/inbox/ui-tools";

const uiResourceSchema = z.object({
  uri: z.string().startsWith("ui://"),
  mimeType: z.literal("text/html;profile=mcp-app"),
  encoding: z.enum(["text", "blob"]),
  content: z.string().max(200_000),
  csp: z
    .object({
      connectDomains: z.array(z.string()).optional(),
      resourceDomains: z.array(z.string()).optional(),
      frameDomains: z.array(z.string()).optional(),
      baseUriDomains: z.array(z.string()).optional(),
    })
    .optional(),
});

type ConversationDb = typeof import("@/server/db").db;

/**
 * For a space conversation, the caller must be an active member of the room.
 * Returns the active member user-ids (for realtime fan-out) or throws FORBIDDEN.
 */
async function requireSpaceConversationAccess(
  db: ConversationDb,
  conversationSpaceId: string,
  userId: string,
): Promise<string[]> {
  const members = await db
    .select({
      userId: spaceMemberships.userId,
      status: spaceMemberships.status,
    })
    .from(spaceMemberships)
    .where(
      and(
        eq(spaceMemberships.spaceId, conversationSpaceId),
        eq(spaceMemberships.status, "active"),
      ),
    );
  const mine = members.find((m) => m.userId === userId);
  if (!isActiveMember(mine ? { status: "active" } : null)) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return members.map((m) => m.userId);
}

// ── Router ───────────────────────────────────────────────────────────────────

export const inboxRouter = createTRPCRouter({
  // ═══════════════════════════════════════════════════════════════════════════
  // HUMAN-FACING PROCEDURES (protectedProcedure)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * listConversations - paginated list of the user's conversations.
   * Sorted by pinned first, then updatedAt desc. Includes last message,
   * other participants, agent info, and unread count.
   */
  listConversations: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        cursor: z.string().nullable().default(null),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Each row carries enough to sort/paginate + resolve display. DM/agent rows
      // come from conversationParticipants (the user IS a participant). Space
      // (room) rows have NO participant rows — they're authorized via an ACTIVE
      // spaceMembership, so we fetch them in a parallel query and merge.
      type ConvRow = {
        conversationId: string;
        lastReadAt: Date | null;
        isPinned: boolean;
        convType: string;
        convUpdatedAt: Date;
        // Space-only metadata (null for DM/agent rows).
        spaceId: string | null;
        roomName: string | null;
        roomSlug: string | null;
        roomVisibility: "public" | "private" | null;
        communitySlug: string | null;
        communityName: string | null;
        communityLogoUrl: string | null;
        memberCount: number;
      };

      // ── DM / agent conversations (caller is a participant) ──────────────
      const participantRowsRaw = await ctx.db
        .select({
          conversationId: conversationParticipants.conversationId,
          lastReadAt: conversationParticipants.lastReadAt,
          isPinned: conversationParticipants.isPinned,
          convType: conversations.type,
          convUpdatedAt: conversations.updatedAt,
        })
        .from(conversationParticipants)
        .innerJoin(
          conversations,
          eq(conversationParticipants.conversationId, conversations.id),
        )
        .where(
          and(
            eq(conversationParticipants.userId, userId),
            ne(conversations.type, "space"),
          ),
        );

      const dmRows: ConvRow[] = participantRowsRaw.map((r) => ({
        ...r,
        spaceId: null,
        roomName: null,
        roomSlug: null,
        roomVisibility: null,
        communitySlug: null,
        communityName: null,
        communityLogoUrl: null,
        memberCount: 0,
      }));

      // ── Space (room) conversations the caller is an ACTIVE member of ────
      // Gate on spaceMemberships.status === "active". No participant rows exist,
      // so there is no lastReadAt — unread is computed from all messages below.
      const roomRowsRaw = await ctx.db
        .select({
          conversationId: conversations.id,
          convType: conversations.type,
          convUpdatedAt: conversations.updatedAt,
          spaceId: conversations.spaceId,
          roomName: spaces.name,
          roomSlug: spaces.slug,
          roomVisibility: spaces.visibility,
          communitySlug: communities.slug,
          communityName: communities.name,
          communityLogoUrl: communities.logoUrl,
          lastReadAt: spaceMemberships.lastReadAt,
        })
        .from(conversations)
        .innerJoin(spaces, eq(spaces.id, conversations.spaceId))
        .innerJoin(communities, eq(communities.id, spaces.communityId))
        .innerJoin(
          spaceMemberships,
          eq(spaceMemberships.spaceId, conversations.spaceId),
        )
        .where(
          and(
            eq(conversations.type, "space"),
            eq(spaceMemberships.userId, userId),
            eq(spaceMemberships.status, "active"),
          ),
        );

      // Active-member counts per room via a grouped query, mapped by spaceId. An
      // inline correlated subquery mis-correlates here: Drizzle emits the
      // interpolated outer column unqualified inside sql``, so `space_id = "id"`
      // resolves to the membership table's own column and the count is wrong.
      const roomSpaceIds = roomRowsRaw
        .map((r) => r.spaceId)
        .filter((id): id is string => id !== null);
      const roomCounts = roomSpaceIds.length
        ? await ctx.db
            .select({
              spaceId: spaceMemberships.spaceId,
              count: sql<number>`COUNT(*)::int`,
            })
            .from(spaceMemberships)
            .where(
              and(
                inArray(spaceMemberships.spaceId, roomSpaceIds),
                eq(spaceMemberships.status, "active"),
              ),
            )
            .groupBy(spaceMemberships.spaceId)
        : [];
      const roomCountBySpace = new Map(
        roomCounts.map((c) => [c.spaceId, c.count]),
      );

      const roomRows: ConvRow[] = roomRowsRaw.map((r) => ({
        conversationId: r.conversationId,
        lastReadAt: r.lastReadAt,
        isPinned: false,
        convType: r.convType,
        convUpdatedAt: r.convUpdatedAt,
        spaceId: r.spaceId,
        roomName: r.roomName,
        roomSlug: r.roomSlug,
        roomVisibility: r.roomVisibility,
        communitySlug: r.communitySlug,
        communityName: r.communityName,
        communityLogoUrl: r.communityLogoUrl,
        memberCount: r.spaceId ? (roomCountBySpace.get(r.spaceId) ?? 0) : 0,
      }));

      const participantRows: ConvRow[] = [...dmRows, ...roomRows];

      if (participantRows.length === 0) {
        return { conversations: [], nextCursor: null };
      }

      // Sort: pinned first, then updatedAt desc
      participantRows.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.convUpdatedAt.getTime() - a.convUpdatedAt.getTime();
      });

      // Apply cursor-based pagination (cursor = updatedAt ISO string)
      let filtered = participantRows;
      if (input.cursor) {
        const cursorDate = new Date(input.cursor);
        filtered = participantRows.filter(
          (r) => r.convUpdatedAt.getTime() < cursorDate.getTime(),
        );
      }

      const page = filtered.slice(0, input.limit + 1);
      const hasMore = page.length > input.limit;
      const items = hasMore ? page.slice(0, input.limit) : page;
      const nextCursor = hasMore
        ? items[items.length - 1]!.convUpdatedAt.toISOString()
        : null;

      // Build full conversation objects
      const result = await Promise.all(
        items.map(async (row) => {
          // Last message
          const [lastMessage] = await ctx.db
            .select({
              content: messages.content,
              senderType: messages.senderType,
              senderId: messages.senderId,
              createdAt: messages.createdAt,
            })
            .from(messages)
            .where(eq(messages.conversationId, row.conversationId))
            .orderBy(desc(messages.createdAt))
            .limit(1);

          const isRoom = row.convType === "space";

          // Other participants — DM/agent only. Space (room) conversations have
          // no participant rows; their display comes from the room itself.
          const otherParticipantsRaw = isRoom
            ? []
            : await ctx.db
                .select({
                  userId: conversationParticipants.userId,
                  displayName: memberProfiles.displayName,
                  name: user.name,
                  image: user.image,
                })
                .from(conversationParticipants)
                .leftJoin(
                  memberProfiles,
                  eq(memberProfiles.userId, conversationParticipants.userId),
                )
                .leftJoin(user, eq(user.id, conversationParticipants.userId))
                .where(
                  and(
                    eq(
                      conversationParticipants.conversationId,
                      row.conversationId,
                    ),
                    ne(conversationParticipants.userId, userId),
                  ),
                );

          const otherParticipants = otherParticipantsRaw.map((p) => ({
            userId: p.userId,
            displayName: p.displayName ?? p.name ?? "Unknown",
            image: p.image,
          }));

          // Agent info (only for agent conversations)
          let agentInfo = null;
          if (row.convType === "agent") {
            const [agent] = await ctx.db
              .select({
                id: agentProfiles.id,
                name: agentProfiles.name,
                avatar: agentProfiles.avatar,
                lastActiveAt: agentProfiles.lastActiveAt,
              })
              .from(agentProfiles)
              .where(eq(agentProfiles.ownerId, userId))
              .limit(1);
            agentInfo = agent ?? null;
          }

          // Unread count: messages after lastReadAt not sent by the current user as "human"
          let unreadCount = 0;
          if (isRoom) {
            unreadCount = await countRoomUnread(
              ctx.db,
              row.conversationId,
              userId,
              row.lastReadAt,
            );
          } else if (row.lastReadAt) {
            const [unreadRow] = await ctx.db
              .select({ count: sql<number>`count(*)::int` })
              .from(messages)
              .where(
                and(
                  eq(messages.conversationId, row.conversationId),
                  sql`${messages.createdAt} > ${row.lastReadAt}`,
                  or(
                    ne(messages.senderId, userId),
                    ne(messages.senderType, "human"),
                  ),
                ),
              );
            unreadCount = unreadRow?.count ?? 0;
          } else {
            // Never read - all messages not sent by the user as "human" are unread
            const [unreadRow] = await ctx.db
              .select({ count: sql<number>`count(*)::int` })
              .from(messages)
              .where(
                and(
                  eq(messages.conversationId, row.conversationId),
                  or(
                    ne(messages.senderId, userId),
                    ne(messages.senderType, "human"),
                  ),
                ),
              );
            unreadCount = unreadRow?.count ?? 0;
          }

          return {
            id: row.conversationId,
            type: row.convType,
            updatedAt: row.convUpdatedAt.toISOString(),
            isPinned: row.isPinned,
            lastMessage: lastMessage ?? null,
            participants: otherParticipants,
            agentInfo,
            unreadCount,
            // Room (space) fields — defaulted for DM/agent rows so the return
            // type is uniform. The UI keys off `isRoom`.
            isRoom,
            title: isRoom ? (row.roomName ?? "Room") : null,
            roomSlug: isRoom ? row.roomSlug : null,
            spaceId: isRoom ? row.spaceId : null,
            roomVisibility: isRoom ? row.roomVisibility : null,
            communitySlug: isRoom ? row.communitySlug : null,
            communityName: isRoom ? row.communityName : null,
            communityLogoUrl: isRoom ? row.communityLogoUrl : null,
            memberCount: isRoom ? row.memberCount : 0,
          };
        }),
      );

      return { conversations: result, nextCursor };
    }),

  /**
   * getMessages - paginated messages for a conversation.
   * Verifies user is a participant. Returns chronological order.
   * Fire-and-forget updates lastReadAt.
   */
  getMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        cursor: z.string().nullable().default(null),
        limit: z.number().min(1).max(100).default(50),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Load the conversation to branch on its type. Space conversations have
      // no participant rows — they authorize via active space membership.
      const [conv] = await ctx.db
        .select({
          id: conversations.id,
          type: conversations.type,
          spaceId: conversations.spaceId,
        })
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .limit(1);
      if (!conv) throw new TRPCError({ code: "NOT_FOUND" });
      if (conv.type === "space") {
        if (!conv.spaceId) throw new TRPCError({ code: "NOT_FOUND" });
        await requireSpaceConversationAccess(ctx.db, conv.spaceId, userId);
      } else {
        // Verify user is a participant
        const [participant] = await ctx.db
          .select()
          .from(conversationParticipants)
          .where(
            and(
              eq(conversationParticipants.conversationId, input.conversationId),
              eq(conversationParticipants.userId, userId),
            ),
          )
          .limit(1);

        if (!participant) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You are not a participant in this conversation",
          });
        }
      }

      const conditions = [eq(messages.conversationId, input.conversationId)];

      if (input.cursor) {
        conditions.push(lt(messages.createdAt, new Date(input.cursor)));
      }

      const rows = await ctx.db
        .select()
        .from(messages)
        .where(and(...conditions))
        .orderBy(desc(messages.createdAt))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;

      const nextCursor = hasMore
        ? items[items.length - 1]!.createdAt.toISOString()
        : null;

      // Reverse to chronological order
      items.reverse();

      // Fire-and-forget: update lastReadAt. DM/agent conversations track it on
      // conversationParticipants; space (room) conversations track it on the
      // caller's spaceMembership (rooms have no participant rows).
      if (conv.type === "space" && conv.spaceId) {
        ctx.db
          .update(spaceMemberships)
          .set({ lastReadAt: new Date() })
          .where(
            and(
              eq(spaceMemberships.spaceId, conv.spaceId),
              eq(spaceMemberships.userId, userId),
            ),
          )
          .catch((err: unknown) => {
            console.error("[inbox] space lastReadAt update failed:", err);
          });
      } else {
        ctx.db
          .update(conversationParticipants)
          .set({ lastReadAt: new Date() })
          .where(
            and(
              eq(conversationParticipants.conversationId, input.conversationId),
              eq(conversationParticipants.userId, userId),
            ),
          )
          .catch((err: unknown) => {
            console.error("[inbox] update failed:", err);
          });
      }

      return { messages: items, nextCursor, hasMore };
    }),

  /**
   * sendMessage - human sends a message in a conversation.
   * Verifies participant. Updates conversation.updatedAt.
   * Fire-and-forget updates sender's lastReadAt.
   */
  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        content: z.string().min(1).max(10000),
        uiResource: uiResourceSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      // Load the conversation up front so we can branch on its type. Space
      // conversations have no participant rows — they authorize via active
      // space membership and fan out to every active member.
      const [convRow] = await ctx.db
        .select({
          type: conversations.type,
          spaceId: conversations.spaceId,
        })
        .from(conversations)
        .where(eq(conversations.id, input.conversationId))
        .limit(1);
      const conversationType = convRow?.type;

      // ── Space (room) conversations ──────────────────────────────────────
      if (convRow?.type === "space") {
        if (!convRow.spaceId) throw new TRPCError({ code: "NOT_FOUND" });
        const memberIds = await requireSpaceConversationAccess(
          ctx.db,
          convRow.spaceId,
          userId,
        );

        // Insert message (same shape as the dm/agent path below)
        const [message] = await ctx.db
          .insert(messages)
          .values({
            conversationId: input.conversationId,
            senderId: userId,
            senderType: "human",
            content: input.content,
            uiResource: input.uiResource as UiResource | undefined,
            uiProducerTrust: input.uiResource
              ? resolveProducerTrust({ kind: "member" })
              : undefined,
          })
          .returning();

        // Update conversation.updatedAt
        await ctx.db
          .update(conversations)
          .set({ updatedAt: new Date() })
          .where(eq(conversations.id, input.conversationId));

        // Fan out realtime to every active member except the sender, plus the
        // sender's own other tabs.
        for (const memberId of memberIds) {
          if (memberId === userId) continue;
          void publishInboxEvent(memberId, {
            kind: "message",
            conversationId: input.conversationId,
            message,
          });
        }
        void publishInboxEvent(userId, {
          kind: "message",
          conversationId: input.conversationId,
          message,
        });

        return message!;
      }

      // ── DM / agent conversations (unchanged) ────────────────────────────
      // Verify user is a participant
      const [participant] = await ctx.db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, userId),
          ),
        )
        .limit(1);

      if (!participant) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You are not a participant in this conversation",
        });
      }

      // Find the other participant (recipient) for event isolation
      const [recipient] = await ctx.db
        .select({ userId: conversationParticipants.userId })
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            sql`${conversationParticipants.userId} != ${userId}`,
          ),
        )
        .limit(1);

      // Insert message
      const [message] = await ctx.db
        .insert(messages)
        .values({
          conversationId: input.conversationId,
          senderId: userId,
          senderType: "human",
          content: input.content,
          uiResource: input.uiResource as UiResource | undefined,
          uiProducerTrust: input.uiResource
            ? resolveProducerTrust({ kind: "member" })
            : undefined,
        })
        .returning();

      // Update conversation.updatedAt
      await ctx.db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, input.conversationId));

      // Log activity for webhook dispatch, then wake the recipient agent in
      // realtime (ADR-0025 Tier-2). The cron remains the durable backstop.
      // For agent-type conversations the sole participant is the owner (sender),
      // so use userId as the recipientId to prevent cross-tenant fan-out.
      const webhookRecipientId =
        conversationType === "agent" ? userId : recipient?.userId;
      const activityEvent = await logActivity(ctx.db, {
        actorId: userId,
        actorType: "member",
        action: "message.sent",
        targetType: "conversations",
        targetId: input.conversationId,
        recipientId: webhookRecipientId,
      });
      try {
        after(async () => {
          try {
            await dispatchEventImmediately(ctx.db, activityEvent);
          } catch (err) {
            console.error("[inbox] immediate dispatch failed:", err);
          }
        });
      } catch {
        // No request scope (e.g. tests/scripts) — the cron backstop will deliver.
      }

      // Publish real-time event to recipient and sender (other tabs)
      if (recipient?.userId) {
        void publishInboxEvent(recipient.userId, {
          kind: "message",
          conversationId: input.conversationId,
          message,
        });
      }
      void publishInboxEvent(userId, {
        kind: "message",
        conversationId: input.conversationId,
        message,
      });

      // Fire-and-forget: update sender's lastReadAt
      ctx.db
        .update(conversationParticipants)
        .set({ lastReadAt: new Date() })
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, userId),
          ),
        )
        .catch((err: unknown) => {
          console.error("[inbox] update failed:", err);
        });

      return message!;
    }),

  /**
   * startConversation - start a DM with another user.
   * Cannot message yourself. Returns existing conversation if one exists.
   */
  startConversation: protectedProcedure
    .input(
      z.object({
        recipientId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      if (userId === input.recipientId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot start a conversation with yourself",
        });
      }

      // Verify recipient exists
      const [recipient] = await ctx.db
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, input.recipientId))
        .limit(1);

      if (!recipient) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Recipient not found",
        });
      }

      // Find existing DM between these two users with a single query
      const [existing] = await ctx.db
        .select({ conversationId: conversationParticipants.conversationId })
        .from(conversationParticipants)
        .innerJoin(
          conversations,
          eq(conversations.id, conversationParticipants.conversationId),
        )
        .where(
          and(
            eq(conversations.type, "dm"),
            eq(conversationParticipants.userId, input.recipientId),
            sql`${conversationParticipants.conversationId} IN (
              SELECT ${conversationParticipants.conversationId} FROM ${conversationParticipants} WHERE ${conversationParticipants.userId} = ${userId}
            )`,
          ),
        )
        .limit(1);

      if (existing) {
        return { conversationId: existing.conversationId, created: false };
      }

      // Create new DM conversation (neon-http driver doesn't support transactions)
      const [newConv] = await ctx.db
        .insert(conversations)
        .values({ type: "dm" })
        .returning();

      await ctx.db.insert(conversationParticipants).values([
        { conversationId: newConv!.id, userId },
        { conversationId: newConv!.id, userId: input.recipientId },
      ]);

      return { conversationId: newConv!.id, created: true };
    }),

  /**
   * totalUnreadCount - sum of unread messages across all conversations.
   */
  totalUnreadCount: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    const [result] = await ctx.db
      .select({ total: sql<number>`coalesce(sum(sub.cnt), 0)::int` })
      .from(
        sql`(
          SELECT count(*) as cnt
          FROM ${messages} m
          JOIN ${conversationParticipants} cp
            ON cp.conversation_id = m.conversation_id
          WHERE cp.user_id = ${userId}
            AND (m.sender_id != ${userId} OR m.sender_type != 'human')
            AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at)
          GROUP BY m.conversation_id
        ) sub`,
      );

    return { count: result?.total ?? 0 };
  }),

  /**
   * searchMembers - search for members by displayName or user.name.
   * Excludes current user. Only public profiles.
   */
  searchMembers: protectedProcedure
    .input(
      z.object({
        query: z.string().min(1).max(100),
        limit: z.number().min(1).max(20).default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
      const escaped = input.query.replace(/%/g, "\\%").replace(/_/g, "\\_");
      const pattern = `%${escaped}%`;

      const rows = await ctx.db
        .select({
          userId: memberProfiles.userId,
          displayName: memberProfiles.displayName,
          image: user.image,
        })
        .from(memberProfiles)
        .innerJoin(user, eq(user.id, memberProfiles.userId))
        .where(
          and(
            eq(memberProfiles.isPublic, true),
            ne(memberProfiles.userId, userId),
            or(
              ilike(memberProfiles.displayName, pattern),
              ilike(user.name, pattern),
            ),
          ),
        )
        .limit(input.limit);

      return { members: rows };
    }),

  /**
   * callUiTool - invoke an allow-listed UI tool on behalf of the acting human.
   * Verifies the caller is a participant of the conversation before delegating.
   */
  callUiTool: protectedProcedure
    .input(
      z.object({
        conversationId: z.string(),
        name: z.string(),
        args: z.unknown(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [participant] = await ctx.db
        .select()
        .from(conversationParticipants)
        .where(
          and(
            eq(conversationParticipants.conversationId, input.conversationId),
            eq(conversationParticipants.userId, ctx.session.user.id),
          ),
        )
        .limit(1);
      if (!participant)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not a participant",
        });
      return runUiTool(ctx.db, ctx.session.user.id, input.name, input.args);
    }),

  // ═══════════════════════════════════════════════════════════════════════════
  // AGENT-FACING PROCEDURES (agentProcedure)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * agentCheckInbox - agent fetches recent human messages from their
   * agent conversation.
   */
  agentCheckInbox: agentProcedure.query(async ({ ctx }) => {
    requireScope(ctx.agent.scopes, "read");
    const ownerId = requireOwner(ctx.agent.ownerId);

    const [agentConv] = await ctx.db
      .select({ id: conversations.id })
      .from(conversations)
      .innerJoin(
        conversationParticipants,
        eq(conversationParticipants.conversationId, conversations.id),
      )
      .where(
        and(
          eq(conversations.type, "agent"),
          eq(conversationParticipants.userId, ownerId),
        ),
      )
      .limit(1);

    if (!agentConv) {
      return { messages: [] };
    }

    const rows = await ctx.db
      .select({
        id: messages.id,
        content: messages.content,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, agentConv.id),
          eq(messages.senderType, "human"),
        ),
      )
      .orderBy(desc(messages.createdAt))
      .limit(50);

    // Reverse to chronological order
    rows.reverse();

    return { messages: rows };
  }),

  /**
   * agentSendMessage - agent sends a message to its owner.
   * Creates the agent conversation if it doesn't exist.
   */
  agentSendMessage: agentProcedure
    .input(
      z.object({
        content: z.string().min(1).max(10000),
        metadata: z.record(z.string(), z.unknown()).optional(),
        uiResource: uiResourceSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "contribute");
      const ownerId = requireOwner(ctx.agent.ownerId);

      // Producer trust for any UI resource. Only agents that completed the
      // X/Twitter attestation flow (agentProfiles.isVerified, set by
      // agent-management.submitVerification) earn the relaxed `verified_agent`
      // CSP tier; everyone else stays on the STRICTER `agent` tier. `status`
      // is NOT a verification signal — it is "active" for ~every agent.
      // Only fetch the flag when there is a UI resource whose trust depends on it.
      let agentIsVerified = false;
      if (input.uiResource) {
        const [agentProfile] = await ctx.db
          .select({ isVerified: agentProfiles.isVerified })
          .from(agentProfiles)
          .where(eq(agentProfiles.id, ctx.agent.agentId))
          .limit(1);
        agentIsVerified = agentProfile?.isVerified ?? false;
      }

      // Find existing agent conversation
      const [existingConv] = await ctx.db
        .select({ id: conversations.id })
        .from(conversations)
        .innerJoin(
          conversationParticipants,
          eq(conversationParticipants.conversationId, conversations.id),
        )
        .where(
          and(
            eq(conversations.type, "agent"),
            eq(conversationParticipants.userId, ownerId),
          ),
        )
        .limit(1);

      // Create agent conversation if it doesn't exist
      let convId: string;
      if (existingConv) {
        convId = existingConv.id;
      } else {
        const [newConv] = await ctx.db
          .insert(conversations)
          .values({ type: "agent" })
          .returning();

        await ctx.db.insert(conversationParticipants).values({
          conversationId: newConv!.id,
          userId: ownerId,
          isPinned: true,
        });

        convId = newConv!.id;
      }

      // Insert message with senderType "agent", senderId = owner's userId
      const [message] = await ctx.db
        .insert(messages)
        .values({
          conversationId: convId,
          senderId: ownerId,
          senderType: "agent",
          content: input.content,
          metadata: input.metadata,
          uiResource: input.uiResource as UiResource | undefined,
          uiProducerTrust: input.uiResource
            ? resolveProducerTrust({ kind: "agent", verified: agentIsVerified })
            : undefined,
        })
        .returning();

      // Update conversation.updatedAt
      await ctx.db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, convId));

      // Log activity for webhook dispatch
      void logActivity(ctx.db, {
        actorId: ctx.agent.agentId,
        actorType: "agent",
        action: "message.sent",
        targetType: "conversations",
        targetId: convId,
        recipientId: ownerId,
      });

      // Publish real-time event to owner
      void publishInboxEvent(ownerId, {
        kind: "message",
        conversationId: convId,
        message,
      });

      return { messageId: message!.id };
    }),

  /**
   * agentGetConversationHistory - agent fetches paginated conversation history.
   * Returns messages in chronological order.
   */
  agentGetConversationHistory: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        before: z.string().optional(), // ISO-8601 date string
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const ownerId = requireOwner(ctx.agent.ownerId);

      const [agentConv] = await ctx.db
        .select({ id: conversations.id })
        .from(conversations)
        .innerJoin(
          conversationParticipants,
          eq(conversationParticipants.conversationId, conversations.id),
        )
        .where(
          and(
            eq(conversations.type, "agent"),
            eq(conversationParticipants.userId, ownerId),
          ),
        )
        .limit(1);

      if (!agentConv) {
        return { messages: [], hasMore: false };
      }

      const conditions = [eq(messages.conversationId, agentConv.id)];

      if (input.before) {
        conditions.push(lt(messages.createdAt, new Date(input.before)));
      }

      const rows = await ctx.db
        .select({
          id: messages.id,
          senderType: messages.senderType,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(and(...conditions))
        .orderBy(desc(messages.createdAt))
        .limit(input.limit + 1);

      const hasMore = rows.length > input.limit;
      const items = hasMore ? rows.slice(0, input.limit) : rows;

      // Reverse to chronological order
      items.reverse();

      return { messages: items, hasMore };
    }),

  /**
   * agentGetOwnerDMs - agent reads owner's DM conversations.
   * Requires canReadOwnerDMs permission on agent profile.
   */
  agentGetOwnerDMs: agentProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ ctx, input }) => {
      requireScope(ctx.agent.scopes, "read");
      const ownerId = requireOwner(ctx.agent.ownerId);

      // Check canReadOwnerDMs permission
      const [agent] = await ctx.db
        .select({ canReadOwnerDMs: agentProfiles.canReadOwnerDMs })
        .from(agentProfiles)
        .where(eq(agentProfiles.id, ctx.agent.agentId))
        .limit(1);

      if (!agent?.canReadOwnerDMs) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Agent does not have permission to read owner DMs",
        });
      }

      // Get owner's DM conversations
      const dmConversations = await ctx.db
        .select({
          conversationId: conversationParticipants.conversationId,
        })
        .from(conversationParticipants)
        .innerJoin(
          conversations,
          eq(conversationParticipants.conversationId, conversations.id),
        )
        .where(
          and(
            eq(conversationParticipants.userId, ownerId),
            eq(conversations.type, "dm"),
          ),
        );

      if (dmConversations.length === 0) {
        return { messages: [] };
      }

      const convIds = dmConversations.map((c) => c.conversationId);

      // Fetch recent messages across all DM conversations
      const rows = await ctx.db
        .select({
          id: messages.id,
          conversationId: messages.conversationId,
          senderId: messages.senderId,
          senderType: messages.senderType,
          content: messages.content,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .where(or(...convIds.map((id) => eq(messages.conversationId, id))))
        .orderBy(desc(messages.createdAt))
        .limit(input.limit);

      // Reverse to chronological order
      rows.reverse();

      return { messages: rows };
    }),
});
