"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CreateCommunityButton,
  CreateCommunityProvider,
} from "./create-community-dialog";
import { SquareHero } from "./discover/square-hero";
import { SquareRooms } from "./discover/square-rooms";
import { BODY_FRAME } from "./discover/explore-layout";
import { DiscoverCommunities } from "./discover/discover-communities";
import { OrganizerInvite } from "./discover/organizer-invite";
import {
  parseDirectoryParams,
  writeDirectoryParams,
  type DirectoryParams,
} from "./discover/directory-params";

/**
 * The Explore page: the street runs edge to edge with the headline on it
 * (the most active communities as houses, an empty lot for the next one).
 * Below it, the directory (search / sort / place in the URL, closing with
 * the organizer invite) and, from `xl`, a sticky side panel with the rooms
 * on the square; narrower screens get the rooms as a strip above the
 * directory.
 */
export function CommunitiesDirectory() {
  const t = useTranslations("communities.discover");
  const searchParams = useSearchParams();

  const params = useMemo(
    () => parseDirectoryParams(searchParams),
    [searchParams],
  );
  // Filters change the URL in place (history.replaceState, which Next
  // syncs into useSearchParams): the grid refetches through tRPC, and the
  // server page is not rendered again for a keystroke.
  const onParamsChange = useCallback(
    (patch: Partial<DirectoryParams>) => {
      const url = new URL(window.location.href);
      const next = writeDirectoryParams(url.searchParams, {
        ...params,
        ...patch,
      }).toString();
      window.history.replaceState(
        null,
        "",
        next ? `${url.pathname}?${next}` : url.pathname,
      );
    },
    [params],
  );

  return (
    <CreateCommunityProvider>
      <SquareHero
        headline={
          <>
            <h1 className="text-[clamp(2rem,5vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">
              {t("headline")}
            </h1>
            <p className="text-muted-foreground mt-4 text-base leading-relaxed text-pretty sm:text-lg">
              {t("tagline")}
            </p>
            <CreateCommunityButton variant="outline" className="mt-6">
              {t("inviteAction")}
            </CreateCommunityButton>
          </>
        }
      />

      <div className={`${BODY_FRAME} pt-10 pb-16 sm:pb-20`}>
        <SquareRooms layout="strip" className="mb-14 xl:hidden" />
        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-12">
          <div className="min-w-0">
            <DiscoverCommunities
              params={params}
              onParamsChange={onParamsChange}
            />
            <OrganizerInvite className="mt-16" />
          </div>
          <SquareRooms
            layout="panel"
            className="hidden xl:sticky xl:top-20 xl:block xl:max-h-[calc(100vh-6rem)] xl:self-start xl:overflow-y-auto"
          />
        </div>
      </div>
    </CreateCommunityProvider>
  );
}
