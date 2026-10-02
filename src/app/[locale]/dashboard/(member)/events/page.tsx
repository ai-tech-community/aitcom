import type { Metadata } from "next";
import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { getPayloadClient } from "@/server/payload";
import { loadMyEventPairs } from "@/server/events/my-event-pairs";
import { resolveLocale } from "@/i18n/messages";
import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { SectionLabel } from "@/components/ui/section-label";
import { toEventRowInput } from "@/components/events/rows/to-event-row-input";
import { loadEventHostNames } from "@/server/events/event-hosts-queries";
import { splitMyEvents } from "@/components/events/my-events/split-my-events";
import {
  MyEventsList,
  type MyEventItem,
} from "@/components/events/my-events/my-events-list";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type SP = Record<string, string | string[] | undefined>;

function firstParam(sp: SP, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function DashboardEventsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const [session, locale, sp, t] = await Promise.all([
    getSession(),
    getLocale(),
    searchParams,
    getTranslations("events.myEvents"),
  ]);
  if (!session?.user) redirect("/auth/signin");

  const isPast = firstParam(sp, "past") === "1";

  const pairs = await loadMyEventPairs(
    { db, getPayload: getPayloadClient },
    { userId: session.user.id, locale: resolveLocale(locale) },
  );

  // Upcoming and past judged in each event's own zone, so an event later
  // today stays upcoming after 00:00 UTC.
  const { upcoming, past } = splitMyEvents(pairs);
  const myEvents = isPast ? past : upcoming;

  const hostNames = await loadEventHostNames(
    db,
    myEvents.map(({ event }) => event.communityId),
  );
  const items: MyEventItem[] = myEvents.map(({ registration, event }) => ({
    key: String(registration.id),
    event: toEventRowInput(event, hostNames),
    status: registration.status,
    external: Boolean(event.sourceUrl),
  }));

  const tabHref = (past: boolean) =>
    past ? "/dashboard/events?past=1" : "/dashboard/events";

  return (
    <div>
      <SectionLabel className="pb-4">{t("label")}</SectionLabel>

      <div className="mt-4 flex gap-1 font-mono text-xs tracking-wider uppercase">
        <Link
          href={tabHref(false)}
          aria-current={!isPast ? "page" : undefined}
          className={`rounded border px-3 py-1.5 transition-colors ${
            !isPast
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-secondary/40"
          }`}
        >
          {t("upcoming", { count: upcoming.length })}
        </Link>
        <Link
          href={tabHref(true)}
          aria-current={isPast ? "page" : undefined}
          className={`rounded border px-3 py-1.5 transition-colors ${
            isPast
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-secondary/40"
          }`}
        >
          {t("past", { count: past.length })}
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="mt-6 text-center">
          <p className="text-muted-foreground text-sm">
            {isPast ? t("noPast") : t("noUpcoming")}
          </p>
          <Link
            href="/events"
            className="text-primary hover:text-primary/80 mt-2 inline-block font-mono text-xs tracking-wider underline underline-offset-4"
          >
            {t("browse")}
          </Link>
        </div>
      ) : (
        <div className="mt-4">
          <MyEventsList items={items} />
        </div>
      )}
    </div>
  );
}
