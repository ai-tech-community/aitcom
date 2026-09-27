import { useLocale, useTranslations } from "next-intl";
import { SectionLabel } from "@/components/ui/section-label";
import {
  presentEventRows,
  type EventRowInput,
} from "@/components/events/rows/event-rows";
import { useEventRowLabels } from "@/components/events/rows/use-event-row-labels";
import { CompactEventRow } from "@/components/events/rows/compact-event-row";

/** How many past gatherings the section shows. */
export const RECENT_GATHERINGS_SHOWN = 3;

/**
 * Homepage proof: the latest gatherings that really took place, each with
 * its date, host community (or place) and a link to its page. Real rows
 * only, from the same event data as the timetable above; with nothing to
 * show, the section is left out rather than filled with claims.
 *
 * Rows come from the shared event-row presenter, so dates, places and hosts are
 * worded the same way in both sections.
 */
export function RecentGatherings({
  events,
  now,
}: {
  /** Past events, most recent first (see `pastEvents`). */
  events: readonly EventRowInput[];
  now?: Date;
}) {
  const locale = useLocale();
  const t = useTranslations("homeRecent");
  const labels = useEventRowLabels();
  const rows = presentEventRows(events.slice(0, RECENT_GATHERINGS_SHOWN), {
    locale,
    now,
    labels,
  });
  if (rows.length === 0) return null;

  return (
    <section
      aria-labelledby="recent-gatherings-title"
      className="px-6 py-12 sm:px-12"
    >
      <SectionLabel id="recent-gatherings-title" className="pb-4">
        {t("title")}
      </SectionLabel>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-pretty">
        {t("lead")}
      </p>
      <ol className="mt-8 grid gap-x-8 gap-y-2 sm:grid-cols-3">
        {rows.map((row) => (
          <li key={row.key} className="border-border min-w-0 border-t">
            <CompactEventRow
              row={row}
              where={row.host ?? row.placeParts.join(" · ")}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
