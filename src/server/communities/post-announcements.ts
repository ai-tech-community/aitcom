import { and, eq, inArray, isNull } from "drizzle-orm";
import { after } from "next/server";
import { sql } from "@payloadcms/db-postgres";
import type { PostgresAdapter } from "@payloadcms/db-postgres";
import type { CollectionAfterChangeHook, PayloadRequest } from "payload";

import type { db as Db } from "@/server/db";
import { communities, communityMemberships } from "@/server/db/schema";
import { sendCommunityBroadcast } from "@/server/notifications/broadcast-send";
import { mentionsEveryone } from "@/lib/post-mentions";
import { plainPostText } from "@/lib/post-format";

type Database = typeof Db;

/** Who may say "@everyone": the community's owners, admins and moderators. */
const ANNOUNCER_ROLES = ["owner", "admin", "moderator"] as const;

/** The longest post text an announcement email carries. */
const MAX_BODY = 2000;
/** The longest piece of the post in the subject line. */
const MAX_SUBJECT_TEXT = 80;

type AnnouncedPost = {
  id: number;
  authorId: string;
  authorName?: string | null;
  communityId?: string | null;
  content?: string | null;
  isDeleted?: boolean | null;
  hiddenAt?: string | null;
  announcedAt?: string | null;
  video?: { key?: string | null } | null;
};

/** What `sendCommunityBroadcast` takes for an announced post. */
export type PostAnnouncement = Parameters<typeof sendCommunityBroadcast>[1];

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Turns a post's "@everyone" into an announcement to its whole community,
 * once: only from an owner, admin or moderator (checked now, not trusted
 * from the client), only for a live post nobody hid for review, and only
 * the first time — the post is claimed in one statement (`announcedAt`),
 * so two saves racing announce once. Returns the broadcast to send, or
 * null. For anyone else "@everyone" stays plain text.
 */
export async function announceToEveryone(
  database: Database,
  post: AnnouncedPost,
  /** Sets `announcedAt` if still unset; true when this save set it. */
  claim: (postId: number) => Promise<boolean>,
): Promise<PostAnnouncement | null> {
  if (!post.communityId || post.isDeleted || post.hiddenAt) return null;
  if (post.announcedAt || !mentionsEveryone(post.content ?? "")) return null;
  const [announcer] = await database
    .select({ userId: communityMemberships.userId })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, post.communityId),
        eq(communityMemberships.userId, post.authorId),
        eq(communityMemberships.status, "active"),
        inArray(communityMemberships.role, [...ANNOUNCER_ROLES]),
      ),
    )
    .limit(1);
  if (!announcer) return null;
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
  const firstLine = text.split("\n")[0] ?? "";
  const author = post.authorName ?? "A member";
  const isVideo = Boolean(post.video?.key);
  return {
    communityId: post.communityId,
    authorId: post.authorId,
    subject: `${author} in ${community.name}: ${clip(firstLine, MAX_SUBJECT_TEXT)}`,
    body: clip(text, MAX_BODY),
    link: {
      label: isVideo ? "Watch the video" : "Open the post",
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
 * connection would not see a new post and would wait on an edited one.
 * The row-level check makes two racing saves claim it once.
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
 * Announces a saved post's "@everyone" to its community, after the
 * response (the broadcast emails can take a while on a large community).
 * A failure is logged and never fails the post.
 */
export function feedPostAnnouncementAfterChange(
  getDatabase: () => Promise<Database> = async () =>
    (await import("@/server/db")).db,
): CollectionAfterChangeHook {
  return async ({ doc, req }) => {
    const post = doc as AnnouncedPost;
    // Cheap checks first: most saves have nothing to announce.
    if (post.announcedAt || !mentionsEveryone(post.content ?? "")) return;
    try {
      const database = await getDatabase();
      const announcement = await announceToEveryone(database, post, (id) =>
        claimAnnouncement(req, id),
      );
      if (!announcement) return;
      const run = () =>
        sendCommunityBroadcast(database, announcement).catch(
          (error: unknown) => {
            console.error("[feed-posts] @everyone broadcast failed", error);
          },
        );
      try {
        after(() => run());
      } catch {
        void run();
      }
    } catch (error) {
      console.error("[feed-posts] failed to announce @everyone", error);
    }
  };
}
