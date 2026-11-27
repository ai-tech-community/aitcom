"use client";

import { CommunityBanner } from "@/components/communities/community-banner";
import { resolveCommunityTheme } from "@/lib/communities/themes";
import { cn } from "@/lib/utils";
import type { RouterOutputs } from "@/trpc/react";

import { useShownCommunityThemeId } from "./community-theme-preview";
import { COMMUNITY_COVER_ART } from "./cover-art";

type Community = RouterOutputs["communities"]["getBySlug"];

/**
 * The top of the Overview (and of the members-only view): the community's
 * banner picture when it has one; else the look's cover art with the
 * community name on it; else nothing (Plain). Same box as the banner.
 *
 * The art and its name are decorative: the name is the page's h1 right
 * below, so assistive tech skips the cover rather than hear it twice.
 */
export function CommunityThemeCover({
  community,
  className,
}: {
  community: Pick<Community, "name" | "bannerUrl" | "bannerAlt" | "themeId">;
  className?: string;
}) {
  const theme = resolveCommunityTheme(
    useShownCommunityThemeId(community.themeId),
  );
  if (community.bannerUrl) {
    return <CommunityBanner community={community} className={className} />;
  }
  const Art = COMMUNITY_COVER_ART[theme.id];
  if (!theme.cover || !Art) return null;
  return (
    <div
      data-community-cover-art=""
      aria-hidden="true"
      className={cn(
        "border-border relative h-32 w-full overflow-hidden rounded-lg border sm:h-40 lg:h-44",
        className,
      )}
    >
      <Art />
      {/* The name sits on its base color, the pair the catalog test measures. */}
      <span
        className="font-community-heading absolute start-3 bottom-3 max-w-[calc(100%-1.5rem)] truncate rounded-md px-2.5 py-0.5 text-xl font-semibold tracking-tight sm:start-4 sm:bottom-4 sm:max-w-[calc(100%-2rem)] sm:text-2xl lg:text-3xl"
        style={{
          color: theme.cover.nameColor,
          backgroundColor: theme.cover.nameBase,
        }}
      >
        {community.name}
      </span>
    </div>
  );
}
