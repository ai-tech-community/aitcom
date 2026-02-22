import { getLocale, getTranslations } from "next-intl/server";
import { getPayload } from "payload";
import config from "@payload-config";
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

export default async function EventsPage() {
  const locale = await getLocale();
  const t = await getTranslations("events");

  const payload = await getPayload({ config });
  const { docs: events } = await payload.find({
    collection: "events",
    where: { status: { equals: "published" } },
    sort: "date",
    locale: locale as "en" | "nl",
  });

  return (
    <div className="px-6 py-16 sm:px-12">
      {/* Section Header */}
      <div className="border-b border-border pb-4">
        <span className="font-mono text-xs font-medium tracking-wider text-muted-foreground">
          / {t("title").toUpperCase()}
        </span>
      </div>

      {events.length === 0 ? (
        <p className="mt-12 text-center text-muted-foreground">
          {t("noEvents")}
        </p>
      ) : (
        <>
          {/* Table Header */}
          <div className="flex items-center border-b border-border px-4 py-2.5">
            <span className="w-32 font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
              / DATE
            </span>
            <span className="flex-1 font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
              / NAME
            </span>
            <span className="font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
              / TYPE
            </span>
          </div>

          {/* Event Rows */}
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/events/${event.slug as string}`}
              className="flex items-center border-b border-border px-4 py-3.5 transition-colors hover:bg-secondary/50"
            >
              <div className="flex w-32 items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-foreground" />
                <span className="font-mono text-[13px]">
                  {formatDate(event.date as string)}
                </span>
              </div>
              <span className="flex-1 font-medium">
                {event.title as string}
              </span>
              <span className="rounded border border-border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider text-muted-foreground">
                {typeLabels[event.type as string] ?? (event.type as string)}
              </span>
              <span className="ml-4 font-mono text-lg font-light text-muted-foreground">
                +
              </span>
            </Link>
          ))}
        </>
      )}
    </div>
  );
}
