"use client";

import { Check, Flame, Snowflake } from "lucide-react";
import { useFormatter, useNow, useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import type { StreakPeriod } from "@/components/ui/streak-calendar";
import { buildStreakWeek, type StreakDayState } from "./streak-week";

const DOT_STYLES: Record<StreakDayState, string> = {
  active: "bg-success text-success-foreground",
  freeze: "bg-info text-info-foreground",
  idle: "border-border bg-muted/40 border",
  future: "border-border/50 border",
};

/**
 * Compact streak for the "You" card: the current streak and this week's
 * days. The full calendar lives behind "See your progress".
 */
export function StreakSummary({
  currentStreak,
  periods,
}: {
  currentStreak: number;
  periods: readonly StreakPeriod[];
}) {
  const t = useTranslations("dashboard.you");
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const week = buildStreakWeek(periods, now);

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-sm">
        {/* Not a status: the flame is ink, never success green. */}
        <Flame aria-hidden className="text-foreground size-4 shrink-0" />
        {currentStreak > 0 ? (
          <span>
            {t.rich("streak", {
              count: currentStreak,
              n: (chunks) => (
                <span className="font-mono font-medium tabular-nums">
                  {chunks}
                </span>
              ),
            })}
          </span>
        ) : (
          <span className="text-muted-foreground">{t("noStreak")}</span>
        )}
      </p>

      <ol aria-label={t("thisWeek")} className="grid grid-cols-7 gap-1">
        {week.map((day) => {
          const dayName = format.dateTime(day.date, { weekday: "long" });
          return (
            <li
              key={day.date.toISOString()}
              className="flex flex-col items-center gap-1"
            >
              <span
                aria-hidden
                className={cn(
                  "flex size-5 items-center justify-center rounded-full",
                  DOT_STYLES[day.state],
                  day.isToday &&
                    "ring-foreground ring-offset-card ring-2 ring-offset-1",
                )}
              >
                {day.state === "active" && <Check className="size-3" />}
                {day.state === "freeze" && <Snowflake className="size-3" />}
              </span>
              <span
                aria-hidden
                className={cn(
                  "font-mono text-xs uppercase",
                  day.isToday ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {format.dateTime(day.date, { weekday: "narrow" })}
              </span>
              <span className="sr-only">
                {t(`day.${day.state}`, { day: dayName })}
                {day.isToday ? `, ${t("today")}` : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
