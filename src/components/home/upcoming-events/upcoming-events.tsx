import { useLocale, useTranslations } from "next-intl";
import { MoreLink } from "@/components/ui/more-link";
import { SectionLabel } from "@/components/ui/section-label";
import { useEventRowLabels } from "@/components/events/rows/use-event-row-labels";
import { TimetableRow } from "@/components/events/rows/timetable-row";
import {
  presentEventRows,
  type EventRowInput,
} from "@/components/events/rows/event-rows";

/**
 * Homepage "Upcoming events": a timetable of shared `TimetableRow`s. The
 * soonest event carries the square's `* NEXT UP` pin, the section's only
 * orange; hackathons get a stronger outline badge. No header row: the date
 * block, title and badge name themselves.
 */
export function UpcomingEvents({
  events,
  now,
}: {
  events: readonly EventRowInput[];
  now?: Date;
}) {
  const locale = useLocale();
  const t = useTranslations("events");
  const board = useTranslations("hero.board");
  const nextLabel = board("label");
  const labels = useEventRowLabels();
  const rows = presentEventRows(events, { locale, now, labels });

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
          {rows.map((row, index) => (
            <li key={row.key}>
              <TimetableRow
                row={row}
                isNext={index === 0}
                nextLabel={nextLabel}
              />
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
