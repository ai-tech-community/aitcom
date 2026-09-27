import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SectionLabel } from "@/components/ui/section-label";
import {
  presentUpcomingEvents,
  type UpcomingEventInput,
} from "@/components/home/upcoming-events/upcoming-event-rows";

/** How many past gatherings the section shows. */
export const RECENT_GATHERINGS_SHOWN = 3;

/**
 * Homepage proof: the latest gatherings that really took place, each with
 * its date, host community (or place) and a link to its page. Real rows
 * only, from the same event data as the timetable above; with nothing to
 * show, the section is left out rather than filled with claims.
 *
 * Rows come from the timetable's presenter, so dates, places and hosts are
 * worded the same way in both sections.
 */
export function RecentGatherings({
  events,
  now,
}: {
  /** Past events, most recent first (see `pastEvents`). */
  events: readonly UpcomingEventInput[];
  now?: Date;
}) {
  const locale = useLocale();
  const t = useTranslations("homeRecent");
  const ev = useTranslations("events");
  const rows = presentUpcomingEvents(events.slice(0, RECENT_GATHERINGS_SHOWN), {
    locale,
    now,
    labels: {
      types: {
        workshop: ev("eventTypeWorkshop"),
        hackathon: ev("eventTypeHackathon"),
        deep_dive: ev("eventTypeDeepDive"),
        meetup: ev("eventTypeMeetup"),
      },
      online: ev("online"),
      hybrid: ev("formatHybrid"),
      inPerson: ev("formatInPerson"),
      hostedBy: (name) => ev("hostedBy", { name }),
    },
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
        {rows.map((row) => {
          const where = row.host ?? row.placeParts.join(" · ");
          return (
            <li key={row.key} className="border-border min-w-0 border-t">
              <Link
                href={row.href}
                className="group focus-visible:ring-ring/50 block rounded-sm py-4 outline-none focus-visible:ring-[3px]"
              >
                <time
                  dateTime={row.dateTime ?? undefined}
                  className="text-muted-foreground block font-mono text-xs tracking-wider uppercase tabular-nums"
                >
                  {[row.day, row.month, row.year].filter(Boolean).join(" ")}
                </time>
                <span className="mt-2 block text-base leading-snug font-semibold text-pretty break-words decoration-1 underline-offset-4 group-hover:underline">
                  {row.title}
                </span>
                {where ? (
                  <span className="text-muted-foreground mt-1 block text-sm leading-snug break-words">
                    {where}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
