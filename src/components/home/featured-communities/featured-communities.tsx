"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  AsciiScene,
  type AsciiSceneLayer,
} from "@/components/ascii/ascii-scene";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SectionLabel } from "@/components/ui/section-label";
import { SpaceAvatar } from "@/components/communities/rooms/space-avatar";
import { getInitials } from "@/lib/avatar";
import {
  pickFeaturedCommunities,
  type FeaturedCommunityCard,
} from "@/server/communities/featured";
import {
  COMMUNITY_STILL_TICK,
  communityHouseFrame,
  type CommunityLayer,
} from "./community-house-scene";

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

/**
 * Column plan by how many communities are featured: one card lies wide
 * (art beside text), two share a row, three share a row from `md`.
 */
const GRID_BY_COUNT: Record<number, string> = {
  1: "",
  2: "sm:grid-cols-2",
  3: "md:grid-cols-3",
};

/**
 * Homepage "Featured communities": each community is a house on the square
 * — its own seeded building with a row of people and agents in front,
 * scaled from the real member count — above its name, purpose and count.
 */
export function FeaturedCommunities({
  communities,
}: {
  communities: FeaturedCommunityCard[];
}) {
  const t = useTranslations("featuredCommunities");
  const items = pickFeaturedCommunities(communities);
  if (items.length === 0) return null;
  const wide = items.length === 1;

  return (
    <section
      aria-labelledby="featured-communities-title"
      className="px-6 py-12 sm:px-12"
    >
      <SectionLabel id="featured-communities-title" className="pb-4">
        {t("title")}
      </SectionLabel>
      <ul
        className={`mt-8 grid gap-6 ${GRID_BY_COUNT[items.length] ?? GRID_BY_COUNT[3]}`}
      >
        {items.map((community) => (
          <li key={community.slug} className="min-w-0">
            <CommunityCard
              community={community}
              wide={wide}
              members={t("membersCount", { count: community.memberCount })}
            />
          </li>
        ))}
      </ul>
      <div className="mt-4 text-right">
        <Link
          href="/communities"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 rounded-sm font-mono text-xs tracking-wider transition-colors outline-none focus-visible:ring-[3px]"
        >
          {t("viewAll")} →
        </Link>
      </div>
    </section>
  );
}

function CommunityCard({
  community,
  wide,
  members,
}: {
  community: FeaturedCommunityCard;
  wide: boolean;
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
      className={`group border-border hover:border-foreground/30 hover:bg-muted/40 focus-visible:border-ring focus-visible:ring-ring/50 flex h-full flex-col overflow-hidden rounded-xl border shadow-sm transition-colors outline-none focus-visible:ring-[3px] ${
        wide ? "md:flex-row" : ""
      }`}
    >
      <AsciiScene
        layers={LAYERS}
        frame={frame}
        frameMs={FRAME_MS}
        staticTick={COMMUNITY_STILL_TICK}
        minRows={6}
        data-testid={`community-art-${slug}`}
        className={`border-border h-48 shrink-0 border-b font-mono text-[10px] leading-3 sm:h-56 sm:text-xs sm:leading-[14px] ${
          wide ? "md:h-auto md:min-h-56 md:w-3/5 md:border-r md:border-b-0" : ""
        }`}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-3 p-6">
        <div className="flex items-center gap-3">
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
            <p className="text-muted-foreground line-clamp-3 text-sm leading-relaxed break-words">
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
