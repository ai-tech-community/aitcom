import type { Metadata } from "next";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { Link } from "@/i18n/navigation";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { EVENT_FORMAT_LABELS, EVENT_TYPE_LABELS } from "@/lib/event-metadata";

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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

function getImageUrl(event: { coverImage?: unknown; image?: unknown }) {
  const media = event.coverImage ?? event.image;
  if (media && typeof media === "object" && "url" in media && typeof media.url === "string") {
    return media.url;
  }
  return null;
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
    depth: 1,
  });

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
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
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {events.map((event) => {
            const imageUrl = getImageUrl(event);
            const summary = typeof event.summary === "string" ? event.summary : "";
            return (
              <Link
                key={event.id}
                href={`/events/${event.slug}`}
                className="group overflow-hidden rounded-xl border border-border transition-colors hover:bg-secondary/40"
              >
                {imageUrl && (
                  <div className="overflow-hidden border-b border-border">
                    <Image
                      src={imageUrl}
                      alt={event.title}
                      width={800}
                      height={450}
                      className="h-52 w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                  </div>
                )}
                <div className="space-y-4 p-5">
                  <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] tracking-wider text-muted-foreground">
                    <span>{formatDate(event.date)}</span>
                    <span>•</span>
                    <span>{EVENT_TYPE_LABELS[event.type] ?? event.type}</span>
                    {event.format && (
                      <>
                        <span>•</span>
                        <span>{EVENT_FORMAT_LABELS[event.format] ?? event.format}</span>
                      </>
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold leading-tight">{event.title}</h2>
                    <p className="text-muted-foreground mt-2 text-sm">{event.location}</p>
                  </div>
                  {summary && (
                    <p className="line-clamp-3 text-sm leading-relaxed text-foreground/80">{summary}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {event.focus && (
                      <span className="rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
                        {String(event.focus)}
                      </span>
                    )}
                    {typeof event.aitFitScore === "number" && (
                      <span className="rounded-full bg-foreground px-2.5 py-1 text-[11px] text-background">
                        AIT {event.aitFitScore}/10
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
