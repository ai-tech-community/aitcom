"use client";

import { useFormatter } from "next-intl";

import { browserTimeZone } from "@/lib/magazines/schedule";

/** Schedule times always use the browser's zone, regardless of the provider. */
export function useScheduleTime(): (iso: string) => string {
  const format = useFormatter();
  return (iso) =>
    format.dateTime(new Date(iso), {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: browserTimeZone(),
    });
}
