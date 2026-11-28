"use client";

import { useId, useState, type ReactNode } from "react";
import { MessageSquarePlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadMore } from "@/components/ui/load-more";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionLabel } from "@/components/ui/section-label";
import { api, type RouterOutputs } from "@/trpc/react";
import { ActivityRow } from "./activity-row";
import { FeedPostCard } from "./feed-post-card";

type FeedMemberRole = "owner" | "admin" | "moderator" | "member" | null;
type Post = RouterOutputs["feed"]["getActivity"]["pinned"][number];

/**
 * The Overview stream: pinned posts, then posts, questions, ideas, events,
 * and new members in time order. Loads page by page with a cursor.
 */
export function CommunityActivityFeed({
  slug,
  currentUserId,
  memberRole,
  firstWeek = false,
  home,
}: {
  slug: string;
  currentUserId?: string;
  memberRole?: FeedMemberRole;
  firstWeek?: boolean;
  home?: {
    topic: string;
    topicLabels: ReadonlyMap<string, string>;
    resetTopic: () => void;
  };
}) {
  const t = useTranslations("communities.feed");
  const th = useTranslations("redesign.homeFeed");
  const utils = api.useUtils();
  const filteredTopic = home && home.topic !== "all" ? home.topic : undefined;
  const [openComments, setOpenComments] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = api.feed.getActivity.useInfiniteQuery(
    home ? { communitySlug: slug } : { communitySlug: slug, limit: 15 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const refresh = () => {
    const activity = utils.feed.getActivity.invalidate({ communitySlug: slug });
    // The home filters and the first-week checklist also read the post feed.
    return home || firstWeek
      ? Promise.all([
          activity,
          utils.feed.getFeed.invalidate(
            home ? { communitySlug: slug } : { communitySlug: slug, limit: 1 },
          ),
        ])
      : activity;
  };
  const toggleComments = (postId: number) => {
    setOpenComments((current) => {
      const next = new Set(current);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  if (!filteredTopic && isLoading) return <FeedSkeleton home={!!home} />;
  if (!filteredTopic && isError && !data) {
    return <ErrorState title={t("loadError")} onRetry={() => void refetch()} />;
  }

  const pinned = data?.pages[0]?.pinned ?? [];
  const items =
    data?.pages
      .flatMap((page) => page.items)
      .flatMap((item) => {
        if (!firstWeek || item.kind !== "joins") return [item];
        const members = item.members.filter(
          (member) => member.id !== currentUserId,
        );
        return members.length > 0 ? [{ ...item, members }] : [];
      }) ?? [];
  const showLatest = items.length > 0 || hasNextPage || isFetchNextPageError;
  const empty = pinned.length === 0 && items.length === 0 && !filteredTopic;

  if (firstWeek && empty && !showLatest) return null;

  if (empty && !firstWeek && !(home && showLatest)) {
    return (
      <EmptyState
        title={t("emptyTitle")}
        description={home ? th("emptyHelp") : t("emptyHelp")}
        action={
          <Button
            asChild
            variant="outline"
            size="sm"
            className={home ? "min-h-11 shadow-none" : undefined}
          >
            <Link href={`/communities/${slug}/forum` as never}>
              <MessageSquarePlus aria-hidden="true" />
              {t("emptyAction")}
            </Link>
          </Button>
        }
      />
    );
  }

  const postCard = (post: Post) => (
    <FeedPostCard
      key={`post-${post.id}`}
      post={post}
      currentUserId={currentUserId}
      memberRole={memberRole}
      communitySlug={slug}
      onRefresh={refresh}
      onToggleComments={toggleComments}
      showComments={openComments.has(post.id)}
      home={
        home
          ? { topicLabel: home.topicLabels.get(post.topicSlug ?? "") }
          : undefined
      }
    />
  );

  const stream = items.map((item) =>
    item.kind === "post" ? (
      postCard(item.post)
    ) : (
      <ActivityRow key={item.key} item={item} slug={slug} home={!!home} />
    ),
  );
  const pages = (
    <LoadMore
      query={{
        hasNextPage,
        isFetchingNextPage,
        isFetchNextPageError,
        fetchNextPage,
      }}
      label={t("loadMore")}
      skeleton={!!home}
    />
  );

  if (home) {
    return (
      <div
        data-community-activity=""
        tabIndex={-1}
        className="focus-visible:ring-ring/50 scroll-mt-20 space-y-6 rounded-sm outline-none focus-visible:ring-[3px]"
      >
        {filteredTopic ? (
          <FilteredPosts
            slug={slug}
            topic={filteredTopic}
            pinned={pinned.filter((post) => post.topicSlug === filteredTopic)}
            renderPost={postCard}
            resetTopic={home.resetTopic}
          />
        ) : (
          <>
            {pinned.length ? (
              <FeedSection title={t("pinned")}>
                {pinned.map(postCard)}
              </FeedSection>
            ) : null}
            {showLatest ? (
              <FeedSection title={th("latest")}>
                {stream}
                {pages}
              </FeedSection>
            ) : null}
          </>
        )}
      </div>
    );
  }

  return (
    <div data-community-activity="" className="flex flex-col gap-3">
      {pinned.map((post) => postCard(post))}
      {stream}
      {pages}
    </div>
  );
}

function FeedSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="space-y-2">
      <SectionLabel id={id} bordered={false}>
        {title}
      </SectionLabel>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function FilteredPosts({
  slug,
  topic,
  pinned,
  renderPost,
  resetTopic,
}: {
  slug: string;
  topic: string;
  pinned: readonly Post[];
  renderPost: (post: Post) => ReactNode;
  resetTopic: () => void;
}) {
  const t = useTranslations("communities.feed");
  const th = useTranslations("redesign.homeFeed");
  const query = api.feed.getFeed.useInfiniteQuery(
    { communitySlug: slug, topicSlug: topic, limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const pins = new Map(pinned.map((post) => [post.id, post]));
  const posts = query.data?.pages.flatMap((page) => page.posts) ?? [];
  for (const post of posts) {
    if (post.isPinned && !pins.has(post.id)) pins.set(post.id, post);
  }
  const latest = posts.filter((post) => !pins.has(post.id));
  const showLatest =
    latest.length > 0 || query.hasNextPage || query.isFetchNextPageError;
  return (
    <>
      {pins.size ? (
        <FeedSection title={t("pinned")}>
          {Array.from(pins.values(), renderPost)}
        </FeedSection>
      ) : null}
      {query.isLoading ? (
        <FeedSkeleton home />
      ) : query.isError && !query.data ? (
        <ErrorState
          title={t("loadError")}
          onRetry={() => void query.refetch()}
        />
      ) : showLatest ? (
        <FeedSection title={th("latest")}>
          {latest.map(renderPost)}
          <LoadMore query={query} label={t("loadMore")} skeleton />
        </FeedSection>
      ) : !pins.size ? (
        <EmptyState
          title={t("noPostsYet")}
          action={
            <Button
              variant="outline"
              className="min-h-11 shadow-none"
              onClick={resetTopic}
            >
              {th("showAllPosts")}
            </Button>
          }
        />
      ) : null}
    </>
  );
}

export function FeedSkeleton({ home = false }: { home?: boolean } = {}) {
  const t = useTranslations("common");
  if (home) {
    return (
      <div role="status" aria-label={t("loading")} className="space-y-2">
        <Skeleton className="h-4 w-20 motion-reduce:animate-none" />
        {Array.from({ length: 2 }, (_, index) => (
          <div
            key={index}
            className="border-border space-y-4 rounded-lg border p-4 sm:p-5"
          >
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-9 rounded-full motion-reduce:animate-none" />
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-28 motion-reduce:animate-none" />
                <Skeleton className="h-2.5 w-16 motion-reduce:animate-none" />
              </div>
            </div>
            <Skeleton className="h-6 w-2/3 motion-reduce:animate-none" />
            <div className="space-y-2">
              <Skeleton className="h-3 w-full motion-reduce:animate-none" />
              <Skeleton className="h-3 w-4/5 motion-reduce:animate-none" />
            </div>
            <div className="border-border flex gap-6 border-t pt-3">
              <Skeleton className="h-6 w-12 motion-reduce:animate-none" />
              <Skeleton className="h-6 w-24 motion-reduce:animate-none" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, index) => (
        <div
          key={index}
          className="border-border space-y-3 rounded-lg border p-4"
        >
          <div className="flex items-center gap-2.5">
            <Skeleton className="size-8 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-2.5 w-16" />
            </div>
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}
