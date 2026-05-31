import { eq } from "drizzle-orm";
import type { db as _db } from "@/server/db";
import { user } from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import { logActivity } from "@/server/agent/activity";

type DB = typeof _db;

/** Materialise a ritual as a forum thread authored by the ritual's owner.
 *  Used by both the rituals cron (auto mode) and approveOccurrence (review mode)
 *  so the author-of-record (authorId AND authorName) is always the ritual owner. */
export async function postRitualThread(
  db: DB,
  ritual: {
    id: string;
    communityId: string;
    authorUserId: string;
    title: string;
    body: string;
    category: string;
  },
): Promise<number> {
  const payload = await getPayloadClient();
  const baseSlug = ritual.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const slug = `${baseSlug}-${Date.now()}`;

  const [author] = await db
    .select({ name: user.name })
    .from(user)
    .where(eq(user.id, ritual.authorUserId))
    .limit(1);

  const thread = await payload.create({
    collection: "forum-threads",
    data: {
      title: ritual.title,
      slug,
      content: plainTextToLexical(ritual.body),
      category: ritual.category as "general" | "question" | "showcase" | "job",
      authorId: ritual.authorUserId,
      authorName: author?.name ?? "organizer",
      authorRole: "member",
      isPinned: false,
      isLocked: false,
      replyCount: 0,
      lastActivityAt: new Date().toISOString(),
      communityId: ritual.communityId,
    },
  });

  await logActivity(db, {
    actorId: ritual.authorUserId,
    actorType: "member",
    action: "thread.create",
    targetType: "forum-threads",
    targetId: String(thread.id),
    communityId: ritual.communityId,
    metadata: {
      title: ritual.title,
      category: ritual.category,
      slug,
      ritualId: ritual.id,
    },
  });

  return Number(thread.id);
}
