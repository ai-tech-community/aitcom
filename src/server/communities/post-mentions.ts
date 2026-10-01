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
  MAX_POST_MENTIONS,
  mentionsIn,
  readMentions,
  type PostMention,
} from "@/lib/post-mentions";

type Database = typeof Db;

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

/** A member the editor offers after "@". */
export type MentionCandidate = PostMention & { image: string | null };

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

/**
 * A member-chosen name in notification markdown: the marks that could make
 * a link, an image or emphasis are escaped, so it shows as written.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>]/g, "\\$&");
}

/**
 * Tells each member a post newly mentions (never its author) that they
 * were mentioned, once: a mention already on the post before this write
 * was told then. A post hidden for review tells no one, since they could
 * not see it.
 */
export async function notifyNewMentions(
  database: Database,
  post: MentionedPost,
  before: MentionedPost | null,
): Promise<void> {
  if (!post.communityId || post.isDeleted || post.hiddenAt) return;
  const told = new Set(readMentions(before?.mentions).map((m) => m.userId));
  const fresh = readMentions(post.mentions)
    .map((mention) => mention.userId)
    .filter((userId) => userId !== post.authorId && !told.has(userId));
  if (fresh.length === 0) return;
  const community = await database.query.communities.findFirst({
    where: and(
      eq(communities.id, post.communityId),
      isNull(communities.deletedAt),
    ),
    columns: { slug: true, name: true },
  });
  if (!community) return;
  // Still members now: a stored list is never trusted on its own.
  const recipients = await activeMembers(database, post.communityId, fresh);
  if (recipients.length === 0) return;
  const path = post.video?.key
    ? `/communities/${community.slug}/reels?v=${post.id}`
    : `/communities/${community.slug}`;
  const author = escapeMarkdown(post.authorName ?? "A member");
  await database.insert(notifications).values(
    recipients.map(({ userId }) => ({
      userId,
      type: "post_mention",
      title: "You were mentioned in a post",
      content: `**${author}** mentioned you in a post in **${escapeMarkdown(community.name)}**.`,
      communityId: post.communityId,
      metadata: {
        postId: post.id,
        reviewPath: path,
        linkLabel: "See the post",
      },
    })),
  );
}

/**
 * Notifies newly mentioned members after a post is saved. A failure to
 * notify never fails the post: it is logged.
 */
export function feedPostMentionsAfterChange(
  getDatabase: () => Promise<Database> = async () =>
    (await import("@/server/db")).db,
): CollectionAfterChangeHook {
  return async ({ doc, previousDoc, operation }) => {
    try {
      await notifyNewMentions(
        await getDatabase(),
        doc as MentionedPost,
        operation === "create" ? null : (previousDoc as MentionedPost),
      );
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
