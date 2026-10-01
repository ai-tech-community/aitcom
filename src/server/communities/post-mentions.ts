import { and, asc, eq, ilike, inArray, isNull, ne, sql } from "drizzle-orm";
import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
} from "payload";

import type { db as Db } from "@/server/db";
import {
  communities,
  communityMemberships,
  memberProfiles,
  notifications,
  user,
} from "@/server/db/schema";
import { escapeLike } from "@/server/db/escape-like";
import { publicRosterVisibility } from "@/server/members/public-roster";
import {
  scheduleMentionEmails,
  type MentionEmailInput,
} from "@/server/notifications/post-mention-mail";
import {
  EVERYONE,
  MAX_POST_MENTIONS,
  mentionsIn,
  readMentions,
  type PostMention,
} from "@/lib/post-mentions";

type Database = typeof Db;

/** The notification type for a mention (also its "already told" record). */
const MENTION_NOTIFICATION = "post_mention";

/** A mention as the feed shows it: a link only to a profile open to all. */
export type PostMentionView = PostMention & { hasProfile: boolean };

/**
 * The active members of a community among `userIds`, with the name the
 * community knows them by (their profile name, else their account name).
 */
async function activeMembers(
  database: Database,
  communityId: string,
  userIds: readonly string[],
): Promise<PostMention[]> {
  const ids = [...new Set(userIds)].slice(0, MAX_POST_MENTIONS * 2);
  if (ids.length === 0) return [];
  const rows = await database
    .select({
      userId: communityMemberships.userId,
      displayName: memberProfiles.displayName,
      accountName: user.name,
    })
    .from(communityMemberships)
    .innerJoin(user, eq(user.id, communityMemberships.userId))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.status, "active"),
        inArray(communityMemberships.userId, ids),
      ),
    );
  const names = new Map(
    rows.map((row) => [
      row.userId,
      (row.displayName ?? row.accountName ?? "").trim(),
    ]),
  );
  return ids.flatMap((userId) => {
    const name = names.get(userId);
    return name ? [{ userId, name }] : [];
  });
}

/** A member the editor offers after "@" (or "@everyone"). */
export type MentionCandidate = PostMention & {
  image: string | null;
  everyone?: boolean;
};

/** "@everyone" as the editor offers it to those who may announce. */
export const EVERYONE_CANDIDATE: MentionCandidate = {
  userId: EVERYONE,
  name: EVERYONE,
  image: null,
  everyone: true,
};

/**
 * Members of a community the author may mention, matching what they typed
 * after "@" anywhere in the name (names starting with it first), never the
 * author. An empty query lists members by name.
 */
export async function findMentionCandidates(
  database: Database,
  input: {
    communityId: string;
    authorId: string;
    query: string;
    limit: number;
  },
): Promise<MentionCandidate[]> {
  const name = sql<string>`btrim(coalesce(${memberProfiles.displayName}, ${user.name}))`;
  const query = escapeLike(input.query.trim());
  const rows = await database
    .select({ userId: communityMemberships.userId, name, image: user.image })
    .from(communityMemberships)
    .innerJoin(user, eq(user.id, communityMemberships.userId))
    .leftJoin(memberProfiles, eq(memberProfiles.userId, user.id))
    .where(
      and(
        eq(communityMemberships.communityId, input.communityId),
        eq(communityMemberships.status, "active"),
        ne(communityMemberships.userId, input.authorId),
        ne(name, ""),
        query ? ilike(name, `%${query}%`) : undefined,
      ),
    )
    .orderBy(
      ...(query ? [sql`${ilike(name, `${query}%`)} desc`] : []),
      asc(sql`lower(${name})`),
    )
    .limit(input.limit);
  return rows;
}

/**
 * The mentions a member asked for, checked: only active members of the
 * post's community, named as the community knows them, and only where that
 * "@Name" is in the text.
 */
export async function resolveMentions(
  database: Database,
  input: { communityId: string; content: string; userIds: readonly string[] },
): Promise<PostMention[]> {
  const members = await activeMembers(
    database,
    input.communityId,
    input.userIds,
  );
  return mentionsIn(input.content, members);
}

/**
 * Keeps a post's mentions in step with its text on every write path: the
 * mentions already on the post stay while their names are in the text
 * (also after a member renames), new ones come in only checked by
 * `resolveMentions`, a name taken out of the text takes its mention out,
 * and a deleted post mentions no one.
 */
export function feedPostMentionsBeforeChange(): CollectionBeforeChangeHook {
  return ({ data, originalDoc }) => {
    if (!data) return data;
    const deleted = (data.isDeleted ?? originalDoc?.isDeleted) === true;
    const content: unknown = data.content ?? originalDoc?.content;
    data.mentions =
      deleted || typeof content !== "string"
        ? []
        : mentionsIn(content, [
            ...readMentions(data.mentions),
            ...readMentions(originalDoc?.mentions),
          ]);
    return data;
  };
}

type MentionedPost = {
  id: number;
  authorId: string;
  authorName?: string | null;
  communityId?: string | null;
  isDeleted?: boolean | null;
  hiddenAt?: string | null;
  video?: { key?: string | null } | null;
  mentions?: unknown;
};

