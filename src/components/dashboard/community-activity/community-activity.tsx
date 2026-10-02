"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { api, type RouterOutputs } from "@/trpc/react";
import { getInitials } from "@/lib/avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadMore } from "@/components/ui/load-more";
import {
  DashboardSection,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { ActivityRow } from "@/components/communities/feed/activity-row";
import { FeedSkeleton } from "@/components/communities/feed/community-activity-feed";
import {
  FeedPostCard,
  type FeedPostChange,
} from "@/components/communities/feed/feed-post-card";

import { removePost, setPostLike } from "./home-activity-cache";

type HomeItem = RouterOutputs["feed"]["getHomeActivity"]["items"][number];

const PAGE_SIZE = 15;

function CommunitiesLink({ children }: { children: React.ReactNode }) {
  return (
    <Link
      href="/communities"
      className="text-foreground focus-visible:ring-ring/50 group inline-flex items-center gap-1 rounded-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px]"
    >
      {children}
      <ArrowRight
        aria-hidden
        className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
      />
    </Link>
  );
}

/**
 * Nothing to show yet: an invitation to join a first community, or, for a
 * member who has joined some, a note that it is quiet and where to look.
 */
function CommunityActivityEmpty({
  hasJoinedCommunities,
}: {
  hasJoinedCommunities: boolean;
}) {
  const t = useTranslations("dashboard.communityActivity");
  return hasJoinedCommunities ? (
    <EmptyState
      className="px-0 py-8"
      title={t("quietTitle")}
      description={t("quietDescription")}
      action={<CommunitiesLink>{t("exploreCommunities")}</CommunitiesLink>}
    />
  ) : (
    <EmptyState
      className="px-0 py-8"
      title={t("notJoinedTitle")}
      description={t("notJoinedDescription")}
      action={<CommunitiesLink>{t("findCommunity")}</CommunitiesLink>}
    />
  );
}

/**
 * Above a stream that only has Hub news: a member who has not joined any
 * other community yet gets one line pointing them to the directory.
 */
function JoinPrompt() {
  const t = useTranslations("dashboard.communityActivity");
  return (
    <p className="text-muted-foreground mb-4 text-sm text-pretty">
      {t("notJoinedTitle")}{" "}
      <CommunitiesLink>{t("findCommunity")}</CommunitiesLink>
    </p>
  );
}

/** Which community an entry comes from: its logo and name, as a link. */
function CommunityLabel({ community }: { community: HomeItem["community"] }) {
  return (
    <Link
      href={`/communities/${community.slug}` as never}
      className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 inline-flex max-w-full min-w-0 items-center gap-1.5 self-start rounded-sm text-xs font-medium transition-colors outline-none focus-visible:ring-[3px]"
    >
      <Avatar aria-hidden className="size-5 rounded-md">
        {community.logoUrl ? (
          <AvatarImage src={community.logoUrl} alt="" />
        ) : null}
        <AvatarFallback className="rounded-md text-xs">
          {getInitials(community.name)}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{community.name}</span>
    </Link>
  );
}

/**
 * Home's second section: what is happening across the member's communities
 * (feed.getHomeActivity), newest first. Each entry is the same post card or
 * activity row the community Overview shows, under a label naming its
 * community. Pages with "Load more". Hub news counts as community news, so
 * a member who has joined nothing else yet still sees a stream, with a
 * prompt above it to find a community.
 */
export function CommunityActivity({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const t = useTranslations("dashboard.communityActivity");
  const utils = api.useUtils();
  const [openComments, setOpenComments] = useState<ReadonlySet<number>>(
    new Set(),
  );
  const input = { limit: PAGE_SIZE };
  const query = api.feed.getHomeActivity.useInfiniteQuery(input, {
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const hasJoinedCommunities =
    query.data?.pages[0]?.hasJoinedCommunities ?? false;
  const refresh = () => utils.feed.getHomeActivity.invalidate();
  // Likes and deletes change one entry in place; anything else (pins, an
  // expired video link) refetches.
  const applyChange = (change: FeedPostChange) => {
    utils.feed.getHomeActivity.setInfiniteData(input, (data) =>
      change.kind === "liked"
        ? setPostLike(data, change.postId, change)
        : removePost(data, change.postId),
    );
  };
  const toggleComments = (postId: number) => {
    setOpenComments((current) => {
      const next = new Set(current);
      if (next.has(postId)) next.delete(postId);
      else next.add(postId);
      return next;
    });
  };

  return (
    <DashboardSection
      title={t("title")}
      status={statusFromQueries(query, { isEmpty: items.length === 0 })}
      skeleton={<FeedSkeleton />}
      empty={
        <CommunityActivityEmpty hasJoinedCommunities={hasJoinedCommunities} />
      }
    >
      {!hasJoinedCommunities && <JoinPrompt />}
      <ul className="flex flex-col gap-5">
        {items.map((item) => (
          <li key={item.key} className="flex flex-col gap-2">
            <CommunityLabel community={item.community} />
            {item.kind === "post" ? (
              <FeedPostCard
                post={item.post}
                currentUserId={currentUserId}
                memberRole={item.community.viewerRole}
                communitySlug={item.community.slug}
                onRefresh={refresh}
                onPostChange={applyChange}
                onToggleComments={toggleComments}
                showComments={openComments.has(item.post.id)}
              />
            ) : (
              <ActivityRow item={item} slug={item.community.slug} />
            )}
          </li>
        ))}
      </ul>
      <LoadMore query={query} label={t("loadMore")} className="pt-4" />
    </DashboardSection>
  );
}
