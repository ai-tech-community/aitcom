import { and, eq, isNull } from "drizzle-orm";

import { awardXp, XP_AMOUNTS } from "@/lib/gamification";
import { logActivity } from "@/server/agent/activity";
import type { db as Database } from "@/server/db";
import { communities } from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";

import { forumBodyToLexical } from "./forum-body";
import {
  type ForumThreadDraft,
  forumThreadSlug,
  threadCommunityId,
} from "./forum-thread-draft";
import { requireRulesAcceptance } from "./rules-acceptance";

type DB = typeof Database;

/**
 * Create a forum thread the way the browser form does: same length limits,
 * categories, rules check, author fields, and XP. The author of record is
 * `author` (the signed-in member, or the agent owner's account).
 */
export async function createForumThread(
  db: DB,
  actor: { id: string; type: "member" | "agent" },
  author: { id: string; name: string },
  input: ForumThreadDraft,
) {
  let communityId: string | undefined;
  if (input.communitySlug) {
    const community = await db.query.communities.findFirst({
      where: and(
        eq(communities.slug, input.communitySlug),
        isNull(communities.deletedAt),
      ),
      columns: { id: true },
    });
    communityId = threadCommunityId(input.communitySlug, community);
  }
  await requireRulesAcceptance(author.id, communityId);
  const payload = await getPayloadClient();
  const slug = await uniqueForumThreadSlug(payload, input.title);

  const thread = await payload.create({
    collection: "forum-threads",
    data: {
      title: input.title,
      slug,
      content: forumBodyToLexical(input.content),
      category: input.category,
      authorId: author.id,
      authorName: author.name,
      authorRole: "member",
      isPinned: false,
      isLocked: false,
      replyCount: 0,
      lastActivityAt: new Date().toISOString(),
      ...(communityId ? { communityId } : {}),
    },
  });

  await logActivity(db, {
    actorId: actor.id,
    actorType: actor.type,
    action: "thread.create",
    targetType: "forum-threads",
    targetId: String(thread.id),
    communityId,
    metadata: {
      title: input.title,
      category: input.category,
      slug,
      ...(actor.type === "agent" ? { onBehalfOf: author.id } : {}),
    },
  });

  await awardXp(db, author.id, XP_AMOUNTS.FORUM_THREAD_CREATE);

  return thread;
}

/** `title-slug`, or `title-slug-2` when that address is already used. */
async function uniqueForumThreadSlug(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  title: string,
): Promise<string> {
  const base = forumThreadSlug(title);
  const { docs } = await payload.find({
    collection: "forum-threads",
    where: {
      or: [{ slug: { equals: base } }, { slug: { like: base } }],
    },
    depth: 0,
    limit: 100,
    pagination: false,
  });
  const prefix = `${base}-`;
  const taken = new Set<string>();
  for (const doc of docs) {
    const slug = doc.slug;
    if (!slug) continue;
    if (
      slug === base ||
      (slug.startsWith(prefix) && /^\d+$/.test(slug.slice(prefix.length)))
    ) {
      taken.add(slug);
    }
  }
  return forumThreadSlug(title, taken);
}
