"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { PostComposer } from "./post-composer";
import { FeedPostCard } from "./feed-post-card";
import { CommunitySidebar } from "./community-sidebar";
import { TopicChips } from "./topic-chips";
import { WelcomeChecklist } from "@/components/communities/onboarding/welcome-checklist";

interface FeedPageProps {
  slug: string;
  communityDescription?: string | null;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
  currentUserId?: string;
  feedPostPolicy: "all_members" | "admins_only";
}

export function FeedPage({
  slug,
  communityDescription,
  memberRole,
  currentUserId,
  feedPostPolicy,
}: FeedPageProps) {
  const t = useTranslations("communities.feed");
  const [expandedComments, setExpandedComments] = useState<Set<number>>(
    new Set(),
  );
  const [limit, setLimit] = useState(20);
  const [activeTopic, setActiveTopic] = useState("all");

  const canPost =
    feedPostPolicy === "all_members"
      ? !!memberRole
      : memberRole === "owner" ||
        memberRole === "admin" ||
        memberRole === "moderator";

  const { promptAuth } = useRequireAuth();
  const isAuthenticated = !!currentUserId;
  const isMember = !!memberRole;
  const { data, isFetching, isError, refetch } = api.feed.getFeed.useQuery(
    {
      communitySlug: slug,
      limit,
      topicSlug: activeTopic,
    },
    { enabled: isAuthenticated && isMember },
  );

  const posts = (data?.posts ?? []) as Array<{
    id: number;
    content: string;
    imageUrl?: string | null;
    authorId: string;
    authorName?: string | null;
    authorImage?: string | null;
    communityId: string;
    likeCount?: number | null;
    commentCount?: number | null;
    isDeleted?: boolean | null;
    isEdited?: boolean | null;
    editedAt?: string | null;
    createdAt: string;
    hasLiked: boolean;
    isPinned?: boolean | null;
    topicSlug?: string | null;
  }>;

  const hasMore = !!data?.nextCursor;

  const handleToggleComments = (postId: number) => {
    setExpandedComments((prev) => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  };

  const handleRefresh = () => {
    void refetch();
  };

  const handleLoadMore = () => {
    setLimit((prev) => prev + 20);
  };

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      {/* Left column: composer + feed */}
      <div className="min-w-0 flex-1 space-y-4">
        {isAuthenticated && isMember && <WelcomeChecklist slug={slug} />}

        <PostComposer slug={slug} canPost={canPost} />

        {isAuthenticated && isMember ? (
          <TopicChips
            slug={slug}
            active={activeTopic}
            onSelect={setActiveTopic}
          />
        ) : null}

        {!isAuthenticated ? (
          <div className="bg-primary/5 border-primary/20 flex flex-col items-start gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="font-medium">{t("signInTitle")}</h2>
              <p className="text-muted-foreground text-sm">
                {t("signInDescription")}
              </p>
            </div>
            <Button
              onClick={() => promptAuth("Sign in to see the community feed")}
            >
              <LogIn className="h-4 w-4" /> Sign in
            </Button>
          </div>
        ) : !isMember ? (
          <div className="bg-primary/5 border-primary/20 rounded-md border p-4">
            <h2 className="font-medium">{t("joinTitle")}</h2>
            <p className="text-muted-foreground text-sm">
              {t("joinDescription")}
            </p>
          </div>
        ) : isFetching && posts.length === 0 ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
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
        ) : isError && posts.length === 0 ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : posts.length === 0 ? (
          <EmptyState title={t("noPostsYet")} />
        ) : (
          <>
            {posts.map((post) => (
              <FeedPostCard
                key={post.id}
                post={post}
                currentUserId={currentUserId}
                memberRole={memberRole}
                communitySlug={slug}
                onRefresh={handleRefresh}
                onToggleComments={handleToggleComments}
                showComments={expandedComments.has(post.id)}
              />
            ))}

            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLoadMore}
                  disabled={isFetching}
                >
                  {isFetching ? (
                    <Loader2 className="mr-2 size-4 animate-spin" />
                  ) : null}
                  {t("loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Right column: sidebar (desktop) — sticks below the community nav */}
      <div className="hidden w-80 shrink-0 lg:sticky lg:top-24 lg:block lg:self-start">
        <CommunitySidebar slug={slug} description={communityDescription} />
      </div>

      {/* Sidebar (mobile, below feed) */}
      <div className="lg:hidden">
        <CommunitySidebar slug={slug} description={communityDescription} />
      </div>
    </div>
  );
}
