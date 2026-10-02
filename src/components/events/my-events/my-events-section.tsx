"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";

import { useRouter } from "@/i18n/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { ArrowLink } from "@/components/dashboard/arrow-link";
import {
  DashboardSection,
  statusFromServerLoad,
} from "@/components/dashboard/dashboard-section";
import { ListSkeleton } from "@/components/dashboard/list-skeleton";
import { useServerRefresh } from "@/components/dashboard/use-server-refresh";

import { MyEventsList, type MyEventItem } from "./my-events-list";

export type MyEventsView = "upcoming" | "past";

/** The tab's URL for each view; the filter lives in the URL so it can be shared. */
export function myEventsHref(view: MyEventsView): string {
  return view === "past" ? "/dashboard/events?past=1" : "/dashboard/events";
}

/**
 * The My events tab. The page loads the member's events on the server and
 * hands over the current view; this owns the filter (a `SegmentedControl`
 * that changes the URL) and the section states. While a new view or a
 * retry is on its way the list shows a skeleton.
 */
export function MyEventsSection({
  view,
  counts,
  items,
  failed,
}: {
  view: MyEventsView;
  /** Events in each view; null when the load failed. */
  counts: Record<MyEventsView, number> | null;
  items: readonly MyEventItem[];
  failed: boolean;
}) {
  const t = useTranslations("events.myEvents");
  const router = useRouter();
  const { refresh, refreshing } = useServerRefresh();
  const [switching, startSwitch] = useTransition();
  const [requested, setRequested] = useState<MyEventsView>(view);
  const shown = switching ? requested : view;

  const select = (next: MyEventsView) => {
    setRequested(next);
    startSwitch(() => router.replace(myEventsHref(next), { scroll: false }));
  };

  const option = (value: MyEventsView) => ({
    value,
    label: (
      <>
        {t(value)}
        {counts && (
          <span className="text-muted-foreground font-mono text-xs tabular-nums">
            {counts[value]}
          </span>
        )}
      </>
    ),
  });

  return (
    <DashboardSection
      title={t("label")}
      action={
        <SegmentedControl<MyEventsView>
          aria-label={t("filterLabel")}
          size="sm"
          value={shown}
          onValueChange={select}
          options={[option("upcoming"), option("past")]}
        />
      }
      status={statusFromServerLoad({
        failed,
        refreshing: refreshing || switching,
        isEmpty: items.length === 0,
        retry: refresh,
      })}
      skeleton={<ListSkeleton withAction={false} />}
      empty={
        <EmptyState
          className="px-0 py-8"
          title={view === "past" ? t("noPastTitle") : t("noUpcomingTitle")}
          description={
            view === "past"
              ? t("noPastDescription")
              : t("noUpcomingDescription")
          }
          action={<ArrowLink href="/events">{t("browse")}</ArrowLink>}
        />
      }
    >
      <MyEventsList items={items} />
    </DashboardSection>
  );
}
