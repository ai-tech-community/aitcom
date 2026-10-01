"use client";

import { useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CreateCommunityButton,
  CreateCommunityProvider,
} from "./create-community-dialog";
import { SquareHero } from "./discover/square-hero";
import {
  RoomsPanel,
  RoomsStrip,
  useSquareRooms,
} from "./discover/square-rooms";
import { ALL_COMMUNITIES_ID } from "./discover/discover-communities";
import { Button } from "@/components/ui/button";
import { BODY_FRAME } from "./discover/explore-layout";
import { useJoinDeepLink } from "./use-community-join";
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
 * the organizer invite) and, from `xl` and only when there are rooms, a
 * sticky side panel with the rooms on the square. Narrower screens get the
 * rooms as capped strips: talking rooms above the directory, quiet ones
 * after it. Strip and panel both render and CSS shows one, so the server
 * HTML is right for every width without a layout jump.
 */
export function CommunitiesDirectory() {
  const t = useTranslations("communities.discover");
  const searchParams = useSearchParams();
  // A guest who pressed Join comes back from sign-in with ?join=.
  useJoinDeepLink();
  const rooms = useSquareRooms();
  // The panel takes a column only when there are rooms to show. Once it
  // is there it stays for the visit, so a minute's refresh that empties it
  // never yanks the layout from under the reader.
  const roomsNow =
    (rooms.data?.talking.length ?? 0) + (rooms.data?.quiet.length ?? 0) > 0;
  const hadRooms = useRef(false);
  if (roomsNow) hadRooms.current = true;
  const hasRooms = roomsNow || hadRooms.current;

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
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild variant="ink">
                <a href={`#${ALL_COMMUNITIES_ID}`}>{t("browseAction")}</a>
              </Button>
              <CreateCommunityButton variant="outline">
                {t("inviteAction")}
              </CreateCommunityButton>
            </div>
          </>
        }
      />

      <div className={`${BODY_FRAME} pt-10 pb-16 sm:pb-20`}>
        <RoomsStrip part="talking" className="mb-14 xl:hidden" />
        <div
          className={
            hasRooms
              ? "xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-12"
              : undefined
          }
        >
          {/* First in the DOM so keyboard and screen-reader users reach the
              rooms before the long card list; placed right by the grid. */}
          {hasRooms ? (
            <RoomsPanel className="hidden [scrollbar-width:thin] xl:sticky xl:top-20 xl:col-start-2 xl:row-start-1 xl:-mx-3 xl:block xl:max-h-[calc(100vh-6rem)] xl:self-start xl:overflow-y-auto xl:px-3" />
          ) : null}
          <div className="min-w-0 xl:col-start-1 xl:row-start-1">
            <DiscoverCommunities
              params={params}
              onParamsChange={onParamsChange}
            />
            <RoomsStrip part="open" className="mt-14 xl:hidden" />
            <OrganizerInvite className="mt-16" />
          </div>
        </div>
      </div>
    </CreateCommunityProvider>
  );
}
