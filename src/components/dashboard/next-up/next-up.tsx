"use client";

import { ArrowRight } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { AppLocale } from "@/i18n/messages";
import { Link } from "@/i18n/navigation";
import { api } from "@/trpc/react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DashboardSection,
  statusFromQueries,
} from "@/components/dashboard/dashboard-section";

import { NextUpRow } from "./next-up-row";

function NextUpSkeleton() {
  return (
    <ul className="divide-border divide-y">
      {Array.from({ length: 3 }, (_, i) => (
        <li key={i} className="flex items-center gap-4 py-3">
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-8 w-28" />
        </li>
      ))}
    </ul>
  );
}

function NextUpEmpty() {
  const t = useTranslations("dashboard.nextUp");
  return (
    <p className="text-muted-foreground text-sm text-pretty">
      {t("emptyTitle")}{" "}
      <Link
        href="/events"
        className="text-foreground focus-visible:ring-ring/50 group inline-flex items-center gap-1 rounded-sm font-medium underline underline-offset-4 outline-none focus-visible:ring-[3px]"
      >
        {t("emptyLink")}
        <ArrowRight
          aria-hidden
          className="size-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none"
        />
      </Link>
    </p>
  );
}

/**
 * Home's first section: what the member could do next (home.nextUp), already
 * ordered on the server. Only the first, most urgent row's action is Signal
 * Orange; every other row is neutral. When a source failed the rest still
 * shows, with a quiet note and a retry that reloads the whole list.
 */
export function NextUp() {
  const t = useTranslations("dashboard.nextUp");
  const locale = useLocale() as AppLocale;
  const query = api.home.nextUp.useQuery({ locale });
  const items = query.data?.items ?? [];
  const partial = query.data?.partial ?? false;

  return (
    <DashboardSection
      title={t("title")}
      status={statusFromQueries(query, {
        isEmpty: items.length === 0 && !partial,
      })}
      skeleton={<NextUpSkeleton />}
      empty={<NextUpEmpty />}
    >
      {items.length > 0 && (
        <ul className="divide-border -mt-3 divide-y">
          {items.map((item, i) => (
            <NextUpRow key={item.key} item={item} primary={i === 0} />
          ))}
        </ul>
      )}
      {partial && (
        <p
          role="status"
          className="text-muted-foreground mt-3 flex flex-wrap items-center gap-x-2 text-xs text-pretty"
        >
          <span>{t("partial")}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-foreground h-8 px-2"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            {t("retryPartial")}
          </Button>
        </p>
      )}
    </DashboardSection>
  );
}
