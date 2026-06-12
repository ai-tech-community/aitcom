"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import {
  eventWallTimeToUtc,
  formatEventTimeRange,
  formatInstantInZone,
  isValidTimeZone,
} from "@/lib/event-time";

interface EventTimeDisplayProps {
  /** ISO timestamp or YYYY-MM-DD; only the calendar date is used. */
  date: string;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  className?: string;
}

/**
 * Event-local time with explicit timezone, plus the viewer's local
 * equivalent when their zone differs. The server can't know the viewer's
 * timezone, so the conversion line is computed after mount (this also keeps
 * server and client HTML identical for hydration).
 */
export function EventTimeDisplay({
  date,
  startTime,
  endTime,
  timezone,
  className,
}: EventTimeDisplayProps) {
  const t = useTranslations("events");
  const [viewerLine, setViewerLine] = useState<string | null>(null);

  useEffect(() => {
    if (!startTime || !isValidTimeZone(timezone)) return;
    let viewerZone: string;
    try {
      viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!viewerZone || viewerZone === timezone) return;

    const start = formatInstantInZone(
      eventWallTimeToUtc(date, startTime, timezone),
      viewerZone,
    );
    const end = endTime
      ? formatInstantInZone(
          eventWallTimeToUtc(date, endTime, timezone),
          viewerZone,
        )
      : null;
    const eventDay = date.split("T")[0];
    const dayHint = start.date !== eventDay ? ` (${start.date})` : "";
    const range = end ? `${start.time}–${end.time}` : start.time;
    setViewerLine(
      t("yourLocalTime", {
        time: `${range} ${start.abbreviation}${dayHint}`,
      }),
    );
  }, [date, startTime, endTime, timezone, t]);

  const eventLocal = formatEventTimeRange({
    date,
    startTime,
    endTime,
    timezone,
  });
  if (!eventLocal) return null;

  return (
    <div className={className}>
      <div className="font-mono text-sm tracking-wider">{eventLocal}</div>
      {viewerLine && (
        <div className="text-muted-foreground mt-0.5 text-xs">{viewerLine}</div>
      )}
    </div>
  );
}
