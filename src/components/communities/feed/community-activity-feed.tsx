"use client";

import { useState } from "react";
import { Loader2, MessageSquarePlus } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/trpc/react";
import { ActivityRow } from "./activity-row";
import { FeedPostCard } from "./feed-post-card";

type FeedMemberRole = "owner" | "admin" | "moderator" | "member" | null;

/**
 * The Overview stream: pinned posts, then posts, questions, ideas, events,
 * and new members in time order. Loads page by page with a cursor.
 */
export function CommunityActivityFeed({
  slug,
  currentUserId,
  memberRole,
}: {
  slug: string;
  currentUserId?: string;
  memberRole?: FeedMemberRole;
}) {
  const t = useTranslations("communities.feed");
  const utils = api.useUtils();
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
  } = api.feed.getActivity.useInfiniteQuery(
    { communitySlug: slug, limit: 15 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const refresh = () => {
    void utils.feed.getActivity.invalidate({ communitySlug: slug });
  };
  const toggleComments = (postId: number) => {
    setOpenComments((current) => {
      const next = new Set(current);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  if (isLoading) return <FeedSkeleton />;
  if (isError && !data) {
    return <ErrorState title={t("loadError")} onRetry={() => void refetch()} />;
  }

  const pinned = data?.pages[0]?.pinned ?? [];
  const items = data?.pages.flatMap((page) => page.items) ?? [];

  if (pinned.length === 0 && items.length === 0) {
    return (
      <EmptyState
        title={t("emptyTitle")}
        description={t("emptyHelp")}
        action={
          <Button asChild variant="outline" size="sm">
            <Link href={`/communities/${slug}/forum` as never}>
              <MessageSquarePlus aria-hidden="true" />
              {t("emptyAction")}
            </Link>
          </Button>
        }
      />
    );
  }

  const postCard = (post: (typeof pinned)[number]) => (
    <FeedPostCard
      key={`post-${post.id}`}
      post={post}
      currentUserId={currentUserId}
      memberRole={memberRole}
      communitySlug={slug}
      onRefresh={refresh}
      onToggleComments={toggleComments}
      showComments={openComments.has(post.id)}
    />
  );

  return (
    <div data-community-activity="" className="flex flex-col gap-3">
      {pinned.map(postCard)}
      {items.map((item) =>
        item.kind === "post" ? (
          postCard(item.post)
        ) : (
          <ActivityRow key={item.key} item={item} slug={slug} />
        ),
      )}
      {hasNextPage ? (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void fetchNextPage()}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : null}
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function FeedSkeleton() {
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
