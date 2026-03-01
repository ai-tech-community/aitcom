import type { Metadata } from "next";
import Image from "next/image";
import { getLocale } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { notFound } from "next/navigation";
import { EventRegisterButton } from "@/components/event-register-button";
import { EventAttendees } from "@/components/event-attendees";
import { LexicalRenderer } from "@/lib/lexical";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { JsonLd } from "@/components/json-ld";

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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: { slug: { equals: slug } },
    locale: locale as "en" | "nl",
    limit: 1,
    depth: 0,
  });
  const event = docs[0];
  if (!event) return {};

  const typeLabel = typeLabels[event.type] ?? event.type;
  const description = `${typeLabel} on ${formatDate(event.date)} at ${event.location}`;

  return {
    title: event.title,
    description,
    ...buildOgMeta(
      event.title,
      description,
      `${typeLabel} · ${formatDate(event.date)} · ${event.location}`,
    ),
    alternates: buildAlternates(`/events/${slug}`),
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: { slug: { equals: slug } },
    depth: 2,
    locale: locale as "en" | "nl",
    limit: 1,
  });

  const event = docs[0];
  if (!event) notFound();

  const speakers = (event.speakers ?? []) as Array<{
    id: number;
    name: string;
    company?: string;
    bio?: string;
    photo?: { url?: string } | number;
  }>;

  const eventId = Number(event.id);
  const maxAttendees = (event.maxAttendees as number | undefined) ?? null;
  const price = (event.price as number | undefined) ?? null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <JsonLd
        data={{
          "@type": "Event",
          name: event.title,
          startDate: event.startTime
            ? `${event.date.split("T")[0]}T${event.startTime}`
            : event.date,
          ...(event.endTime
            ? { endDate: `${event.date.split("T")[0]}T${event.endTime}` }
            : {}),
          location: { "@type": "Place", name: event.location },
          ...(event.image &&
          typeof event.image === "object" &&
          "url" in event.image &&
          event.image.url
            ? { image: event.image.url }
            : {}),
          eventStatus:
            event.status === "cancelled"
              ? "https://schema.org/EventCancelled"
              : "https://schema.org/EventScheduled",
          eventAttendanceMode:
            "https://schema.org/OfflineEventAttendanceMode",
          organizer: {
            "@type": "Organization",
            name: "AIT Community",
            url: "https://aitcommunity.org",
          },
          ...(price != null
            ? {
                offers: {
                  "@type": "Offer",
                  price: (price / 100).toFixed(2),
                  priceCurrency: "EUR",
                  availability: "https://schema.org/InStock",
                },
              }
            : {
                offers: {
                  "@type": "Offer",
                  price: "0",
                  priceCurrency: "EUR",
                  availability: "https://schema.org/InStock",
                },
              }),
        }}
      />

      {/* Meta line */}
      <div className="text-muted-foreground flex flex-wrap items-center gap-2 font-mono text-xs tracking-wider sm:gap-3">
        <span>{formatDate(event.date)}</span>
        {event.startTime && (
          <>
            <span className="text-border hidden sm:inline">|</span>
            <span className="text-border sm:hidden">&middot;</span>
            <span>
              {event.startTime}
              {event.endTime ? ` – ${event.endTime}` : ""}
            </span>
          </>
        )}
        <span className="text-border hidden sm:inline">|</span>
        <span className="text-border sm:hidden">&middot;</span>
        <span>{event.location}</span>
      </div>

      {/* Title */}
      <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
        {event.title}
      </h1>

      {/* Type badge */}
      <div className="mt-4 flex items-center gap-3">
        <span className="border-border text-muted-foreground rounded border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider">
          {typeLabels[event.type] ?? event.type}
        </span>
      </div>

      {/* Featured image */}
      {event.image && typeof event.image === "object" && "url" in event.image && event.image.url && (
        <div className="mt-8 overflow-hidden rounded-lg border border-border">
          <Image
            src={event.image.url}
            alt={event.title}
            width={800}
            height={450}
            className="h-auto w-full object-cover"
            priority
          />
        </div>
      )}

      {/* Description */}
      {event.description && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / ABOUT
            </h2>
          </div>
          <div className="mt-4">
            <LexicalRenderer content={event.description} />
          </div>
        </div>
      )}

      {/* Speakers */}
      {speakers.length > 0 && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / SPEAKERS
            </h2>
          </div>
          <div className="mt-4 space-y-4">
            {speakers.map((speaker) => {
              const photoUrl =
                speaker.photo && typeof speaker.photo === "object"
                  ? speaker.photo.url
                  : undefined;

              return (
                <div
                  key={speaker.id}
                  className="border-border flex items-start gap-4 rounded border border-dashed px-4 py-4"
                >
                  {photoUrl ? (
                    <Image
                      src={photoUrl}
                      alt={speaker.name}
                      className="h-10 w-10 shrink-0 rounded-full object-cover"
                      width={40}
                      height={40}
                    />
                  ) : (
                    <div className="bg-secondary text-muted-foreground flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-mono text-xs">
                      {speaker.name
                        .split(" ")
                        .map((p) => p[0])
                        .join("")
                        .toUpperCase()
                        .slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{speaker.name}</span>
                      {speaker.company && (
                        <span className="text-muted-foreground font-mono text-xs">
                          @ {speaker.company}
                        </span>
                      )}
                    </div>
                    {speaker.bio && (
                      <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                        {speaker.bio}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Attendees & Capacity */}
      <div className="border-border mt-8 border-t pt-8">
        <div className="border-border border-b pb-4">
          <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
            / ATTENDEES
          </h2>
        </div>
        <div className="mt-4">
          <EventAttendees eventId={eventId} maxAttendees={maxAttendees} />
        </div>
      </div>

      {/* Registration */}
      <div className="border-border mt-8 border-t pt-8">
        <div className="border-border border-b pb-4">
          <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
            / REGISTRATION
          </h2>
        </div>
        <div className="mt-4">
          <EventRegisterButton
            eventId={eventId}
            price={price}
          />
        </div>
      </div>
    </div>
  );
}
