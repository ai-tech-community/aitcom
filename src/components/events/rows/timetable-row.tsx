import { Fragment, type ReactNode } from "react";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { EventRowAnchor } from "./event-row-anchor";
import type { EventRow } from "./event-rows";
import { Dot, Pause } from "./row-speech";

const BODY =
  "group grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-md px-1 py-5 sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-8 sm:px-4";
const BODY_LINK =
  "hover:bg-secondary/50 focus-visible:ring-ring/50 transition-colors outline-none focus-visible:ring-[3px]";

/**
 * One timetable row: a mono date block (day and month large; weekday and
 * start time with the event's own zone small), the title in Sans with where
 * it happens and who hosts it, and the event type. Shared by every list that
 * reads as a schedule (the homepage timetable, a community's events).
 *
 * The body is one link named by its own visible words — title, place, host,
 * date block, marker, status, type — in that reading order (title first), so
 * a voice user can say what they see ("click 29 Sep", "click The AI
 * Conference"). Screen-reader-only text only adds commas between groups; it
 * never replaces visible words. The grid puts the date block first on screen
 * while the title comes first in the DOM.
 *
 * Two named seams let a surface add to the row without forking it:
 * - `status`: words about the event's state ("Pending approval"). Not
 *   interactive; they sit beside the type and are part of the link's name.
 * - `actions`: controls (edit, approve, …). Buttons cannot live inside a
 *   link, so they sit after the body: on a line under the title on narrow
 *   screens, as the row's own flex items beside the body on wide ones. An
 *   item with `order-last basis-full` takes a full line under the row.
 */
export function TimetableRow({
  row,
  isNext = false,
  nextLabel,
  status,
  actions,
}: {
  row: EventRow;
  /** The soonest event: the only row a timetable marks. */
  isNext?: boolean;
  /** Words of the next marker; required when `isNext` can be true. */
  nextLabel?: string;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  const secondary = [...row.placeParts, ...(row.host ? [row.host] : [])];
  const hackathon = row.kind.type === "hackathon";
  const external = row.link?.kind === "external";
  const Arrow = external ? ArrowUpRight : ArrowRight;

  const body = (
    <EventRowAnchor
      link={row.link}
      data-next={isNext || undefined}
      className={cn(BODY, actions ? "min-w-0 basis-full sm:flex-1" : null)}
      linkClassName={BODY_LINK}
    >
      <span className="col-start-2 row-start-1 min-w-0">
        <span
          className={cn(
            "block text-base leading-snug font-semibold text-pretty break-words decoration-1 underline-offset-4 sm:text-lg",
            row.link && "group-hover:underline",
          )}
        >
          {row.title}
        </span>
        {secondary.length > 0 ? (
          <span className="text-muted-foreground mt-1 block text-sm leading-snug break-words">
            <Pause />
            {secondary.map((part, i) => (
              <Fragment key={i}>
                {i > 0 ? <Dot /> : null}
                {part}
              </Fragment>
            ))}
          </span>
        ) : null}
      </span>
      <Pause />

      <time
        dateTime={row.dateTime ?? undefined}
        className="col-start-1 row-span-2 row-start-1 font-mono uppercase sm:row-span-1"
      >
        <span className="block text-lg leading-none font-medium tracking-tight tabular-nums sm:text-2xl">
          {row.day} {row.month}
        </span>
        <Pause />
        <span className="text-muted-foreground mt-2 block text-xs leading-snug tracking-wider tabular-nums">
          {row.year ? `${row.weekday} ${row.year}` : row.weekday}
        </span>
        {row.time ? (
          <>
            <Pause />
            <span className="text-muted-foreground block text-xs leading-snug tracking-wider tabular-nums">
              {row.time}
            </span>
          </>
        ) : null}
      </time>

      <span className="col-start-2 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-2 sm:col-start-3 sm:row-start-1 sm:flex-nowrap sm:justify-end">
        <Pause />
        {isNext ? (
          <>
            <span
              data-testid="next-marker"
              className="text-foreground font-mono text-xs font-medium tracking-wider whitespace-nowrap uppercase"
            >
              <span aria-hidden="true" className="text-primary">
                *
              </span>{" "}
              {nextLabel}
            </span>
            <Pause />
          </>
        ) : null}
        {status ? (
          <>
            {status}
            <Pause />
          </>
        ) : null}
        <Badge
          variant="outline"
          data-kind={row.kind.type ?? "other"}
          className={cn(
            "font-mono tracking-wider uppercase",
            hackathon
              ? "border-foreground text-foreground font-semibold"
              : "text-muted-foreground",
          )}
        >
          {row.kind.label}
        </Badge>
        {row.link ? (
          <Arrow
            aria-hidden="true"
            className={cn(
              "text-muted-foreground group-hover:text-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0",
              // A new tab is worth saying on every screen size.
              external ? "block" : "hidden sm:block",
            )}
          />
        ) : null}
      </span>
    </EventRowAnchor>
  );

  if (!actions) return body;

  return (
    <div
      data-slot="event-row"
      className="flex flex-wrap items-center gap-2 px-1 pb-4 sm:gap-x-4 sm:px-0 sm:pr-4 sm:pb-0"
    >
      {body}
      {/* Narrow screens: one line under the title column. Wide screens:
          `contents`, so each control is the row's own flex item. */}
      <div className="-mt-3 flex min-w-0 basis-full flex-wrap items-center gap-2 pl-[4.625rem] sm:contents">
        {actions}
      </div>
    </div>
  );
}
