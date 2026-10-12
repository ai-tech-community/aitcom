import { forumThreadSitemapPath } from "@/server/communities/forum-scope";

import type {
  DigestEventItem,
  DigestJobItem,
  DigestStartupItem,
} from "./digest";
import type {
  DigestJobCandidate,
  HighlightCandidate,
  LaunchpadCandidate,
  UpcomingEventCandidate,
} from "./digest-sections";

export type CommunityRef = { id: string; slug: string };

export function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.en === "string") return record.en.trim();
  }
  return "";
}

function oneLine(value: string, max = 140): string {
  const line = value.replace(/\s+/g, " ").trim();
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1).trimEnd()}…`;
}

/** Digest pages are English. The link builder does not add a locale. */
export function digestPagePath(path: string): string {
  if (path.startsWith("/en/") || path.startsWith("/en?")) return path;
  return `/en${path.startsWith("/") ? path : `/${path}`}`;
}

export function forumHighlight(
  thread: {
    title?: unknown;
    slug?: unknown;
    communityId?: unknown;
    replyCount?: unknown;
    isDeleted?: unknown;
  },
  communities: readonly CommunityRef[],
): HighlightCandidate | null {
  if (thread.isDeleted === true) return null;
  const title = oneLine(textOf(thread.title));
  const slug = textOf(thread.slug);
  if (!title || !slug) return null;
  const communityId =
    typeof thread.communityId === "string" ? thread.communityId : null;
  const owner =
    communities.find((community) => community.id === communityId) ??
    (communityId == null
      ? communities.find((community) => community.slug === "ait")
      : undefined);
  if (!owner) return null;
  const path = forumThreadSitemapPath(
    { slug, communityId: owner.id },
    new Map(communities.map((community) => [community.id, community.slug])),
  );
  if (!path) return null;
  const score =
    typeof thread.replyCount === "number" && thread.replyCount > 0
      ? thread.replyCount
      : 0;
  return {
    communityId: owner.id,
    title,
    path: digestPagePath(path),
    kind: "thread",
    score,
  };
}

export function feedHighlight(
  post: {
    id?: unknown;
    content?: unknown;
    communityId?: unknown;
    likeCount?: unknown;
    commentCount?: unknown;
    isDeleted?: unknown;
    hiddenAt?: unknown;
    video?: { key?: string | null } | null;
    linkPreview?: { title?: string | null } | null;
  },
  communities: readonly CommunityRef[],
): HighlightCandidate | null {
  if (post.isDeleted === true || post.hiddenAt) return null;
  const communityId =
    typeof post.communityId === "string" ? post.communityId : null;
  const owner = communities.find((community) => community.id === communityId);
  if (!owner) return null;
  const preview = textOf(post.linkPreview?.title);
  const title = oneLine(preview.length > 0 ? preview : textOf(post.content));
  if (!title) return null;
  const likes = typeof post.likeCount === "number" ? post.likeCount : 0;
  const comments =
    typeof post.commentCount === "number" ? post.commentCount : 0;
  const video = Boolean(post.video?.key) && post.id != null;
  const path = video
    ? `/communities/${encodeURIComponent(owner.slug)}/reels?v=${encodeURIComponent(String(post.id))}`
    : `/communities/${encodeURIComponent(owner.slug)}`;
  return {
    communityId: owner.id,
    title,
    path: digestPagePath(path),
    kind: "post",
    score: Math.max(likes, comments),
  };
}

export function eventItem(
  event: UpcomingEventCandidate,
): DigestEventItem | null {
  if (!event.slug || !event.title) return null;
  const when = event.date.slice(0, 10);
  return {
    title: event.title,
    path: digestPagePath(`/events/${encodeURIComponent(event.slug)}`),
    when,
  };
}

export function jobItem(job: DigestJobCandidate): DigestJobItem | null {
  if (!job.slug || !job.title || !job.company) return null;
  return {
    title: job.title,
    path: digestPagePath(`/jobs/${encodeURIComponent(job.slug)}`),
    company: job.company,
  };
}

export function startupItem(
  project: LaunchpadCandidate,
): DigestStartupItem | null {
  if (!project.slug || !project.title) return null;
  return {
    title: project.title,
    path: digestPagePath(`/launchpad/${encodeURIComponent(project.slug)}`),
    votes: project.voteCount,
  };
}
