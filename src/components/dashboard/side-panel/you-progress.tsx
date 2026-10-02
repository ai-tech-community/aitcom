"use client";

import { Award, Clock, Flame, Target, type LucideIcon } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";

import { api, type RouterOutputs } from "@/trpc/react";
import { catalogBadge, type BadgeSlug } from "@/lib/badges/catalog";
import { BadgeEmblem } from "@/components/badges/badge-emblem";
import { PointsChart } from "@/components/gamification/points-chart";
import { StreakCalendar } from "@/components/ui/streak-calendar";
import {
  SectionBody,
  statusFromQueries,
  type SectionStatus,
} from "@/components/dashboard/dashboard-section";
import { RelativeTime } from "@/components/ui/relative-time";
import { Skeleton } from "@/components/ui/skeleton";

type PointsEvent = RouterOutputs["members"]["getMyPointsHistory"][number];
type MyStreak = RouterOutputs["members"]["getMyStreak"];

/** Reason codes with a dedicated `points.<key>` label; others read "Activity". */
const KNOWN_REASONS = new Set(["activity", "course_complete"]);
const RECENT_XP_COUNT = 5;
const RECENT_ACTIVITY_COUNT = 5;

const TRIGGER_ICONS: Record<PointsEvent["type"], LucideIcon> = {
  metric: Target,
  achievement: Award,
  streak: Flame,
  time: Clock,
};

export interface EarnedBadge {
  slug: BadgeSlug;
  earnedAt: Date | string;
}

function BlockHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="text-sm font-medium">{children}</h3>;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="font-mono text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * Everything behind "See your progress": the streak calendar, the XP chart,
 * recent XP, badges and the member's own recent activity, sized for the
 * 20rem side panel. Mounted only while open, so the chart and history are
 * fetched on demand.
 */
