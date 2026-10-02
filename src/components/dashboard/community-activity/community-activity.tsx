"use client";

import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { api, type RouterOutputs } from "@/trpc/react";
import { getInitials } from "@/lib/avatar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DashboardSection,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";
import { ActivityRow } from "@/components/communities/feed/activity-row";
import { FeedSkeleton } from "@/components/communities/feed/community-activity-feed";
import { FeedPostCard } from "@/components/communities/feed/feed-post-card";

type HomeItem = RouterOutputs["feed"]["getHomeActivity"]["items"][number];

const PAGE_SIZE = 15;

function CommunityActivityEmpty({
  hasCommunities,
}: {
  hasCommunities: boolean;
}) {
  const t = useTranslations("dashboard.communityActivity");
  return (
    <p className="text-muted-foreground text-sm text-pretty">
      {hasCommunities ? t("quiet") : t("noCommunities")}{" "}
      <Link
        href="/communities"
        className="text-foreground focus-visible:ring-ring/50 group inline-flex items-center gap-1 rounded-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px]"
      >
        {hasCommunities ? t("quietLink") : t("noCommunitiesLink")}
        <ArrowRight
          aria-hidden
          className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        />
      </Link>
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
        <AvatarFallback className="rounded-md text-[0.625rem]">
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
 * community. Pages with "Load more".
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
  const query = api.feed.getHomeActivity.useInfiniteQuery(
    { limit: PAGE_SIZE },
    { getNextPageParam: (last) => last.nextCursor ?? undefined },
  );

  const items = query.data?.pages.flatMap((page) => page.items) ?? [];
  const hasCommunities = query.data?.pages[0]?.hasCommunities ?? false;
  const refresh = () => utils.feed.getHomeActivity.invalidate();
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
      empty={<CommunityActivityEmpty hasCommunities={hasCommunities} />}
    >
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
                onToggleComments={toggleComments}
                showComments={openComments.has(item.post.id)}
              />
            ) : (
              <ActivityRow item={item} slug={item.community.slug} />
            )}
          </li>
        ))}
      </ul>
      {query.hasNextPage ? (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
          >
            {query.isFetchingNextPage ? (
              <Loader2 aria-hidden="true" className="animate-spin" />
            ) : null}
            {t("loadMore")}
          </Button>
        </div>
      ) : null}
    </DashboardSection>
  );
}
