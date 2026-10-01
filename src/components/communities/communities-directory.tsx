"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  CreateCommunityButton,
  CreateCommunityProvider,
} from "./create-community-dialog";
import { DiscoverSquare } from "./discover/discover-square";
import { DiscoverCommunities } from "./discover/discover-communities";
import { TalkingNow } from "./discover/talking-now";
import { OrganizerInvite } from "./discover/organizer-invite";
import {
  parseDirectoryParams,
  writeDirectoryParams,
  type DirectoryParams,
} from "./discover/directory-params";

/**
 * The Explore page: a human headline, the square (the most active
 * communities as houses on a street), the rooms talking now, every
 * community with search / sort / place in the URL, and an invitation to
 * organizers as the close.
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
      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-12 sm:py-16">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <h1 className="text-[clamp(2rem,5vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">
              {t("headline")}
            </h1>
            <p className="text-muted-foreground mt-4 max-w-xl text-base leading-relaxed text-pretty sm:text-lg">
              {t("tagline")}
            </p>
          </div>
          <CreateCommunityButton
            variant="outline"
            className="self-start sm:self-auto"
          >
            {t("inviteAction")}
          </CreateCommunityButton>
        </header>

        <DiscoverSquare className="mt-10 sm:mt-12" />

        <TalkingNow className="mt-14" />

        <DiscoverCommunities
          params={params}
          onParamsChange={onParamsChange}
          className="mt-16"
        />

        <OrganizerInvite className="mt-16" />
      </div>
    </CreateCommunityProvider>
  );
}