export function YouProgress({
  streak,
  streakStatus,
  badges,
}: {
  /** Loaded by the "You" card; undefined while loading or after a failure. */
  streak: MyStreak | undefined;
  streakStatus: SectionStatus;
  badges: readonly EarnedBadge[];
}) {
  const t = useTranslations("dashboard.progress");
  const tStreak = useTranslations("streak");
  const tPoints = useTranslations("points");
  const tBadges = useTranslations("badges");
  const locale = useLocale();
  const format = useFormatter();

  const chart = api.members.getMyPointsChart.useQuery();
  const history = api.members.getMyPointsHistory.useQuery();
  const activity = api.activity.getFeed.useQuery({
    limit: RECENT_ACTIVITY_COUNT,
  });
  const activityItems = activity.data?.items ?? [];

  const formatDay = (date: string) =>
    format.dateTime(new Date(`${date}T00:00:00`), {
      day: "numeric",
      month: "short",
    });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <BlockHeading>{t("streakTitle")}</BlockHeading>
        <SectionBody status={streakStatus} size="compact">
          {streak && (
            <>
              <dl className="grid grid-cols-2 gap-3">
                <Stat
                  label={tStreak("longest")}
                  value={t("days", { count: streak.longestStreak })}
                />
                <Stat
                  label={tStreak("total")}
                  value={t("days", { count: streak.total })}
                />
              </dl>
              <StreakCalendar
                streak={streak.streak}
                view="month"
                startOfWeek={1}
                locale={locale}
                labels={{
                  calendar: t("calendar.label"),
                  today: t("calendar.today"),
                  active: t("calendar.active"),
                  freeze: t("calendar.freeze"),
                  idle: t("calendar.idle"),
                  future: t("calendar.future"),
                }}
                className="max-w-none [&_h3]:text-sm [&_h3]:font-medium"
              />
            </>
          )}
        </SectionBody>
        <p className="text-muted-foreground text-xs">{tStreak("how1")}</p>
      </div>

      <div className="space-y-3">
        <BlockHeading>{tPoints("chartTitle")}</BlockHeading>
        <SectionBody
          status={statusFromQueries(chart, {
            isEmpty: (chart.data ?? []).length === 0,
          })}
          skeleton={<Skeleton className="h-36 w-full" />}
          empty={
            <p className="text-muted-foreground text-sm">{tPoints("empty")}</p>
          }
        >
          <PointsChart
            data={chart.data ?? []}
            height={144}
            yAxisWidth={36}
            totalLabel={tPoints("total")}
            formatDate={formatDay}
            className="rounded-none border-0 bg-transparent p-0"
          />
        </SectionBody>
      </div>

      <div className="space-y-3">
        <BlockHeading>{tPoints("historyTitle")}</BlockHeading>
        <SectionBody
          status={statusFromQueries(history, {
            isEmpty: (history.data ?? []).length === 0,
          })}
          empty={
            <p className="text-muted-foreground text-sm">{tPoints("empty")}</p>
          }
        >
          <ul className="divide-border divide-y">
            {(history.data ?? []).slice(0, RECENT_XP_COUNT).map((event) => {
              const Icon = TRIGGER_ICONS[event.type];
              const key = event.reason.replace(/\./g, "_");
              const reason = KNOWN_REASONS.has(key)
                ? tPoints(key)
                : tPoints("activity");
              return (
                <li
                  key={event.id}
                  className="flex items-center gap-2 py-2 text-sm"
                >
                  <Icon
                    aria-hidden
                    className="text-muted-foreground size-3.5 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">{reason}</span>
                  <span className="font-mono font-medium tabular-nums">
                    {t("xpGained", { amount: event.awarded })}
                  </span>
                  <time
                    dateTime={event.date}
                    className="text-muted-foreground w-14 shrink-0 text-right font-mono text-xs"
                  >
                    {format.dateTime(new Date(event.date), {
                      day: "numeric",
                      month: "short",
                    })}
                  </time>
                </li>
              );
            })}
          </ul>
        </SectionBody>
      </div>

      <div className="space-y-3">
        <BlockHeading>{t("recentTitle")}</BlockHeading>
        <SectionBody
          status={statusFromQueries(activity, {
            isEmpty: activityItems.length === 0,
          })}
          empty={
            <p className="text-muted-foreground text-sm">{t("recentEmpty")}</p>
          }
        >
          <ul className="divide-border divide-y">
            {activityItems.map((item) => {
              const title =
                typeof item.metadata?.title === "string"
                  ? item.metadata.title
                  : null;
              return (
                <li key={item.id} className="flex items-start gap-2 py-2">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="block">
                      {t("recentAction", {
                        action: item.action.replace(/\./g, "_"),
                      })}
                    </span>
                    {title && (
                      <span className="text-muted-foreground block truncate text-xs">
                        {title}
                      </span>
                    )}
                  </span>
                  <RelativeTime
                    date={item.createdAt}
                    className="text-muted-foreground shrink-0 pt-0.5 text-xs whitespace-nowrap"
                  />
                </li>
              );
            })}
          </ul>
        </SectionBody>
      </div>

      {badges.length > 0 && (
        <div className="space-y-3">
          <BlockHeading>{t("badgesTitle")}</BlockHeading>
          <ul className="space-y-2.5">
            {badges.flatMap(({ slug, earnedAt }) => {
              const badge = catalogBadge(slug);
              return badge
                ? [
                    <li key={badge.slug} className="flex items-start gap-2.5">
                      <BadgeEmblem
                        subject={{ kind: "badge", slug: badge.slug }}
                        state={{ earned: true, earnedAt }}
                        size="sm"
                        decorative
                      />
                      <span className="min-w-0">
                        <span className="block text-sm leading-tight">
                          {tBadges(badge.nameKey)}
                        </span>
                        <span className="text-muted-foreground block text-xs">
                          {tBadges(
                            badge.descriptionKey,
                            badge.descriptionValues,
                          )}
                        </span>
                      </span>
                    </li>,
                  ]
                : [];
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
