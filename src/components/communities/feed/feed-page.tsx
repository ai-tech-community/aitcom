"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PostComposer } from "./post-composer";
import { FeedPostCard } from "./feed-post-card";
import { FeedComments } from "./feed-comments";
import { CommunitySidebar } from "./community-sidebar";

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
  const [expandedComments, setExpandedComments] = useState<Set<number>>(new Set());
  const [limit, setLimit] = useState(20);

  const canPost =
    feedPostPolicy === "all_members"
      ? !!memberRole
      : memberRole === "owner" || memberRole === "admin" || memberRole === "moderator";

  const { data, isFetching, refetch } = api.feed.getFeed.useQuery({
    communitySlug: slug,
    limit,
  });

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
    <div className="flex flex-col gap-8 lg:h-full lg:flex-row">
      {/* Left column: composer + feed */}
      <div className="min-w-0 flex-1 space-y-4 lg:overflow-y-auto">
        <PostComposer slug={slug} canPost={canPost} />

        {isFetching && posts.length === 0 ? (
          <div className="flex justify-center py-8">
            <Loader2 className="text-muted-foreground size-5 animate-spin" />
          </div>
        ) : posts.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center font-mono text-xs tracking-wider">
            {t("noPostsYet")}
          </p>
        ) : (
          <>
            {posts.map((post) => (
              <div key={post.id} className="space-y-2">
                <FeedPostCard
                  post={post}
                  currentUserId={currentUserId}
                  memberRole={memberRole}
                  communitySlug={slug}
                  onRefresh={handleRefresh}
                  onToggleComments={handleToggleComments}
                  showComments={expandedComments.has(post.id)}
                />
                {expandedComments.has(post.id) && (
                  <FeedComments
                    postId={post.id}
                    communitySlug={slug}
                    currentUserId={currentUserId}
                    memberRole={memberRole}
                  />
                )}
              </div>
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

      {/* Right column: sidebar (desktop) */}
      <div className="hidden w-80 shrink-0 lg:block lg:overflow-y-auto">
        <CommunitySidebar slug={slug} description={communityDescription} />
      </div>

      {/* Sidebar (mobile, below feed) */}
      <div className="lg:hidden">
        <CommunitySidebar slug={slug} description={communityDescription} />
      </div>
    </div>
  );
}
