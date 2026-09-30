"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/trpc/react";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { SpaceAvatar } from "@/components/communities/rooms/space-avatar";
import { CreateCommunityButton } from "@/components/communities/create-community-dialog";
import { getInitials } from "@/lib/avatar";
import { CommunityStreet } from "./community-street";
import type { StreetHouse } from "./community-street-scene";
import {
  ActivityLine,
  NextEventLine,
  type DirectoryItem,
} from "./community-signals";
import { squareQueryInput } from "./directory-params";

const PANEL =
  "border-border grid overflow-hidden rounded-xl border lg:grid-cols-12";

function SquareSkeleton() {
  return (
    <div className={PANEL} aria-hidden="true">
      <Skeleton className="h-52 rounded-none lg:col-span-7 lg:h-80" />
      <div className="divide-border divide-y lg:col-span-5 lg:border-l">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex gap-3 p-4">
            <Skeleton className="size-8 shrink-0 rounded-md" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-3.5 w-3/4" />
              <Skeleton className="h-3.5 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SquareRow({
  community,
  active,
  onActiveChange,
}: {
  community: DirectoryItem;
  active: boolean;
  onActiveChange: (slug: string | null) => void;
}) {
  const t = useTranslations("communities.discover");
  const { slug, name, logoUrl } = community;
  return (
    <li>
      <Link
        href={`/communities/${slug}`}
        data-active={active || undefined}
        onPointerEnter={() => onActiveChange(slug)}
        onPointerLeave={() => onActiveChange(null)}
        onFocus={() => onActiveChange(slug)}
        onBlur={() => onActiveChange(null)}
        className="hover:bg-muted/50 data-[active]:bg-muted/50 focus-visible:ring-ring/50 flex gap-3 px-4 py-3.5 transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-inset"
      >
        {logoUrl ? (
          <Avatar className="size-8 shrink-0 rounded-md">
            <AvatarImage src={logoUrl} alt="" />
            <AvatarFallback>{getInitials(name)}</AvatarFallback>
          </Avatar>
        ) : (
          <SpaceAvatar name={name} className="size-8" />
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span
              title={name}
              className="min-w-0 truncate text-sm font-semibold"
            >
              {name}
            </span>
            {community.isNew ? (
              <Badge variant="secondary">{t("isNew")}</Badge>
            ) : null}
          </div>
          <ActivityLine count={community.activeRecently} />
          <NextEventLine event={community.nextEvent} />
        </div>
      </Link>
    </li>
  );
}

/**
 * "On the square now": the most active communities as houses on a street
 * (lit windows = recent activity, a flag = an event coming up) beside the
 * same communities as a list. Pointing at either marks both.
 */
export function DiscoverSquare({ className }: { className?: string }) {
  const t = useTranslations("communities.discover");
  const locale = useLocale() as "en" | "nl";
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const query = api.communities.directory.useQuery(squareQueryInput(locale));
  const items = useMemo(() => query.data?.items ?? [], [query.data]);
  const houses = useMemo<StreetHouse[]>(
    () =>
      items.map((c) => ({
        slug: c.slug,
        name: c.name,
        memberCount: c.memberCount,
        activeRecently: c.activeRecently,
        hasUpcomingEvent: c.nextEvent !== null,
      })),
    [items],
  );

  return (
    <section aria-labelledby="square-title" className={className}>
      <SectionLabel id="square-title" bordered={false} className="mb-3">
        {t("squareTitle")}
      </SectionLabel>
      {query.isLoading ? (
        <SquareSkeleton />
      ) : query.isError ? (
        <ErrorState onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          className="border-border rounded-xl border"
          title={t("squareEmptyTitle")}
          description={t("squareEmptyDescription")}
          action={<CreateCommunityButton variant="outline" />}
        />
      ) : (
        <>
          <div className={PANEL}>
            <CommunityStreet
              houses={houses}
              activeSlug={activeSlug}
              onActiveChange={setActiveSlug}
              className="border-border h-52 border-b lg:col-span-7 lg:h-auto lg:min-h-80 lg:border-b-0"
            />
            <ol className="divide-border divide-y lg:col-span-5 lg:border-l">
              {items.map((c) => (
                <SquareRow
                  key={c.id}
                  community={c}
                  active={c.slug === activeSlug}
                  onActiveChange={setActiveSlug}
                />
              ))}
            </ol>
          </div>
          <p className="text-muted-foreground mt-3 text-xs">
            {t("squareHint")}
          </p>
        </>
      )}
    </section>
  );
}
