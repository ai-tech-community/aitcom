import { and, desc, eq, inArray, ne, or, sql } from "drizzle-orm";

import type { db as Database } from "@/server/db";
import {
  agentProfiles,
  communities,
  communityMemberships,
  conversationParticipants,
  conversations,
  memberProfiles,
  messages,
  spaceMemberships,
  spaces,
  user,
} from "@/server/db/schema";
import { getAvatarUrl } from "@/lib/avatar";
import { isOpenCommunitiesEnabled } from "@/lib/communities/redesign-flag";
import { countRoomUnread } from "@/server/communities/room-unread";
import {
  canReadPaidCommunity,
  paymentsEnabled,
} from "@/server/payments/access";
import {
  attachmentKind,
  loadAttachments,
  type MessageAttachmentView,
} from "@/server/inbox/message-attachments";

type Db = typeof Database;

/**
 * One conversation the caller may read, with enough to sort, paginate and
 * build its summary. DM/agent rows come from conversationParticipants (the
 * caller IS a participant). Space (room) rows have NO participant rows —
 * they're authorized via an ACTIVE spaceMembership.
 */
export type ConvRow = {
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

type MessageRow = typeof messages.$inferSelect;
type AgentRow = typeof agentProfiles.$inferSelect;

/** A conversation as the inbox lists it: one item of `listConversations`. */
export type ConversationSummary = {
  id: string;
  type: string;
  updatedAt: string;
  isPinned: boolean;
  participants: {
    userId: string;
    displayName: string;
    image: string | null;
    avatarUrl?: string | null;
  }[];
  agentInfo: Pick<AgentRow, "id" | "name" | "avatar" | "lastActiveAt"> | null;
  unreadCount: number;
  // Room (space) fields — defaulted for DM/agent rows so the shape is
  // uniform. The UI keys off `isRoom`.
  isRoom: boolean;
  title: string | null;
  roomSlug: string | null;
  spaceId: string | null;
  roomVisibility: "public" | "private" | null;
  communitySlug: string | null;
  communityName: string | null;
  communityLogoUrl: string | null;
  memberCount: number;
  lastMessage:
    | (Pick<MessageRow, "content" | "senderType" | "senderId" | "createdAt"> & {
        attachmentKind: MessageAttachmentView["kind"] | null;
      })
    | null;
};

/**
 * The caller's DM/agent conversations plus the rooms they may read, unsorted.
 * With `only`, narrowed to that one conversation: empty when the caller may
 * not read it.
 */
export async function loadConversationRows(
  db: Db,
  userId: string,
  only?: { conversationId: string },
): Promise<ConvRow[]> {
  const onlyThis = only ? eq(conversations.id, only.conversationId) : undefined;

  // ── DM / agent conversations (caller is a participant) ──────────────
  const participantRowsRaw = await db
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
        onlyThis,
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
  // so there is no lastReadAt — unread is computed from all messages later.
  let roomRowsRaw = await db
    .select({
      conversationId: conversations.id,
      convType: conversations.type,
      convUpdatedAt: conversations.updatedAt,
      spaceId: conversations.spaceId,
      roomName: spaces.name,
      roomSlug: spaces.slug,
      roomVisibility: spaces.visibility,
      communitySlug: communities.slug,
      communityId: communities.id,
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
    // Only rooms of communities the caller is still an active member of
    // (ADR-0050); a kept room membership alone lists nothing.
    .innerJoin(
      communityMemberships,
      and(
        eq(communityMemberships.communityId, spaces.communityId),
        eq(communityMemberships.userId, userId),
        eq(communityMemberships.status, "active"),
      ),
    )
    .where(
      and(
        eq(conversations.type, "space"),
        eq(spaceMemberships.userId, userId),
        eq(spaceMemberships.status, "active"),
        onlyThis,
      ),
    );

  if (paymentsEnabled()) {
    const allowed = await Promise.all(
      roomRowsRaw.map(async (room) => ({
        room,
        allowed: await canReadPaidCommunity(db, room.communityId, userId),
      })),
    );
    roomRowsRaw = allowed
      .filter((entry) => entry.allowed)
      .map((entry) => entry.room);
  }

  // Active-member counts per room via a grouped query, mapped by spaceId. An
  // inline correlated subquery mis-correlates here: Drizzle emits the
  // interpolated outer column unqualified inside sql``, so `space_id = "id"`
  // resolves to the membership table's own column and the count is wrong.
  const roomSpaceIds = roomRowsRaw
    .map((r) => r.spaceId)
    .filter((id): id is string => id !== null);
  const roomCounts = roomSpaceIds.length
    ? await db
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
  const roomCountBySpace = new Map(roomCounts.map((c) => [c.spaceId, c.count]));

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

  return [...dmRows, ...roomRows];
}

/**
 * Each row's summary, in the rows' order: last message (with what it
 * carries, read in one query for all rows), the other participants, agent
 * info, unread count and room fields.
 */
export async function summarizeConversations(
  db: Db,
  userId: string,
  rows: ConvRow[],
): Promise<ConversationSummary[]> {
  const result = await Promise.all(
    rows.map(async (row) => {
      // Last message
      const [lastMessage] = await db
        .select({
          id: messages.id,
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
        : await db
            .select({
              userId: conversationParticipants.userId,
              displayName: memberProfiles.displayName,
              name: user.name,
              image: user.image,
              email: user.email,
            })
            .from(conversationParticipants)
            .leftJoin(
              memberProfiles,
              eq(memberProfiles.userId, conversationParticipants.userId),
            )
            .leftJoin(user, eq(user.id, conversationParticipants.userId))
            .where(
              and(
                eq(conversationParticipants.conversationId, row.conversationId),
                ne(conversationParticipants.userId, userId),
              ),
            );

      const otherParticipants = otherParticipantsRaw.map((p) => ({
        userId: p.userId,
        displayName: p.displayName ?? p.name ?? "Unknown",
        image: p.image,
        ...(isOpenCommunitiesEnabled()
          ? { avatarUrl: getAvatarUrl(p.email, p.image) }
          : {}),
      }));

      // Agent info (only for agent conversations)
      let agentInfo = null;
      if (row.convType === "agent") {
        const [agent] = await db
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
          db,
          row.conversationId,
          userId,
          row.lastReadAt,
        );
      } else if (row.lastReadAt) {
        const [unreadRow] = await db
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
        const [unreadRow] = await db
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

  // What the last messages carry, read in one query.
  const lastAttachments = await loadAttachments(
    db,
    result.flatMap((conversation) =>
      conversation.lastMessage ? [conversation.lastMessage.id] : [],
    ),
  );
  return result.map(({ lastMessage, ...conversation }) => {
    if (!lastMessage) return { ...conversation, lastMessage: null };
    const { id, ...preview } = lastMessage;
    return {
      ...conversation,
      lastMessage: {
        ...preview,
        attachmentKind: attachmentKind(lastAttachments.get(id) ?? []),
      },
    };
  });
}
