import { and, eq, isNull } from "drizzle-orm";
import { after } from "next/server";
import { sql } from "@payloadcms/db-postgres";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { CollectionAfterChangeHook, PayloadRequest } from "payload";

import type { db as Db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";
import { sendCommunityBroadcast } from "@/server/notifications/broadcast-send";
import { postAnnouncementCopy } from "@/server/notifications/post-announcement-copy";
import { EVERYONE, mentionsEveryone, readMentions } from "@/lib/post-mentions";
import { plainPostText } from "@/lib/post-format";

import { canBroadcast } from "./role-utils";

type Database = typeof Db;

/** The longest post text an announcement carries. */
const MAX_BODY = 2000;

/**
 * Set on the save's request context when the post is being announced, so
 * the mention hook leaves out mention emails (one email per post).
 */
export const ANNOUNCED_CONTEXT_KEY = "feedPostAnnounced";

type AnnouncedPost = {
  id: number;
  authorId: string;
  authorName?: string | null;
  communityId?: string | null;
  content?: string | null;
  isDeleted?: boolean | null;
  hiddenAt?: string | null;
  announcedAt?: string | null;
  mentions?: unknown;
  video?: { key?: string | null } | null;
};

/** What `sendCommunityBroadcast` takes for an announced post. */
export type PostAnnouncement = Parameters<typeof sendCommunityBroadcast>[1];

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/** Whether "@everyone" in the post means the community, not a member. */
function saysEveryone(post: AnnouncedPost): boolean {
  if (!mentionsEveryone(post.content ?? "")) return false;
  // A member named "everyone", picked from the list, is just that member.
  return !readMentions(post.mentions).some((m) => m.name === EVERYONE);
}

/**
 * Turns a new post's "@everyone" into an announcement to its whole
 * community, once: only from an owner or admin (`canBroadcast`, checked
 * now, never trusted from the client), only for a live post nobody hid,
 * and only the first time — the post is claimed in one statement
 * (`announcedAt`), so two saves racing announce once. Returns the
 * broadcast to send, or null. For anyone else "@everyone" is plain text.
 */
export async function announceToEveryone(
  database: Database,
  post: AnnouncedPost,
  /** Sets `announcedAt` if still unset; true when this save set it. */
  claim: (postId: number) => Promise<boolean>,
): Promise<PostAnnouncement | null> {
  if (!post.communityId || post.isDeleted || post.hiddenAt) return null;
  if (post.announcedAt || !saysEveryone(post)) return null;
  const membership = await database.query.communityMemberships.findFirst({
    where: and(
      eq(communityMemberships.communityId, post.communityId),
      eq(communityMemberships.userId, post.authorId),
      eq(communityMemberships.status, "active"),
    ),
    columns: { role: true },
  });
  if (!canBroadcast(membership?.role)) return null;
  const community = await database.query.communities.findFirst({
    where: and(
      eq(communities.id, post.communityId),
      isNull(communities.deletedAt),
    ),
    columns: { slug: true, name: true },
  });
  if (!community) return null;
  if (!(await claim(post.id))) return null;

  const text = plainPostText(post.content ?? "").trim();
  const isVideo = Boolean(post.video?.key);
  // Members have no stored language yet: English until they do.
  const copy = postAnnouncementCopy("en", {
    authorName: post.authorName ?? "A member",
    communityName: community.name,
    text,
    isVideo,
  });
  return {
    communityId: post.communityId,
    authorId: post.authorId,
    subject: copy.subject,
    body: `${clip(text, MAX_BODY)}\n\n${copy.why}`,
    link: {
      label: copy.cta,
      path: isVideo
        ? `/communities/${community.slug}/reels?v=${post.id}`
        : `/communities/${community.slug}`,
    },
    // The author wrote it; they need no notice of their own post.
    skipUserIds: [post.authorId],
    // One delivery per member per post, however often it is announced.
    dedupeKey: `post:${post.id}`,
  };
}

/**
 * Sets a post's `announcedAt` if it is still unset, on the save's own
 * transaction: after-change hooks run before Payload commits, so another
 * connection would not see a new post. The row-level check makes two
 * racing saves claim it once. (This is what Payload's own internal
 * `getTransaction` does; it is not exported.)
 */
async function claimAnnouncement(
  req: PayloadRequest,
  postId: number,
): Promise<boolean> {
  const adapter = req.payload.db as unknown as PostgresAdapter;
  const transaction = req.transactionID
    ? adapter.sessions[await req.transactionID]?.db
    : undefined;
  const { rows } = await (transaction ?? adapter.drizzle).execute(sql`
    UPDATE "feed_posts" SET "announced_at" = now()
    WHERE "id" = ${postId} AND "announced_at" IS NULL
    RETURNING "id"
  `);
  return rows.length > 0;
}

/**
 * Announces a post's "@everyone" to its community when the post is first
 * shared, never from a later save (an edit, a pin, a topic move, a
 * restore), so an old post can never reach everyone by surprise. The
 * broadcast goes out after the response; outside a request (scripts,
 * tests) it is awaited. A failure is logged and never fails the post.
 * Runs before the mention hook, which then leaves out mention emails.
 */
export function feedPostAnnouncementAfterChange(
  getDatabase: () => Promise<Database> = async () =>
    (await import("@/server/db")).db,
): CollectionAfterChangeHook {
  return async ({ doc, req, operation }) => {
    if (operation !== "create") return;
    const post = doc as AnnouncedPost;
    // Cheap check first: most posts have nothing to announce.
    if (!saysEveryone(post)) return;
    try {
      const database = await getDatabase();
      const announcement = await announceToEveryone(database, post, (id) =>
        claimAnnouncement(req, id),
      );
      if (!announcement) return;
      req.context[ANNOUNCED_CONTEXT_KEY] = true;
      const run = () =>
        sendCommunityBroadcast(database, announcement).catch(
          (error: unknown) => {
            console.error("[feed-posts] @everyone broadcast failed", error);
          },
        );
      try {
        after(() => run());
      } catch {
        await run();
      }
    } catch (error) {
      console.error("[feed-posts] failed to announce @everyone", error);
    }
  };
}
