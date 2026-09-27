import { Fragment } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { MoreLink } from "@/components/ui/more-link";
import { SectionLabel } from "@/components/ui/section-label";
import { cn } from "@/lib/utils";
import {
  presentUpcomingEvents,
  type UpcomingEventInput,
  type UpcomingEventRow,
} from "./upcoming-event-rows";

/**
 * Homepage "Upcoming events": a timetable. Each row is one link — a mono
 * date block (day and month large; weekday and start time with the event's
 * own zone small), the title in Sans with where it happens and who hosts
 * it, and the event type. The soonest event carries the square's `* NEXT UP`
 * pin, the section's only orange; hackathons get a stronger outline badge.
 * No header row: the date block, title and badge name themselves.
 */
export function UpcomingEvents({
  events,
  now,
}: {
  events: readonly UpcomingEventInput[];
  now?: Date;
}) {
  const locale = useLocale();
  const t = useTranslations("events");
  const board = useTranslations("hero.board");
  const nextLabel = board("label");
  const rows = presentUpcomingEvents(events, {
    locale,
    now,
    labels: {
      types: {
        workshop: t("eventTypeWorkshop"),
        hackathon: t("eventTypeHackathon"),
        deep_dive: t("eventTypeDeepDive"),
        meetup: t("eventTypeMeetup"),
      },
      online: t("online"),
      hybrid: t("formatHybrid"),
      inPerson: t("formatInPerson"),
      hostedBy: (name) => t("hostedBy", { name }),
    },
  });

  return (
    <section
      aria-labelledby="upcoming-events-title"
      className="px-6 py-12 sm:px-12"
    >
      <SectionLabel id="upcoming-events-title" className="pb-4">
        {t("title")}
      </SectionLabel>

      {rows.length === 0 ? (
        <p className="text-muted-foreground mt-8 text-base leading-relaxed">
          {t("noEvents")}
        </p>
      ) : (
        <ol className="divide-border border-border divide-y border-b">
          {rows.map((row) => (
            <li key={row.key}>
              <EventRow row={row} nextLabel={nextLabel} />
            </li>
          ))}
        </ol>
      )}

      <div className="mt-4 text-right">
        <MoreLink href="/events">{t("viewAll")}</MoreLink>
      </div>
    </section>
  );
}

/**
 * A spoken pause between groups: a comma only a reader hears, then a plain
 * space (collapsed on screen between blocks) so words never run together.
 */
function Pause() {
  return (
    <>
      <span className="sr-only">,</span>{" "}
    </>
  );
}

/** The visible "·" between place parts; a reader hears a comma instead. */
function Dot() {
  return (
    <>
      <span aria-hidden="true"> · </span>
      <Pause />
    </>
  );
}

/**
 * One row. The link is named by its own visible words — title, place, host,
 * date block, marker, type — in that reading order (title first), so a
 * voice user can say what they see ("click 29 Sep", "click The AI
 * Conference"). Screen-reader-only text only adds commas between groups;
 * it never replaces visible words. The grid puts the date block first on
 * screen while the title comes first in the DOM.
 */
function EventRow({
  row,
  nextLabel,
}: {
  row: UpcomingEventRow;
  nextLabel: string;
}) {
  const secondary = [...row.placeParts, ...(row.host ? [row.host] : [])];
  const hackathon = row.kind.type === "hackathon";

  return (
    <Link
      href={row.href}
      data-next={row.isNext || undefined}
      className="group hover:bg-secondary/50 focus-visible:ring-ring/50 grid grid-cols-[4.25rem_minmax(0,1fr)] gap-x-3 gap-y-3 rounded-md px-1 py-5 transition-colors outline-none focus-visible:ring-[3px] sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-8 sm:px-4"
    >
      <span className="col-start-2 row-start-1 min-w-0">
        <span className="block text-base leading-snug font-semibold text-pretty break-words decoration-1 underline-offset-4 group-hover:underline sm:text-lg">
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
        {row.isNext ? (
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
        <ArrowRight
          aria-hidden="true"
          className="text-muted-foreground group-hover:text-foreground hidden size-4 shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 sm:block"
        />
      </span>
    </Link>
  );
}
