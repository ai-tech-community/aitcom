import type { ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { EventRowAnchor } from "./event-row-anchor";
import type { EventRow } from "./event-rows";

/**
 * The compact form of an event row, for lists that sit beside or below the
 * main content (recent gatherings, a community's past events, the community
 * sidebar): a small mono date line, the title, and one line of where. Same
 * presenter as the timetable, so an event is worded the same everywhere.
 *
 * The caller picks the "where" line (a host community on the homepage, the
 * place and type inside a community) and wraps the row in its list item.
 * `actions` are controls under the body, outside the link.
 */
export function CompactEventRow({
  row,
  where,
  withTime = false,
  actions,
}: {
  row: EventRow;
  where?: string | null;
  /** Add the start time (with the event's zone) to the date line. */
  withTime?: boolean;
  actions?: ReactNode;
}) {
  const day = [row.day, row.month, row.year].filter(Boolean).join(" ");
  const when = withTime && row.time ? `${day} · ${row.time}` : day;

  return (
    <>
      <EventRowAnchor
        link={row.link}
        className="group block rounded-sm py-4"
        linkClassName="focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]"
      >
        <time
          dateTime={row.dateTime ?? undefined}
          className="text-muted-foreground block font-mono text-xs tracking-wider uppercase tabular-nums"
        >
          {when}
        </time>
        <span
          className={cn(
            "mt-2 block text-base leading-snug font-semibold text-pretty break-words decoration-1 underline-offset-4",
            row.link && "group-hover:underline",
          )}
        >
          {row.title}
          {row.link?.kind === "external" ? (
            <ArrowUpRight
              aria-hidden="true"
              className="text-muted-foreground ml-1 inline size-3.5 align-baseline"
            />
          ) : null}
        </span>
        {where ? (
          <span className="text-muted-foreground mt-1 block text-sm leading-snug break-words">
            {where}
          </span>
        ) : null}
      </EventRowAnchor>
      {actions ? (
        // -ml-2.5 lines a ghost button's icon up with the text above it.
        <div className="-mt-2 -ml-2.5 flex flex-wrap items-center gap-1 pb-4">
          {actions}
        </div>
      ) : null}
    </>
  );
}
