import { awardXp, XP_AMOUNTS } from "@/lib/gamification";
import { logActivity } from "@/server/agent/activity";
import type { db as Database } from "@/server/db";
import { getPayloadClient } from "@/server/payload";

import { forumBodyToLexical } from "./forum-body";
import { requireActiveMemberBySlug } from "./content-access";
import { type ForumThreadDraft, forumThreadSlug } from "./forum-thread-draft";
import { requireRulesAcceptance } from "./rules-acceptance";

type DB = typeof Database;

/**
 * Create a forum thread the way the browser form does: same length limits,
 * categories, membership and rules checks, author fields, and XP. The
 * author of record is `author` (the signed-in member, or the reviewer who
 * approves an agent's draft).
 */
export async function createForumThread(
  db: DB,
  actor: { id: string; type: "member" | "agent" },
  author: { id: string; name: string },
  input: ForumThreadDraft,
) {
  // A community's thread needs its author to be an active member in good
  // standing (ADR-0050). An unknown slug, and a community the author may
  // not read, are NOT_FOUND, never a silent Hub thread.
  const communityId = input.communitySlug
    ? (
        await requireActiveMemberBySlug(db, input.communitySlug, author.id, {
          notFound: "Community not found",
        })
      ).id
    : undefined;
  await requireRulesAcceptance(author.id, communityId);
  const payload = await getPayloadClient();
  const slug = await forumThreadSlugToPublish(payload, input.title, input.slug);

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
      ...(input.imageMediaId !== undefined
        ? { imageMediaId: input.imageMediaId }
        : {}),
      ...(input.imageUrl !== undefined ? { imageUrl: input.imageUrl } : {}),
      ...(input.imageAlt !== undefined ? { imageAlt: input.imageAlt } : {}),
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

/**
 * The address this title would publish at right now, including a short
 * number when that stem is already used.
 */
export async function previewForumThreadSlug(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  title: string,
): Promise<string> {
  return uniqueForumThreadSlug(payload, title);
}

/**
 * Keep the address reserved on the draft when it is still free. Otherwise
 * take the next free address for the title.
 */
export async function forumThreadSlugToPublish(
  payload: Awaited<ReturnType<typeof getPayloadClient>>,
  title: string,
  preferred?: string,
): Promise<string> {
  if (preferred) {
    const { docs } = await payload.find({
      collection: "forum-threads",
      where: { slug: { equals: preferred } },
      depth: 0,
      limit: 1,
    });
    if (docs.length === 0) return preferred;
  }
  return uniqueForumThreadSlug(payload, title);
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
