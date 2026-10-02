import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { requireDashboardSession } from "@/server/dashboard/require-dashboard-session";
import { db } from "@/server/db";
import { getPayloadClient } from "@/server/payload";
import { loadMyEventPairs } from "@/server/events/my-event-pairs";
import { loadEventHostNames } from "@/server/events/event-hosts-queries";
import { resolveLocale } from "@/i18n/messages";
import { splitMyEvents } from "@/lib/events/split-my-events";
import { toEventRowInput } from "@/components/events/rows/to-event-row-input";
import type { MyEventItem } from "@/components/events/my-events/my-events-list";
import {
  MyEventsSection,
  type MyEventsView,
} from "@/components/events/my-events/my-events-section";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

type SP = Record<string, string | string[] | undefined>;

function firstParam(sp: SP, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

type Loaded = { counts: Record<MyEventsView, number>; items: MyEventItem[] };

async function loadMyEvents(
  userId: string,
  locale: string,
  view: MyEventsView,
): Promise<Loaded> {
  const pairs = await loadMyEventPairs(
    { db, getPayload: getPayloadClient },
    { userId, locale: resolveLocale(locale) },
  );

  // Upcoming and past judged in each event's own zone, so an event later
  // today stays upcoming after 00:00 UTC.
  const { upcoming, past } = splitMyEvents(pairs);
  const shown = view === "past" ? past : upcoming;

  const hostNames = await loadEventHostNames(
    db,
    shown.map(({ event }) => event.communityId),
  );
  return {
    counts: { upcoming: upcoming.length, past: past.length },
    items: shown.map(({ registration, event }) => ({
      key: String(registration.id),
      event: toEventRowInput(event, hostNames),
      status: registration.status,
      external: Boolean(event.sourceUrl),
    })),
  };
}

/** My events tab: the main column only; the frame is the layout's. */
export default async function DashboardEventsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const [session, locale, sp] = await Promise.all([
    requireDashboardSession(),
    getLocale(),
    searchParams,
  ]);
  const userId = session.user.id;
  const view: MyEventsView =
    firstParam(sp, "past") === "1" ? "past" : "upcoming";

  let loaded: Loaded | null = null;
  try {
    loaded = await loadMyEvents(userId, locale, view);
  } catch (error) {
    // A failed load is shown as an error with retry, never as "no events".
    console.error("[dashboard/events] loading my events failed", error);
  }

  return (
    <MyEventsSection
      view={view}
      counts={loaded?.counts ?? null}
      items={loaded?.items ?? []}
      failed={loaded === null}
    />
  );
}
