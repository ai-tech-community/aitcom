"use client";

import { useCallback, useMemo, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { SectionLabel } from "@/components/ui/section-label";
import {
  CreateCommunityButton,
  CreateCommunityProvider,
} from "./create-community-dialog";
import { DiscoverSquare } from "./discover/discover-square";
import { DiscoverCommunities } from "./discover/discover-communities";
import { DiscoverSpaces } from "./discover/discover-spaces";
import { OrganizerInvite } from "./discover/organizer-invite";
import {
  parseDirectoryParams,
  writeDirectoryParams,
  type DirectoryParams,
} from "./discover/directory-params";

/**
 * The Explore page: a human headline, the square (most active communities
 * as houses beside a live list), every community with search / sort /
 * place in the URL, public rooms once there are enough, and an invitation
 * to organizers as the close.
 */
export function CommunitiesDirectory() {
  const t = useTranslations("communities.discover");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const params = useMemo(
    () => parseDirectoryParams(searchParams),
    [searchParams],
  );
  const onParamsChange = useCallback(
    (patch: Partial<DirectoryParams>) => {
      const next = writeDirectoryParams(
        new URLSearchParams(searchParams.toString()),
        { ...params, ...patch },
      ).toString();
      startTransition(() =>
        router.replace(next ? `${pathname}?${next}` : pathname, {
          scroll: false,
        }),
      );
    },
    [params, pathname, router, searchParams],
  );

  return (
    <CreateCommunityProvider>
      <div className="mx-auto max-w-6xl px-6 py-10 sm:px-12 sm:py-16">
        <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <SectionLabel as="p" bordered={false}>
              {t("title")}
            </SectionLabel>
            <h1 className="mt-3 text-[clamp(2rem,5vw,3.5rem)] leading-[1.05] font-semibold tracking-[-0.02em] text-balance">
              {t("headline")}
            </h1>
            <p className="text-muted-foreground mt-4 max-w-xl text-base leading-relaxed text-pretty sm:text-lg">
              {t("tagline")}
            </p>
          </div>
          <CreateCommunityButton className="self-start sm:self-auto" />
        </header>

        <DiscoverSquare className="mt-10 sm:mt-12" />

        <DiscoverCommunities
          params={params}
          onParamsChange={onParamsChange}
          className="mt-16"
        />

        <DiscoverSpaces search={params.q} className="mt-16" />

        <OrganizerInvite className="mt-16" />
      </div>
    </CreateCommunityProvider>
  );
}
