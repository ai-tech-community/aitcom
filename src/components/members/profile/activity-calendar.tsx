"use client";

import { useLocale, useTranslations } from "next-intl";

import {
  StreakCalendar,
  type StreakPeriod,
} from "@/components/ui/streak-calendar";

/**
 * The public year calendar of active days. Read-only: days are plain cells
 * (no tab stops). Labels are built here because the calendar takes a
 * function for its end date, which cannot cross from a server component.
 */
export function ActivityCalendar({
  periods,
}: {
  periods: readonly StreakPeriod[];
}) {
  const t = useTranslations("memberProfile.activity.calendar");
  const locale = useLocale();

  return (
    <StreakCalendar
      streak={[...periods]}
      view="year"
      startOfWeek={1}
      showFreezes={false}
      locale={locale}
      labels={{
        calendar: t("label"),
        today: t("today"),
        active: t("active"),
        freeze: t("freeze"),
        idle: t("idle"),
        future: t("future"),
        lastYear: t("lastYear"),
        endingOn: (date) => t("endingOn", { date }),
      }}
      className="max-w-none [&_h3]:text-sm [&_h3]:font-medium"
    />
  );
}
