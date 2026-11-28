import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatEventDay } from "@/lib/event-time";
import { ArrowRight, ArrowUpRight, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EventDateBlock } from "./event-date-block";
import { EventRowAnchor } from "./event-row-anchor";
import type { EventRow } from "./event-rows";

export function EventAgendaRow({
  row,
  dateLabel,
  image,
  description,
  status,
  actions,
  isNext,
  nextLabel,
}: {
  row: EventRow;
  /** Hub listings can supply a full date and time range. */
  dateLabel?: string;
  image?: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  isNext?: boolean;
  nextLabel?: string;
}) {
  const locale = useLocale();
  const t = useTranslations("redesign.events");
  const place = [...row.placeParts, row.host]
    .filter(
      (part) => part && part.toLowerCase() !== row.formatLabel?.toLowerCase(),
    )
    .join(" · ");
  const date =
    dateLabel ?? (row.dateTime ? formatEventDay(row.dateTime, locale) : null);
  const time = row.timeRange ?? row.time;
  const timezone = !time ? row.timezone?.replaceAll("_", " ") : null;
  const Arrow = row.link?.kind === "external" ? ArrowUpRight : ArrowRight;

  return (
    <div className="flex flex-col">
      <EventRowAnchor
        link={row.link}
        data-next={isNext ? true : undefined}
        className="group grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-x-3 rounded-md px-1 py-4 sm:grid-cols-[4.25rem_minmax(0,1fr)_auto] sm:gap-x-5 sm:px-2 sm:py-5"
        linkClassName="hover:bg-secondary/35 focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]"
      >
        <div className="col-start-2 row-start-1 min-w-0">
          <div className="text-muted-foreground flex flex-wrap items-baseline gap-x-2 gap-y-0.5 font-mono text-xs tabular-nums">
            {date ? <span>{date}</span> : null}
            {date ? <span aria-hidden="true">·</span> : null}
            <span>{time ?? t("timeToBeAnnounced")}</span>
            {timezone ? <span>{timezone}</span> : null}
            {time && row.timezone === null ? (
              <span className="font-sans">{t("timeZoneUnspecified")}</span>
            ) : null}
          </div>
          <div
            className={cn(
              "mt-1 text-lg leading-snug font-semibold tracking-tight break-words sm:text-xl",
              row.link && "underline-offset-4 group-hover:underline",
            )}
          >
            {row.title}
          </div>
          {place ? (
            <div className="text-muted-foreground mt-1.5 flex items-start gap-1.5 text-sm leading-snug">
              <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {place}
            </div>
          ) : null}
          <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            {isNext && nextLabel ? (
              <Badge data-testid="next-marker" variant="secondary">
                {nextLabel}
              </Badge>
            ) : null}
            <Badge variant="outline" data-kind={row.kind.type ?? "other"}>
              {row.kind.label}
            </Badge>
            {row.formatLabel ? (
              <Badge variant="outline">{row.formatLabel}</Badge>
            ) : null}
            {status}
          </div>
          {description}
        </div>
        <EventDateBlock
          dateTime={row.dateTime}
          day={row.day}
          month={row.month}
          className="col-start-1 row-start-1"
        />
        {row.link || image ? (
          <div className="col-start-3 row-start-1 flex items-center gap-3">
            {image}
            {row.link ? (
              <Arrow
                aria-hidden="true"
                className="text-muted-foreground group-hover:text-foreground size-4 shrink-0"
              />
            ) : null}
          </div>
        ) : null}
      </EventRowAnchor>
      {actions ? (
        <div className="flex min-w-0 flex-wrap items-center gap-2 pb-4 pl-16 sm:pl-24 max-sm:[&_a]:min-h-11 max-sm:[&_button]:min-h-11">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
