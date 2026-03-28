import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { Link } from "@/i18n/navigation";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";

export const metadata: Metadata = {
  title: "Events",
  description:
    "Upcoming workshops, hackathons, deep-dives, and meetups from the AI Tech Community.",
  ...buildOgMeta(
    "Events",
    "Upcoming workshops, hackathons, deep-dives, and meetups from the AI Tech Community.",
    "Events",
  ),
  alternates: buildAlternates("/events"),
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

export default async function EventsPage() {
  const locale = await getLocale();
  const t = await getTranslations("events");

  const payload = await getPayloadClient();
  const { docs: events } = await payload.find({
    collection: "events",
    where: { status: { equals: "published" } },
    sort: "date",
    locale: locale as "en" | "nl",
    draft: false,
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      {/* Section Header */}
      <div className="border-border border-b pb-4">
        <h1 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
          / {t("title").toUpperCase()}
        </h1>
      </div>

      {events.length === 0 ? (
        <p className="text-muted-foreground mt-12 text-center">
          {t("noEvents")}
        </p>
      ) : (
        <>
          {/* Table Header - desktop only */}
          <div className="border-border hidden items-center border-b px-4 py-2.5 sm:flex">
            <span className="text-muted-foreground w-32 font-mono text-[11px] font-medium tracking-wider">
              / DATE
            </span>
            <span className="text-muted-foreground flex-1 font-mono text-[11px] font-medium tracking-wider">
              / NAME
            </span>
            <span className="text-muted-foreground font-mono text-[11px] font-medium tracking-wider">
              / TYPE
            </span>
          </div>

          {/* Event Rows */}
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/events/${event.slug}`}
              className="border-border hover:bg-secondary/50 flex flex-col gap-1.5 border-b px-4 py-3.5 transition-colors sm:flex-row sm:items-center sm:gap-0"
            >
              {/* Title - first on mobile */}
              <span className="text-[15px] font-medium leading-snug sm:order-2 sm:flex-1">
                {event.title}
              </span>

              {/* Date + type on mobile */}
              <div className="flex items-center gap-3 sm:order-1 sm:w-32">
                <div className="bg-foreground h-2 w-2 rounded-full" />
                <span className="font-mono text-[12px] sm:text-[13px]">
                  {formatDate(event.date)}
                </span>
                {/* Type badge - inline on mobile */}
                <span className="border-border text-muted-foreground rounded border px-2 py-0.5 font-mono text-[10px] font-medium tracking-wider sm:hidden">
                  {typeLabels[event.type] ?? event.type}
                </span>
              </div>

              {/* Type badge - desktop only */}
              <span className="border-border text-muted-foreground hidden rounded border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider sm:order-3 sm:inline">
                {typeLabels[event.type] ?? event.type}
              </span>
              <span className="text-muted-foreground ml-4 hidden font-mono text-lg font-light sm:order-4 sm:inline">
                +
              </span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
