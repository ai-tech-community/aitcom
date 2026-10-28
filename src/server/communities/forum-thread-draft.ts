import { TRPCError } from "@trpc/server";

/** Agent drafts use this type. Approval publishes the thread. */
export const FORUM_THREAD_DRAFT_TYPE = "thread_create";

export const FORUM_THREAD_TITLE_MIN = 3;
export const FORUM_THREAD_TITLE_MAX = 255;
export const FORUM_THREAD_CONTENT_MAX = 10_000;

export const FORUM_THREAD_CATEGORIES = [
  "general",
  "question",
  "showcase",
  "job",
] as const;

export type ForumThreadCategory = (typeof FORUM_THREAD_CATEGORIES)[number];

export type ForumThreadDraft = {
  title: string;
  content: string;
  category: ForumThreadCategory;
  communitySlug?: string;
};

const THREAD_SLUG_MAX = 80;

/** Title stem for a thread address. A short number is added only on collision. */
export function forumThreadSlug(
  title: string,
  taken: ReadonlySet<string> = new Set(),
): string {
  const stem = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  const base = stem.length >= 3 ? stem : "thread";
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, THREAD_SLUG_MAX - suffix.length).replace(/-+$/, "")}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base.slice(0, THREAD_SLUG_MAX - 5)}-${taken.size + 2}`;
}

/**
 * A provided community slug must name a live community. Omitting it is a
 * hub-wide thread, the same as the forum form without `?community=`.
 */
export function threadCommunityId(
  slug: string | undefined,
  community: { id: string } | null | undefined,
): string | undefined {
  if (!slug) return undefined;
  if (!community) {
    throw new TRPCError({
      code: "NOT_FOUND",
      message: "Community not found",
    });
  }
  return community.id;
}

export function forumThreadDraftMeta(
  input: ForumThreadDraft & { communityName?: string },
) {
  const communitySlug = input.communitySlug;
  const destinationLabel = communitySlug
    ? `${input.communityName ?? communitySlug} forum`
    : "Forum";
  const destinationPath = communitySlug
    ? `/communities/${communitySlug}/forum`
    : "/forum";
  return {
    title: input.title,
    threadTitle: input.title,
    category: input.category,
    ...(communitySlug ? { communitySlug } : {}),
    destinationLabel,
    destinationPath,
  };
}

function isForumThreadCategory(value: string): value is ForumThreadCategory {
  return (FORUM_THREAD_CATEGORIES as readonly string[]).includes(value);
}

/** The thread an approved agent draft publishes. Rejects a damaged draft. */
export function forumThreadFromDraft(draft: {
  content: string | null;
  metadata: unknown;
}): ForumThreadDraft {
  const meta =
    draft.metadata && typeof draft.metadata === "object"
      ? (draft.metadata as Record<string, unknown>)
      : null;
  const title = meta?.title;
  const category = meta?.category;
  const communitySlug = meta?.communitySlug;
  const content = draft.content ?? "";
  if (
    typeof title !== "string" ||
    title.length < FORUM_THREAD_TITLE_MIN ||
    title.length > FORUM_THREAD_TITLE_MAX
  ) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This thread draft has no usable title.",
    });
  }
  if (content.length < 1 || content.length > FORUM_THREAD_CONTENT_MAX) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This thread draft has no usable body.",
    });
  }
  if (typeof category !== "string" || !isForumThreadCategory(category)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This thread draft has no usable category.",
    });
  }
  if (communitySlug !== undefined && typeof communitySlug !== "string") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "This thread draft has no usable community.",
    });
  }
  return {
    title,
    content,
    category,
    ...(typeof communitySlug === "string" && communitySlug.length > 0
      ? { communitySlug }
      : {}),
  };
}
