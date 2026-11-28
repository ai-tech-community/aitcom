"use client";

import { CommunityBanner } from "@/components/communities/community-banner";
import { resolveCommunityTheme } from "@/lib/communities/themes";
import { cn } from "@/lib/utils";
import type { RouterOutputs } from "@/trpc/react";

import { CommunityCoverArt } from "./community-cover-art";
import { useShownCommunityThemeId } from "./community-theme-preview";

type Community = RouterOutputs["communities"]["getBySlug"];

/**
 * The top of the Overview (and of the members-only view): the community's
 * banner picture when it has one; else the look's cover art with the
 * community name on it; else nothing (Plain). Same box as the banner.
 *
 * The art carries its own palette, so the cover does not depend on the
 * frame around it showing the same look.
 *
 * The art is decorative. Frames with a visible header identity can omit
 * the generated name. Uploaded banners keep their original content.
 */
export function CommunityThemeCover({
  community,
  className,
  showName = true,
}: {
  community: Pick<Community, "name" | "bannerUrl" | "bannerAlt" | "themeId">;
  className?: string;
  showName?: boolean;
}) {
  const theme = resolveCommunityTheme(
    useShownCommunityThemeId(community.themeId),
  );
  if (community.bannerUrl) {
    return <CommunityBanner community={community} className={className} />;
  }
  if (!theme.cover) return null;
  return (
    <div
      data-community-cover-art=""
      aria-hidden="true"
      className={cn(
        "border-border relative h-32 w-full overflow-hidden rounded-lg border sm:h-40 lg:h-44",
        className,
      )}
    >
      <CommunityCoverArt themeId={theme.id} className="absolute inset-0" />
      {showName ? (
        <span
          className="font-community-heading absolute start-3 bottom-3 max-w-[calc(100%-1.5rem)] truncate rounded-md px-2.5 py-0.5 text-xl font-semibold tracking-tight sm:start-4 sm:bottom-4 sm:max-w-[calc(100%-2rem)] sm:text-2xl lg:text-3xl"
          style={{
            color: theme.cover.nameColor,
            backgroundColor: theme.cover.nameBase,
          }}
        >
          {community.name}
        </span>
      ) : null}
    </div>
  );
}
