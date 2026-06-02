"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Loader2, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { PostComposer } from "./post-composer";
import { FeedPostCard } from "./feed-post-card";
import { CommunitySidebar } from "./community-sidebar";
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

  const canPost =
    feedPostPolicy === "all_members"
      ? !!memberRole
      : memberRole === "owner" ||
        memberRole === "admin" ||
        memberRole === "moderator";

  const { promptAuth } = useRequireAuth();
  const isAuthenticated = !!currentUserId;
  const isMember = !!memberRole;
  const { data, isFetching, refetch } = api.feed.getFeed.useQuery(
    {
      communitySlug: slug,
      limit,
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

        {!isAuthenticated ? (
          <div className="bg-primary/5 border-primary/20 flex flex-col items-start gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-1">
              <h2 className="font-medium">Sign in to see the community feed</h2>
              <p className="text-muted-foreground text-sm">
                Posts in this community are visible to members.
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
            <h2 className="font-medium">Join this community to see the feed</h2>
            <p className="text-muted-foreground text-sm">
              Posts in this community are visible to members only.
            </p>
          </div>
        ) : isFetching && posts.length === 0 ? (
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
