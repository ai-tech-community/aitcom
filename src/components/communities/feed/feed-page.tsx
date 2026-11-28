"use client";

import { useRef, useState, type ReactNode } from "react";
import { canBroadcast } from "@/lib/community-broadcast";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import {
  ArrowDown,
  Clapperboard,
  Loader2,
  LockKeyhole,
  LogIn,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { useRequireAuth } from "@/components/auth/auth-required-dialog";
import { PostComposer, type PostComposerDisclosure } from "./post-composer";
import { FeedPostCard } from "./feed-post-card";
import { CommunitySidebar } from "./community-sidebar";
import { TopicChips, TopicChipsView } from "./topic-chips";
import { CommunityActivityFeed, FeedSkeleton } from "./community-activity-feed";
import { WelcomeChecklist } from "@/components/communities/onboarding/welcome-checklist";
import { HubFirstSessionPath } from "@/components/communities/first-session-path";
import { CommunityAbout } from "@/components/communities/community-about";
import { topicLabel } from "@/lib/communities/topic-label";
import type { HubAuthUser } from "@/server/better-auth/hub-session";

interface FeedPageProps {
  slug: string;
  memberRole?: "owner" | "admin" | "moderator" | "member" | null;
  user?: HubAuthUser | null;
  feedPostPolicy: "all_members" | "admins_only";
  feedFirst?: boolean;
  home?: { communityName: string; liveness?: ReactNode };
  composerTextareaId?: string;
  renderFirstWeek?: (disclosure: PostComposerDisclosure) => ReactNode;
}

export function FeedPage({
  slug,
  memberRole,
  user,
  feedPostPolicy,
  feedFirst = false,
  home,
  composerTextareaId,
  renderFirstWeek,
}: FeedPageProps) {
  const t = useTranslations("communities.feed");
  const th = useTranslations("redesign.homeFeed");
  const { promptAuth } = useRequireAuth();
  const [activeTopic, setActiveTopic] = useState("all");
  const heading = useRef<HTMLHeadingElement>(null);
  const currentUserId = user?.id;
  const isAuthenticated = !!currentUserId;
  const isMember = !!memberRole;
  const firstWeek = !!renderFirstWeek;
  const canPost =
    feedPostPolicy === "all_members"
      ? isMember
      : canBroadcast(memberRole) || memberRole === "moderator";
  const {
    data: homeTopics,
    isLoading: topicsLoading,
    isError: topicsFailed,
  } = api.topics.list.useQuery(
    { communitySlug: slug },
    { enabled: !!home && isAuthenticated && isMember },
  );
  const showTopicChips =
    !topicsFailed && homeTopics !== undefined && homeTopics.length >= 2;
  const topicLabels = new Map(
    homeTopics?.map((topic) => [topic.slug, topicLabel(topic)]),
  );
  const currentTopic =
    showTopicChips && topicLabels.has(activeTopic) ? activeTopic : "all";

  const composer =
    user && canPost ? (
      <PostComposer
        key={user.id}
        slug={slug}
        userId={user.id}
        canPost
        canAnnounce={canBroadcast(memberRole)}
        textareaId={composerTextareaId}
        neutralSubmit={firstWeek}
        renderDisclosure={renderFirstWeek}
        home={
          home
            ? {
                communityName: home.communityName,
                authorName: user.name,
                authorImage: user.image,
              }
            : undefined
        }
      />
    ) : null;

  const activity = (
    <CommunityActivityFeed
      slug={slug}
      currentUserId={currentUserId}
      memberRole={memberRole}
      firstWeek={firstWeek}
      home={
        home
          ? {
              topic: currentTopic,
              topicLabels,
              resetTopic: () => {
                setActiveTopic("all");
                heading.current?.focus();
              },
            }
          : undefined
      }
    />
  );

  const about = (
    <CommunityAbout
      slug={slug}
      showMemberCount={!!home}
      className={
        home || firstWeek ? undefined : "xl:col-start-2 xl:row-start-1 xl:mb-8"
      }
    />
  );

  const onboarding = isAuthenticated && isMember && (
    <>
      <HubFirstSessionPath slug={slug} isMember secondary={!!home} />
      <WelcomeChecklist slug={slug} secondary={!!home} />
    </>
  );
  const reels = <ReelsEntry slug={slug} secondary={!!home} />;
  const sidebar = (
    <CommunitySidebar slug={slug} home={!!home} hideEmptyNews={firstWeek} />
  );

  const homeFeed = home ? (
    <div
      data-community-home-feed=""
      className="mx-auto grid w-full max-w-[71rem] items-start gap-x-8 gap-y-10 xl:grid-cols-[minmax(0,1fr)_17rem] 2xl:gap-x-12"
    >
      <section aria-labelledby="community-feed-heading" className="min-w-0">
        <header className="border-border mb-4 flex flex-wrap items-center justify-between gap-x-2 border-b pb-3 sm:mb-5 sm:pb-4">
          <h1
            ref={heading}
            id="community-feed-heading"
            tabIndex={-1}
            className="font-community-heading focus-visible:ring-ring/50 scroll-mt-20 rounded-sm text-3xl leading-tight font-semibold tracking-[-0.035em] outline-none focus-visible:ring-[3px] sm:text-4xl"
          >
            {th("title")}
          </h1>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="text-muted-foreground min-h-11 px-2 xl:hidden"
          >
            <a href="#community-feed-details">
              {th("details")}
              <ArrowDown aria-hidden="true" className="size-3.5" />
            </a>
          </Button>
        </header>

        {isMember && user ? (
          <div className="space-y-5">
            {!canPost ? (
              <p className="border-border text-muted-foreground flex items-center gap-2 rounded-lg border p-3 text-sm">
                <LockKeyhole aria-hidden="true" className="size-4 shrink-0" />
                {th("readOnly")}
              </p>
            ) : firstWeek ? null : (
              composer
            )}

            {topicsLoading ? (
              <Skeleton className="h-11 w-full max-w-96 lg:h-8" />
            ) : showTopicChips ? (
              <div className="space-y-1.5">
                <SectionLabel as="div" bordered={false} aria-hidden="true">
                  {th("topics")}
                </SectionLabel>
                <TopicChipsView
                  topics={homeTopics}
                  active={currentTopic}
                  onSelect={setActiveTopic}
                  scrollOnMobile
                />
              </div>
            ) : null}

            {activity}
          </div>
        ) : (
          <div className="border-border space-y-2 rounded-lg border p-4">
            <h2 className="font-semibold">
              {t(user ? "joinTitle" : "signInTitle")}
            </h2>
            <p className="text-muted-foreground text-sm">
              {t(user ? "joinDescription" : "signInDescription")}
            </p>
            {!user ? (
              <Button
                variant="ink"
                className="min-h-11"
                onClick={() => promptAuth(t("signInTitle"))}
              >
                <LogIn aria-hidden="true" /> {t("signIn")}
              </Button>
            ) : null}
          </div>
        )}
      </section>

      <aside
        id="community-feed-details"
        tabIndex={-1}
        aria-label={th("details")}
        data-feed-side-panel=""
        className="border-border focus-visible:ring-ring/50 min-w-0 scroll-mt-24 space-y-6 border-t pt-5 focus-visible:ring-[3px] xl:border-s xl:border-t-0 xl:ps-6 xl:pt-0"
      >
        {about}
        {home.liveness}
        <div className="space-y-4 [&:empty]:hidden">{onboarding}</div>
        {reels}
        {sidebar}
      </aside>
    </div>
  ) : null;

  const legacyFeed = !home ? (
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
        {onboarding}

        {reels}

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
          activity
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
        {sidebar}
      </div>
    </div>
  ) : null;

  return (
    <>
      {firstWeek && (
        <div className={home ? "mx-auto w-full max-w-[71rem]" : undefined}>
          {composer}
        </div>
      )}
      {homeFeed ?? legacyFeed}
    </>
  );
}

/**
 * The way into Reels mode, for members and visitors alike. It shows only when
 * the community has at least one video this viewer may watch (`getReels`
 * already filters by viewer), so it never leads to an empty screen.
 */
function ReelsEntry({
  slug,
  secondary = false,
}: {
  slug: string;
  secondary?: boolean;
}) {
  const t = useTranslations("communities.reels");
  const th = useTranslations("redesign.homeFeed");
  const { data } = api.feed.getReels.useQuery({
    communitySlug: slug,
    limit: 1,
  });
  if (!data?.items.length) return null;
  if (secondary) {
    return (
      <section>
        <SectionLabel>{t("open")}</SectionLabel>
        <Button asChild variant="ghost" className="min-h-11 justify-start px-0">
          <Link href={`/communities/${slug}/reels`}>
            <Clapperboard aria-hidden="true" />
            {th("watchReels")}
          </Link>
        </Button>
      </section>
    );
  }
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
