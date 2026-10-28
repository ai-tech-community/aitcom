import { useLocale, useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { Link } from "@/i18n/navigation";
import { formatEventDayRange } from "@/lib/event-time";
import { cn } from "@/lib/utils";

import { FactSeparator } from "./fact-separator";
import { ItemRow } from "./item-row";
import type { ItemRendererProps, ItemTitle } from "./types";

/** The current event details, within the reader's community audience. */
export function EventItem({ view, size }: ItemRendererProps<"event">) {
  const t = useTranslations("magazines.item");
  const locale = useLocale();
  const { event } = view;
  const place = event.online ? t("online") : event.city;

  switch (size) {
    case "row":
      return (
        <ItemRow
          kind="event"
          title={
            <Link
              href={`/events/${event.slug}`}
              className="underline-offset-4 hover:underline focus-visible:underline"
            >
              {event.title}
            </Link>
          }
          label={t("eventKind")}
          intro={view.intro}
          fact={formatEventDayRange(event.date, event.endDate, locale)}
        />
      );
    case "lead":
    case "card":
      break;
  }
  const isLead = size === "lead";

  return (
    <article
      data-item-kind="event"
      className="bg-card text-card-foreground flex h-full flex-col overflow-hidden rounded-xl border"
    >
      <div
        className={cn(
          "flex flex-1 flex-col gap-2 p-5",
          isLead && "gap-3 @xl:p-8",
        )}
      >
        <p className="text-muted-foreground text-sm">{t("eventKind")}</p>
        <h2
          className={cn(
            "font-semibold tracking-tight text-balance",
            isLead
              ? "text-2xl leading-tight @xl:text-3xl"
              : "text-lg leading-snug",
          )}
        >
          <Link
            href={`/events/${event.slug}`}
            className="underline-offset-4 hover:underline focus-visible:underline"
          >
            {event.title}
          </Link>
        </h2>
        {view.intro && <p className="text-sm">{view.intro}</p>}
        <p className="text-muted-foreground flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-sm">
          <span className="font-mono text-xs">
            {formatEventDayRange(event.date, event.endDate, locale)}
          </span>
          {place && (
            <>
              <FactSeparator />
              <span>{place}</span>
            </>
          )}
        </p>
        {event.status !== "published" && (
          <Badge variant="secondary">{t(event.status)}</Badge>
        )}
      </div>
    </article>
  );
}

export const eventItemTitle: ItemTitle<"event"> = (view) => view.event.title;