/** Whether `userId` is an active member of the community. */
async function isActiveMember(
  database: Database,
  communityId: string,
  userId: string,
): Promise<boolean> {
  const rows = await database
    .select({ userId: communityMemberships.userId })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.userId, userId),
        eq(communityMemberships.status, "active"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Tells each member a post mentions (never its author) that they were
 * mentioned, once per post: the notifications already sent for this post
 * are the record, so taking a name out and putting it back tells no one
 * again, and a mention added while the post was hidden for review is told
 * when a moderator restores it. A hidden post tells no one, since they
 * could not see it; nor does an author who is no longer a member.
 *
 * Member-chosen names go only in the title, which is shown as plain text;
 * the markdown body holds none. Returns what the mention emails need for
 * the members just notified (none: null).
 */
export async function notifyNewMentions(
  database: Database,
  post: MentionedPost,
): Promise<MentionEmailInput | null> {
  if (!post.communityId || post.isDeleted || post.hiddenAt) return null;
  const wanted = readMentions(post.mentions)
    .map((mention) => mention.userId)
    .filter((userId) => userId !== post.authorId);
  if (wanted.length === 0) return null;
  const told = await database
    .select({ userId: notifications.userId })
    .from(notifications)
    .where(
      and(
        eq(notifications.type, MENTION_NOTIFICATION),
        inArray(notifications.userId, wanted),
        sql`${notifications.metadata}->>'postId' = ${String(post.id)}`,
      ),
    );
  const toldIds = new Set(told.map((row) => row.userId));
  const fresh = wanted.filter((userId) => !toldIds.has(userId));
  if (fresh.length === 0) return null;
  if (!(await isActiveMember(database, post.communityId, post.authorId))) {
    return null;
  }
  const community = await database.query.communities.findFirst({
    where: and(
      eq(communities.id, post.communityId),
      isNull(communities.deletedAt),
    ),
    columns: { slug: true, name: true },
  });
  if (!community) return null;
  // Still members now: a stored list is never trusted on its own.
  const recipients = await activeMembers(database, post.communityId, fresh);
  if (recipients.length === 0) return null;
  const isVideo = Boolean(post.video?.key);
  // Text posts have no page of their own yet: the link opens the feed.
  const path = isVideo
    ? `/communities/${community.slug}/reels?v=${post.id}`
    : `/communities/${community.slug}`;
  await database.insert(notifications).values(
    recipients.map(({ userId }) => ({
      userId,
      type: MENTION_NOTIFICATION,
      title: `${post.authorName ?? "A member"} mentioned you in ${community.name}`,
      content: isVideo
        ? "You were mentioned in a video. Watch it to see what they said."
        : "You were mentioned in a post. Open the feed to read it and reply.",
      communityId: post.communityId,
      metadata: {
        postId: post.id,
        reviewPath: path,
        linkLabel: isVideo ? "Watch the video" : "Open the feed",
      },
    })),
  );
  return {
    mail: {
      authorName: post.authorName ?? "A member",
      communityName: community.name,
      isVideo,
    },
    path,
    recipientIds: recipients.map(({ userId }) => userId),
  };
}

/**
 * Notifies newly mentioned members after a post is saved, in the app and
 * (after the response) by email. Saves that
 * change nothing a notice depends on (a pin, a topic) skip the check. A
 * failure to notify never fails the post: it is logged.
 */
export function feedPostMentionsAfterChange(
  getDatabase: () => Promise<Database> = async () =>
    (await import("@/server/db")).db,
): CollectionAfterChangeHook {
  return async ({ doc, previousDoc, operation }) => {
    const post = doc as MentionedPost;
    const before = previousDoc as MentionedPost | undefined;
    if (
      operation === "update" &&
      before &&
      JSON.stringify(readMentions(before.mentions)) ===
        JSON.stringify(readMentions(post.mentions)) &&
      Boolean(before.hiddenAt) === Boolean(post.hiddenAt)
    ) {
      return;
    }
    try {
      const database = await getDatabase();
      const emails = await notifyNewMentions(database, post);
      if (emails) scheduleMentionEmails(database, emails);
    } catch (error) {
      console.error("[feed-posts] failed to notify mentioned members", error);
    }
  };
}

/**
 * The mentions of a set of posts as the feed shows them, with whether each
 * member's profile is open to all (a link) or not (just the name), in one
 * query.
 */
export async function loadMentionViews(
  database: Database,
  posts: readonly { mentions?: unknown }[],
): Promise<(post: { mentions?: unknown }) => PostMentionView[]> {
  const ids = [
    ...new Set(
      posts.flatMap((post) => readMentions(post.mentions).map((m) => m.userId)),
    ),
  ];
  const open = new Set<string>();
  if (ids.length > 0) {
    const rows = await database
      .select({ userId: memberProfiles.userId })
      .from(memberProfiles)
      .where(
        and(inArray(memberProfiles.userId, ids), publicRosterVisibility()),
      );
    for (const row of rows) open.add(row.userId);
  }
  return (post) =>
    readMentions(post.mentions).map((mention) => ({
      ...mention,
      hasProfile: open.has(mention.userId),
    }));
}
