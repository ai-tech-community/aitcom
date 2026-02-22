import { getSession } from "@/server/better-auth/server";
import { redirect } from "next/navigation";
import { db } from "@/server/db";
import { eventRegistrations } from "@/server/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { getPayload } from "payload";
import config from "@payload-config";
import { getLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

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

interface EventWithRegistration {
  registration: typeof eventRegistrations.$inferSelect;
  event: PayloadEvent;
}

export default async function DashboardPage() {
  const session = await getSession();
  if (!session?.user) redirect("/auth/signin");

  const locale = await getLocale();

  // Fetch user's active registrations
  const registrations = await db
    .select()
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.userId, session.user.id),
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        inArray(eventRegistrations.status, ["registered", "waitlisted", "attended"]),
      ),
    );

  // Fetch event details from Payload for each registration
  const payload = await getPayload({ config });
  const eventsWithRegistration: EventWithRegistration[] = (
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
  ).filter((item): item is EventWithRegistration => item !== null);

  // Sort by date
  const myEvents = eventsWithRegistration.sort((a, b) => {
    const dateA = new Date(a.event.date).getTime();
    const dateB = new Date(b.event.date).getTime();
    return dateA - dateB;
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-16 sm:px-8">
      <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
      <p className="mt-2 text-muted-foreground">
        Welcome back, {session.user.name ?? session.user.email}
      </p>

      {/* My Events section */}
      <div className="mt-12">
        <div className="border-b border-border pb-4">
          <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
            / MY EVENTS
          </span>
        </div>

        {myEvents.length === 0 ? (
          <div className="mt-6 text-center">
            <p className="text-sm text-muted-foreground">
              No upcoming events.
            </p>
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
                className="flex items-center border-b border-border px-4 py-3.5 transition-colors hover:bg-secondary/50"
              >
                <div className="flex w-32 items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-primary" />
                  <span className="font-mono text-[13px]">
                    {formatDate(event.date)}
                  </span>
                </div>
                <span className="flex-1 font-medium">
                  {event.title}
                </span>
                <span className="rounded border border-border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
                  {typeLabels[event.type] ?? event.type}
                </span>
                <span className="ml-3 rounded border border-dashed border-border px-2 py-0.5 font-mono text-[10px] tracking-wider text-muted-foreground">
                  {registration.status.toUpperCase()}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
