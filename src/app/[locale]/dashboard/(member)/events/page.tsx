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

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const typeLabels: Record<string, string> = {
  workshop: "WORKSHOP",
  hackathon: "HACKATHON",
  deep_dive: "DEEP-DIVE",
  meetup: "MEETUP",
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
  [key: string]: unknown;
}

export default async function DashboardEventsPage() {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session?.user) redirect("/auth/signin");

  const [registrations, payload] = await Promise.all([
    db
      .select()
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.userId, session.user.id),
          inArray(eventRegistrations.status, [
            "registered",
            "waitlisted",
            "attended",
          ]),
        ),
      ),
    getPayload({ config }),
  ]);
  const eventsWithReg = (
    await Promise.all(
      registrations.map(async (reg) => {
        const { docs } = await payload.find({
          collection: "events",
          where: { id: { equals: reg.eventId } },
          locale: locale as "en" | "nl",
          limit: 1,
        });
        const event = docs[0] as PayloadEvent | undefined;
        if (!event) return null;
        return { registration: reg, event };
      }),
    )
  ).filter(Boolean) as {
    registration: typeof eventRegistrations.$inferSelect;
    event: PayloadEvent;
  }[];

  const myEvents = eventsWithReg.sort(
    (a, b) =>
      new Date(a.event.date).getTime() - new Date(b.event.date).getTime(),
  );

  return (
    <div>
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / MY EVENTS
        </span>
      </div>

      {myEvents.length === 0 ? (
        <div className="mt-6 text-center">
          <p className="text-sm text-muted-foreground">No upcoming events.</p>
          <Link
            href="/events"
            className="mt-2 inline-block font-mono text-xs tracking-wider text-primary underline underline-offset-4 hover:text-primary/80"
          >
            Browse events
          </Link>
        </div>
      ) : (
        <div className="mt-2">
          {myEvents.map(({ registration, event }) => (
            <Link
              key={registration.id}
              href={`/events/${event.slug}`}
              className="flex flex-col gap-1.5 border-b border-border px-4 py-3.5 transition-colors hover:bg-secondary/50 sm:flex-row sm:items-center sm:gap-0"
            >
              {/* Title - first on mobile */}
              <span className="text-[15px] font-medium leading-snug sm:order-2 sm:flex-1">
                {event.title}
              </span>

              {/* Date + badges on mobile */}
              <div className="flex items-center gap-3 sm:order-1 sm:w-32">
                <div className="h-2 w-2 rounded-full bg-primary" />
                <span className="font-mono text-[12px] sm:text-[13px]">
                  {formatDate(event.date)}
                </span>
                {/* Type + status inline on mobile */}
                <span className="rounded border border-border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider text-muted-foreground sm:hidden">
                  {typeLabels[event.type] ?? event.type}
                </span>
                <span className="rounded border border-dashed border-border px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground sm:hidden">
                  {registration.status.toUpperCase()}
                </span>
              </div>

              {/* Type badge - desktop only */}
              <span className="hidden rounded border border-border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider text-muted-foreground sm:order-3 sm:inline">
                {typeLabels[event.type] ?? event.type}
              </span>
              <span className="ml-3 hidden rounded border border-dashed border-border px-2 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground sm:order-4 sm:inline">
                {registration.status.toUpperCase()}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
