"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Clapperboard, Loader2, LogIn } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { isCommunityVideosEnabled } from "@/lib/community-videos-flag";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { PostComposer } from "./post-composer";
import { FeedPostCard } from "./feed-post-card";
import { CommunitySidebar } from "./community-sidebar";
import { TopicChips } from "./topic-chips";
import { CommunityActivityFeed, FeedSkeleton } from "./community-activity-feed";
import { WelcomeChecklist } from "@/components/communities/onboarding/welcome-checklist";
import { HubFirstSessionPath } from "@/components/communities/first-session-path";

interface FeedPageProps {
  slug: string;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
  currentUserId?: string;
  feedPostPolicy: "all_members" | "admins_only";
}

export function FeedPage({
  slug,
  memberRole,
  currentUserId,
  feedPostPolicy,
}: FeedPageProps) {
  const t = useTranslations("communities.feed");
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

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
      {/* Left column: composer + feed */}
      <div className="min-w-0 flex-1 space-y-4">
        {isAuthenticated && isMember && (
          <HubFirstSessionPath slug={slug} isMember={isMember} />
        )}
        {isAuthenticated && isMember && <WelcomeChecklist slug={slug} />}

        <ReelsEntry slug={slug} />

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
        ) : activeTopic === "all" ? (
          <CommunityActivityFeed
            slug={slug}
            currentUserId={currentUserId}
            memberRole={memberRole}
          />
        ) : (
          <TopicPostsFeed
            slug={slug}
            topicSlug={activeTopic}
            currentUserId={currentUserId}
            memberRole={memberRole}
          />
        )}
      </div>

      {/* Right column: sidebar (desktop) — sticks below the community nav */}
      <div className="hidden w-80 shrink-0 lg:sticky lg:top-24 lg:block lg:self-start">
        <CommunitySidebar slug={slug} />
      </div>

      {/* Sidebar (mobile, below feed) */}
      <div className="lg:hidden">
        <CommunitySidebar slug={slug} />
      </div>
    </div>
  );
}

/**
 * The way into Reels mode, for members and visitors alike. It shows only when
 * the community has at least one video this viewer may watch (`getReels`
 * already filters by viewer), so it never leads to an empty screen.
 */
function ReelsEntry({ slug }: { slug: string }) {
  const t = useTranslations("communities.reels");
  const enabled = isCommunityVideosEnabled();
  const { data } = api.feed.getReels.useQuery(
    { communitySlug: slug, limit: 1 },
    { enabled },
  );
  if (!enabled || !data?.items.length) return null;
  return (
    <div className="flex justify-end">
      <Button asChild variant="outline" size="sm">
        <Link href={`/communities/${slug}/reels`}>
          <Clapperboard aria-hidden="true" />
          {t("open")}
        </Link>
      </Button>
    </div>
  );
}

/** Posts in one topic, newest first; loads page by page with a cursor. */
function TopicPostsFeed({
  slug,
  topicSlug,
  currentUserId,
  memberRole,
}: {
  slug: string;
  topicSlug: string;
  currentUserId?: string;
  memberRole?: FeedPageProps["memberRole"];
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
  } = api.feed.getFeed.useInfiniteQuery(
    { communitySlug: slug, topicSlug, limit: 20 },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  if (isLoading) return <FeedSkeleton />;
  if (isError && !data) return <ErrorState onRetry={() => void refetch()} />;
  const posts = data?.pages.flatMap((page) => page.posts) ?? [];
  if (posts.length === 0) return <EmptyState title={t("noPostsYet")} />;

  return (
    <div className="flex flex-col gap-3">
      {posts.map((post) => (
        <FeedPostCard
          key={post.id}
          post={post}
          currentUserId={currentUserId}
          memberRole={memberRole}
          communitySlug={slug}
          onRefresh={() => void utils.feed.getFeed.invalidate()}
          onToggleComments={(postId) =>
            setOpenComments((current) => {
              const next = new Set(current);
              if (next.has(postId)) next.delete(postId);
              else next.add(postId);
              return next;
            })
          }
          showComments={openComments.has(post.id)}
        />
      ))}
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
