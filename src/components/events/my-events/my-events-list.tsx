import { useLocale, useTranslations } from "next-intl";
import { TimetableRow } from "@/components/events/rows/timetable-row";
import { Pause } from "@/components/events/rows/row-speech";
import { useEventRowLabels } from "@/components/events/rows/use-event-row-labels";
import {
  presentEventRows,
  type EventRowInput,
} from "@/components/events/rows/event-rows";

/** Registration statuses with their own words; anything else shows as stored. */
const KNOWN_STATUSES = [
  "registered",
  "waitlisted",
  "attended",
  "intent",
  "pending_payment",
] as const;
type KnownStatus = (typeof KNOWN_STATUSES)[number];

function isKnownStatus(status: string): status is KnownStatus {
  return (KNOWN_STATUSES as readonly string[]).includes(status);
}

/** One of the member's events: the shared row input plus their registration. */
export interface MyEventItem {
  key: string;
  event: EventRowInput;
  /** The member's registration status, e.g. "registered" or "intent". */
  status: string;
  /** The event is run elsewhere (it has a source URL). */
  external: boolean;
}

/**
 * The member's events on the dashboard, as the same timetable rows every
 * event list uses (the event's own day and zone, EN/NL words). The member's
 * registration status and an "External" note sit in the row's `status`
 * seam, so the row itself is never forked.
 */
export function MyEventsList({
  items,
  now,
}: {
  items: readonly MyEventItem[];
  /** "Now" for the year shown on rows; tests pin it. */
  now?: Date;
}) {
  const locale = useLocale();
  const labels = useEventRowLabels();
  const t = useTranslations("events.myEvents");

  return (
    <ol className="divide-border border-border divide-y border-b">
      {items.map((item) => {
        const [row] = presentEventRows([item.event], { locale, labels, now });
        if (!row) return null;
        const status = isKnownStatus(item.status)
          ? t(`status.${item.status}`)
          : item.status.replace(/_/g, " ");
        return (
          <li key={item.key}>
            <TimetableRow
              row={row}
              status={
                <span
                  data-registration-status={item.status}
                  className="text-muted-foreground inline-flex flex-wrap gap-x-3 font-mono text-xs font-medium tracking-wider whitespace-nowrap uppercase"
                >
                  <span>{status}</span>
                  {item.external ? (
                    <>
                      <Pause />
                      <span>{t("external")}</span>
                    </>
                  ) : null}
                </span>
              }
            />
          </li>
        );
      })}
    </ol>
  );
}
