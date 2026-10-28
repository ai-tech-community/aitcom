"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  AsciiScene,
  type AsciiSceneLayer,
} from "@/components/ascii/ascii-scene";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MoreLink } from "@/components/ui/more-link";
import { SectionLabel } from "@/components/ui/section-label";
import { SpaceAvatar } from "@/components/communities/rooms/space-avatar";
import { getInitials } from "@/lib/avatar";
import {
  pickHomeCommunities,
  type FeaturedCommunityCard,
} from "@/server/communities/featured";
import {
  COMMUNITY_STILL_TICK,
  communityHouseFrame,
  type CommunityLayer,
} from "@/components/ascii/community-house-scene";

const FRAME_MS = 160;

/** Same token colours as the town square: far, quiet scenery, people. */
const LAYERS: readonly AsciiSceneLayer<CommunityLayer>[] = [
  { name: "far", className: "text-muted-foreground/40" },
  { name: "scenery", className: "text-muted-foreground/70" },
  {
    name: "people",
    className:
      "text-foreground/85 transition-colors group-hover:text-foreground",
  },
];

/** Compact community gallery, with real membership and a small town-square scene. */
export function FeaturedCommunities({
  communities,
  embedded = false,
}: {
  communities: FeaturedCommunityCard[];
  embedded?: boolean;
}) {
  const t = useTranslations("featuredCommunities");
  const items = pickHomeCommunities(communities);
  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="featured-communities-title"
      className={embedded ? "min-w-0" : "px-6 py-10 sm:px-12"}
    >
      <SectionLabel id="featured-communities-title" className="pb-4">
        {t("title")}
      </SectionLabel>
      <ul
        className={`mt-5 grid grid-cols-2 gap-3 sm:gap-4 ${items.length > 4 ? "xl:grid-cols-3" : ""}`}
      >
        {items.map((community) => (
          <li key={community.slug} className="min-w-0">
            <CommunityCard
              community={community}
              members={t("membersCount", { count: community.memberCount })}
            />
          </li>
        ))}
      </ul>
      <div className="mt-4 text-right">
        <MoreLink href="/communities">{t("viewAll")}</MoreLink>
      </div>
    </section>
  );
}

function CommunityCard({
  community,
  members,
}: {
  community: FeaturedCommunityCard;
  members: string;
}) {
  const { slug, memberCount } = community;
  const id = `featured-community-${slug}`;
  const frame = useCallback(
    (tick: number, cols: number, rows: number) =>
      communityHouseFrame(slug, memberCount, cols, rows, tick),
    [slug, memberCount],
  );

  return (
    <Link
      href={`/communities/${slug}`}
      aria-labelledby={`${id}-name`}
      aria-describedby={`${id}-about`}
      className="group border-border hover:border-foreground/30 hover:bg-muted/40 focus-visible:ring-ring/50 flex h-full flex-col overflow-hidden rounded-xl border transition-colors outline-none focus-visible:ring-[3px]"
    >
      <AsciiScene
        layers={LAYERS}
        frame={frame}
        frameMs={FRAME_MS}
        staticTick={COMMUNITY_STILL_TICK}
        minRows={4}
        data-testid={`community-art-${slug}`}
        className="border-border bg-muted/30 h-16 shrink-0 border-b font-mono text-[10px] leading-3 sm:h-24"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-3 sm:p-4">
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
          {community.logoUrl ? (
            <Avatar size="default" className="size-9 shrink-0 rounded-md">
              <AvatarImage src={community.logoUrl} alt="" />
              <AvatarFallback>{getInitials(community.name)}</AvatarFallback>
            </Avatar>
          ) : (
            <SpaceAvatar name={community.name} />
          )}
          <span
            id={`${id}-name`}
            className="line-clamp-2 min-w-0 flex-1 text-base leading-snug font-semibold break-words"
          >
            {community.name}
          </span>
        </div>
        <div id={`${id}-about`} className="flex flex-1 flex-col gap-3">
          {community.description ? (
            <p className="text-muted-foreground line-clamp-2 text-sm leading-relaxed break-words">
              {community.description}
            </p>
          ) : null}
          <span className="text-muted-foreground mt-auto font-mono text-xs">
            {members}
          </span>
        </div>
      </div>
    </Link>
  );
}
