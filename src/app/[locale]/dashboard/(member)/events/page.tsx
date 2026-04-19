import type { Metadata } from "next";
import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { eventRegistrations } from "@/server/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getPayload } from "payload";
import config from "@payload-config";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/event-metadata";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

interface PayloadEvent {
  id: number;
  title: string;
  slug: string;
  date: string;
  type: string;
  sourceUrl?: string | null;
  [key: string]: unknown;
}

type Registration = typeof eventRegistrations.$inferSelect;

const STATUS_LABELS: Record<string, string> = {
  registered: "REGISTERED",
  waitlisted: "WAITLISTED",
  attended: "ATTENDED",
  intent: "GOING",
  pending_payment: "PENDING PAYMENT",
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
  const [session, locale, sp] = await Promise.all([
    getSession(),
    getLocale(),
    searchParams,
  ]);
  if (!session?.user) redirect("/auth/signin");

  const isPast = firstParam(sp, "past") === "1";

  const registrations = await db
    .select()
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.userId, session.user.id),
        inArray(eventRegistrations.status, [
          "registered",
          "waitlisted",
          "attended",
          "intent",
          "pending_payment",
        ]),
      ),
    );

  const eventIds = registrations.map((r) => r.eventId);
  let events: PayloadEvent[] = [];

  if (eventIds.length > 0) {
    const payload = await getPayload({ config });
    const { docs } = await payload.find({
      collection: "events",
      where: { id: { in: eventIds } },
      locale: locale as "en" | "nl",
      limit: eventIds.length,
      depth: 0,
    });
    events = docs as unknown as PayloadEvent[];
  }

  const now = new Date();
  const pairs: Array<{ registration: Registration; event: PayloadEvent }> = [];
  for (const reg of registrations) {
    const event = events.find((e) => e.id === reg.eventId);
    if (event) pairs.push({ registration: reg, event });
  }

  const upcoming = pairs
    .filter(({ event, registration }) => {
      if (registration.status === "attended") return false;
      return new Date(event.date) >= now;
    })
    .sort(
      (a, b) =>
        new Date(a.event.date).getTime() - new Date(b.event.date).getTime(),
    );

  const past = pairs
    .filter(({ event, registration }) => {
      if (registration.status === "attended") return true;
      return new Date(event.date) < now;
    })
    .sort(
      (a, b) =>
        new Date(b.event.date).getTime() - new Date(a.event.date).getTime(),
    );

  const myEvents = isPast ? past : upcoming;

  const tabHref = (past: boolean) =>
    past ? "/dashboard/events?past=1" : "/dashboard/events";

  return (
    <div>
      <div className="border-border border-b pb-4">
        <span className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / MY EVENTS
        </span>
      </div>

      <div className="mt-4 flex gap-1 font-mono text-xs tracking-wider">
        <Link
          href={tabHref(false)}
          className={`rounded border px-3 py-1.5 transition-colors ${
            !isPast
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-secondary/40"
          }`}
        >
          UPCOMING ({upcoming.length})
        </Link>
        <Link
          href={tabHref(true)}
          className={`rounded border px-3 py-1.5 transition-colors ${
            isPast
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-secondary/40"
          }`}
        >
          PAST ({past.length})
        </Link>
      </div>

      {myEvents.length === 0 ? (
        <div className="mt-6 text-center">
          <p className="text-muted-foreground text-sm">
            {isPast ? "No past events yet." : "No upcoming events."}
          </p>
          <Link
            href="/events"
            className="text-primary hover:text-primary/80 mt-2 inline-block font-mono text-xs tracking-wider underline underline-offset-4"
          >
            Browse events
          </Link>
        </div>
      ) : (
        <div className="mt-4">
          {myEvents.map(({ registration, event }) => {
            const isExternal = Boolean(event.sourceUrl);
            const statusLabel =
              STATUS_LABELS[registration.status] ??
              registration.status.toUpperCase();
            return (
              <Link
                key={registration.id}
                href={`/events/${event.slug}`}
                className="border-border hover:bg-secondary/50 flex flex-col gap-1.5 border-b px-4 py-3.5 transition-colors sm:flex-row sm:items-center sm:gap-0"
              >
                <span className="text-[15px] leading-snug font-medium sm:order-2 sm:flex-1">
                  {event.title}
                </span>

                <div className="flex items-center gap-3 sm:order-1 sm:w-32">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      registration.status === "intent"
                        ? "bg-muted-foreground"
                        : "bg-primary"
                    }`}
                  />
                  <span className="font-mono text-[12px] sm:text-[13px]">
                    {formatDate(event.date)}
                  </span>
                  <span className="border-border text-muted-foreground rounded border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider sm:hidden">
                    {EVENT_TYPE_LABELS[event.type as EventType] ?? event.type}
                  </span>
                  <span className="border-border text-muted-foreground rounded border border-dashed px-1.5 py-0.5 font-mono text-[10px] tracking-wider sm:hidden">
                    {statusLabel}
                  </span>
                </div>

                <span className="border-border text-muted-foreground hidden rounded border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider sm:order-3 sm:inline">
                  {EVENT_TYPE_LABELS[event.type as EventType] ?? event.type}
                </span>
                {isExternal && (
                  <span className="border-border text-muted-foreground ml-3 hidden rounded border border-dashed px-2 py-0.5 font-mono text-[10px] tracking-wider sm:order-4 sm:inline">
                    EXTERNAL
                  </span>
                )}
                <span className="border-border text-muted-foreground ml-3 hidden rounded border border-dashed px-2 py-0.5 font-mono text-[10px] tracking-wider sm:order-5 sm:inline">
                  {statusLabel}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
