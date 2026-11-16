import type { db as Database } from "@/server/db";
import { z } from "zod";
import { eq, and, desc, lt, sql, ne, or, ilike } from "drizzle-orm";
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
  communityMemberships,
  user,
} from "@/server/db/schema";
import { MESSAGE_MAX_LENGTH } from "@/lib/message-rules";
import { requireActiveMemberOf } from "@/server/communities/content-access";
import {
  canReadPaidCommunity,
  paymentsEnabled,
} from "@/server/payments/access";
import { logActivity } from "@/server/agent/activity";
import { publishInboxEvent } from "@/server/inbox/publish";
import { after } from "next/server";
import { dispatchEventImmediately } from "@/server/agent/dispatch-immediate";
import { resolveProducerTrust } from "@/lib/chat/trust";
import type { UiResource } from "@/lib/chat/types";
import { getGiphyClient } from "@/server/giphy/giphy";
import {
  gifFields,
  giphyIdSchema,
  lookUpGif,
  type StoredGif,
} from "@/server/giphy/gif-lookup";
import {
  loadConversationRows,
  summarizeConversations,
  type ConversationSummary,
} from "@/server/inbox/conversation-summaries";
import { insertMemberMessage } from "@/server/inbox/member-message";
import {
  loadAttachments,
  textForReaders,
  withAttachments,
} from "@/server/inbox/message-attachments";
import { runUiTool } from "@/server/inbox/ui-tools";
import { countInboxUnread } from "@/server/inbox/unread-count";
import { isHubDmConversation } from "@/server/notifications/hub-mail-prefs";
import {
  localeFromCookieHeader,
  scheduleUnreadHubDmNotify,
} from "@/server/notifications/hub-dm-mail";

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

type ConversationDb = typeof Database;

/**
 * The GIF a member picked, looked up from GIPHY by its id, so a message only
 * ever stores addresses the server read from GIPHY itself.
 */
async function gifToStore(
  gif: { giphyId: string } | undefined,
): Promise<StoredGif | null> {
  if (!gif) return null;
  return gifFields(await lookUpGif(getGiphyClient, gif.giphyId));
}

/**
 * For a space conversation, the caller must be an active member of the
 * room AND an active member in good standing of the room's community
 * (`requireActiveMember`, ADR-0050): someone who left, was removed or
 * banned, or whose paid membership lapsed keeps their room membership row
 * (so it comes back if they return) but not the chat. A members-only
 * community's room answers NOT_FOUND to them, a public community's
 * FORBIDDEN. Returns the user-ids to fan out to: the room's members who
 * pass the same rule.
 */
async function requireSpaceConversationAccess(
  db: ConversationDb,
  conversationSpaceId: string,
  userId: string,
): Promise<string[]> {
  const space = await db.query.spaces.findFirst({
    where: eq(spaces.id, conversationSpaceId),
    columns: { communityId: true },
  });
  if (!space) throw new TRPCError({ code: "NOT_FOUND" });
  await requireActiveMemberOf(db, space.communityId, userId);
  let members = await db
    .select({ userId: spaceMemberships.userId })
    .from(spaceMemberships)
    .innerJoin(
      communityMemberships,
      and(
        eq(communityMemberships.userId, spaceMemberships.userId),
        eq(communityMemberships.communityId, space.communityId),
        eq(communityMemberships.status, "active"),
      ),
    )
    .where(
      and(
        eq(spaceMemberships.spaceId, conversationSpaceId),
        eq(spaceMemberships.status, "active"),
      ),
    );
  if (paymentsEnabled()) {
    const allowed = await Promise.all(
      members.map(async (member) => ({
        member,
        allowed: await canReadPaidCommunity(
          db,
          space.communityId,
          member.userId,
        ),
      })),
    );
    members = allowed
      .filter((entry) => entry.allowed)
      .map((entry) => entry.member);
  }
  if (!members.some((m) => m.userId === userId)) {
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
      const participantRows = await loadConversationRows(ctx.db, userId);

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

      return {
        conversations: await summarizeConversations(ctx.db, userId, items),
        nextCursor,
      };
    }),

  /**
   * getConversation - one conversation's summary, the same item
   * listConversations gives, wherever it sits in the list. NOT_FOUND when
   * the caller may not read it (not a participant, or not an active member
   * of the room) — the same rule the list applies.
   */
  getConversation: protectedProcedure
    .input(z.object({ conversationId: z.string() }))
    .query(async ({ ctx, input }): Promise<ConversationSummary> => {
      const userId = ctx.session.user.id;
      const rows = await loadConversationRows(ctx.db, userId, {
        conversationId: input.conversationId,
      });
      const [summary] = await summarizeConversations(ctx.db, userId, rows);
      if (!summary) throw new TRPCError({ code: "NOT_FOUND" });
      return summary;
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
      const items = await withAttachments(
        ctx.db,
        hasMore ? rows.slice(0, input.limit) : rows,
      );

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
      z
        .object({
          conversationId: z.string(),
          /** May be empty when the message carries a GIF. */
          content: z.string().max(MESSAGE_MAX_LENGTH),
          uiResource: uiResourceSchema.optional(),
          /** A GIF picked from `gifs.search`, looked up again here by id. */
          gif: z.object({ giphyId: giphyIdSchema }).optional(),
        })
        .refine((v) => v.content.trim() !== "" || v.gif !== undefined, {
          message: "A message needs words or a GIF.",
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

        const message = await insertMemberMessage(ctx.db, {
          conversationId: input.conversationId,
          senderId: userId,
          content: input.content,
          uiResource: input.uiResource as UiResource | undefined,
          gif: await gifToStore(input.gif),
        });

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

        return message;
      }

      // ── DM / agent conversations ────────────────────────────────────────
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

      // An agent reads words only; attachments stay between members.
      if (conversationType === "agent" && input.gif) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "GIFs can't be sent to an agent.",
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

      const message = await insertMemberMessage(ctx.db, {
        conversationId: input.conversationId,
        senderId: userId,
        content: input.content,
        uiResource: input.uiResource as UiResource | undefined,
        gif: await gifToStore(input.gif),
      });

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
        if (isHubDmConversation(conversationType)) {
          scheduleUnreadHubDmNotify(ctx.db, {
            recipientUserId: recipient.userId,
            conversationId: input.conversationId,
            locale: localeFromCookieHeader(ctx.headers.get("cookie")),
          });
        }
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

      return message;
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
  totalUnreadCount: protectedProcedure.query(async ({ ctx }) => ({
    count: await countInboxUnread(ctx.db, ctx.session.user.id),
  })),

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
        content: z.string().min(1).max(MESSAGE_MAX_LENGTH),
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

      // Agents read text only: a GIF comes through as its stand-in.
      const attachments = await loadAttachments(
        ctx.db,
        rows.map((row) => row.id),
      );
      return {
        messages: rows.map((row) => ({
          ...row,
          content: textForReaders(row.content, attachments.get(row.id) ?? []),
        })),
      };
    }),
});
