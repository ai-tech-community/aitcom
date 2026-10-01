"use client";

import { useLocale, useTranslations } from "next-intl";
import { CalendarDays, Hash, MapPin } from "lucide-react";
import type { RouterOutputs } from "@/trpc/react";
import { formatEventShortWhen } from "@/lib/event-time";
import { ONLINE_PLACE } from "@/server/communities/directory";
import { cn } from "@/lib/utils";

export type DirectoryItem =
  RouterOutputs["communities"]["directory"]["items"][number];

type NextEvent = NonNullable<DirectoryItem["nextEvent"]>;

/** "Online" or the city, as the place filter and cards show it. */
export function usePlaceLabel() {
  const t = useTranslations("communities.discover");
  return (key: string) => (key === ONLINE_PLACE ? t("placeOnline") : key);
}

/** "Next: Tue 14 Oct · Amsterdam" (or "· Online", or just the day). */
export function NextEventLine({
  event,
  className,
}: {
  event: NextEvent;
  className?: string;
}) {
  const t = useTranslations("communities.discover");
  const locale = useLocale();
  const placeLabel = usePlaceLabel();
  const when = formatEventShortWhen({ date: event.date }, locale);
  const place = event.online ? placeLabel(ONLINE_PLACE) : event.city;
  return (
    <p
      className={cn(
        "text-foreground flex min-w-0 items-start gap-2 text-sm",
        className,
      )}
    >
      <CalendarDays
        aria-hidden="true"
        className="text-muted-foreground mt-0.5 size-4 shrink-0"
      />
      <span className="min-w-0 wrap-break-word">
        {place ? t("nextEventAt", { when, place }) : t("nextEvent", { when })}
      </span>
    </p>
  );
}

/** People active in the discovery window, in words. */
export function ActivityLine({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  const t = useTranslations("communities.discover");
  return (
    <p
      className={cn(
        "flex min-w-0 items-start gap-2 text-sm",
        count > 0 ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          count > 0 ? "bg-success" : "border-muted-foreground/60 border",
        )}
      />
      <span className="min-w-0 wrap-break-word">
        {t("activeRecently", { count })}
      </span>
    </p>
  );
}

/** Public rooms anyone can look into before joining. */
export function OpenRoomsLine({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  const t = useTranslations("communities.discover");
  return (
    <p
      className={cn(
        "text-foreground flex min-w-0 items-start gap-2 text-sm",
        className,
      )}
    >
      <Hash
        aria-hidden="true"
        className="text-muted-foreground mt-0.5 size-4 shrink-0"
      />
      <span className="min-w-0 wrap-break-word">
        {t("openRooms", { count })}
      </span>
    </p>
  );
}

/** How far the community's nearest upcoming in-person event is. */
export function DistanceLine({
  km,
  className,
}: {
  km: number;
  className?: string;
}) {
  const t = useTranslations("communities.discover");
  return (
    <p
      className={cn(
        "text-foreground flex min-w-0 items-start gap-2 text-sm",
        className,
      )}
    >
      <MapPin
        aria-hidden="true"
        className="text-muted-foreground mt-0.5 size-4 shrink-0"
      />
      <span className="min-w-0 wrap-break-word">
        {t("distanceAway", { km })}
      </span>
    </p>
  );
}
