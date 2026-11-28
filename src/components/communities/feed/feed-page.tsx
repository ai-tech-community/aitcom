"use client";

import { useState, type ReactNode } from "react";
import { canBroadcast } from "@/lib/community-broadcast";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Clapperboard, Loader2, LogIn } from "lucide-react";
import { Link } from "@/i18n/navigation";
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
import { CommunityAbout } from "@/components/communities/community-about";

interface FeedPageProps {
  slug: string;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
  currentUserId?: string;
  feedPostPolicy: "all_members" | "admins_only";
  feedFirst?: boolean;
  composerTextareaId?: string;
  renderFirstWeek?: (composer: ReactNode) => ReactNode;
}

export function FeedPage({
  slug,
  memberRole,
  currentUserId,
  feedPostPolicy,
  feedFirst = false,
  composerTextareaId,
  renderFirstWeek,
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
  const firstWeek = !!renderFirstWeek;
  const composer = currentUserId ? (
    <PostComposer
      slug={slug}
      userId={currentUserId}
      canPost={canPost}
      canAnnounce={canBroadcast(memberRole)}
      textareaId={composerTextareaId}
      neutralSubmit={firstWeek}
    />
  ) : null;

  const about = (
    <CommunityAbout
      slug={slug}
      className={firstWeek ? undefined : "xl:col-start-2 xl:row-start-1 xl:mb-8"}
    />
  );

  // The first-week stream uses the whole content column. The usual wide
  // layout places About and the sticky side panel beside the stream.
  const feed = (
    <div
      className={cn(
        "grid grid-cols-1 gap-8",
        !firstWeek &&
          "xl:grid-cols-[minmax(0,1fr)_20rem] xl:grid-rows-[auto_1fr] xl:gap-y-0",
      )}
    >
      {feedFirst ? null : about}

      {/* Main column: composer + feed */}
      <div
        className={cn(
          "min-w-0 space-y-4",
          !firstWeek && "xl:col-start-1 xl:row-span-2 xl:row-start-1",
        )}
      >
        {isAuthenticated && isMember && (
          <HubFirstSessionPath slug={slug} isMember={isMember} />
        )}
        {isAuthenticated && isMember && <WelcomeChecklist slug={slug} />}

        <ReelsEntry slug={slug} />

        {!firstWeek && composer}

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
            <Button onClick={() => promptAuth(t("signInTitle"))}>
              <LogIn className="h-4 w-4" /> {t("signIn")}
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
            firstWeek={firstWeek}
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

      {feedFirst ? about : null}

      {/* Side panel: beside the feed from `xl`, under About (the community
        rail takes the left), below the feed on narrower screens. */}
      <div
        data-feed-side-panel=""
        className={cn(
          !firstWeek &&
            "xl:sticky xl:top-24 xl:col-start-2 xl:row-start-2 xl:max-h-[calc(100dvh-7rem)] xl:self-start xl:overflow-y-auto xl:overscroll-contain xl:[scrollbar-width:thin]",
        )}
      >
        <CommunitySidebar slug={slug} hideEmptyNews={firstWeek} />
      </div>
    </div>
  );

  return (
    <>
      {renderFirstWeek?.(composer)}
      {feed}
    </>
  );
}

/**
 * The way into Reels mode, for members and visitors alike. It shows only when
 * the community has at least one video this viewer may watch (`getReels`
 * already filters by viewer), so it never leads to an empty screen.
 */
function ReelsEntry({ slug }: { slug: string }) {
  const t = useTranslations("communities.reels");
  const { data } = api.feed.getReels.useQuery({
    communitySlug: slug,
    limit: 1,
  });
  if (!data?.items.length) return null;
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
          onRefresh={() => utils.feed.getFeed.invalidate()}
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
