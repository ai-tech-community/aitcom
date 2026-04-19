import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import { getLocale } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { notFound } from "next/navigation";
import { EventRegisterButton } from "@/components/event-register-button";
import { EventAttendees } from "@/components/event-attendees";
import { LexicalRenderer } from "@/lib/lexical";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { JsonLd } from "@/components/json-ld";
import {
  EVENT_AUDIENCE_LABELS,
  EVENT_FOCUS_LABELS,
  EVENT_FORMAT_LABELS,
  EVENT_LEVEL_LABELS,
  EVENT_REVIEW_STATUS_LABELS,
  EVENT_TYPE_LABELS,
} from "@/lib/event-metadata";

type MediaValue = { url?: string | null; alt?: string | null } | number | null | undefined;

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

function getMedia(media: MediaValue) {
  if (media && typeof media === "object" && "url" in media && media.url) {
    return { url: media.url, alt: media.alt ?? undefined };
  }
  return null;
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
    depth: 1,
  });
  const event = docs[0];
  if (!event) return {};

  const typeLabel = EVENT_TYPE_LABELS[event.type] ?? event.type;
  const description = event.summary ?? `${typeLabel} on ${formatDate(event.date)} at ${event.location}`;

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
  const heroImage = getMedia((event.coverImage as MediaValue) ?? (event.image as MediaValue));
  const gallery = Array.isArray(event.gallery)
    ? event.gallery.map((entry) => getMedia(entry as MediaValue)).filter(Boolean)
    : [];
  const tags = Array.isArray(event.tags)
    ? event.tags.map((entry) => (typeof entry === "object" && entry && "tag" in entry ? entry.tag : null)).filter(Boolean)
    : [];
  const audience = Array.isArray(event.audience) ? event.audience : [];
  const attendanceMode =
    event.format === "online"
      ? "https://schema.org/OnlineEventAttendanceMode"
      : event.format === "hybrid"
        ? "https://schema.org/MixedEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode";

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <JsonLd
        data={{
          "@type": "Event",
          name: event.title,
          description: event.summary ?? undefined,
          startDate: event.startTime
            ? `${event.date.split("T")[0]}T${event.startTime}`
            : event.date,
          ...(event.endTime
            ? { endDate: `${event.date.split("T")[0]}T${event.endTime}` }
            : {}),
          location: {
            "@type": "Place",
            name: event.location,
            ...(event.city || event.region || event.country
              ? {
                  address: {
                    "@type": "PostalAddress",
                    addressLocality: event.city ?? undefined,
                    addressRegion: event.region ?? undefined,
                    addressCountry: event.country ?? undefined,
                  },
                }
              : {}),
          },
          ...(heroImage?.url ? { image: heroImage.url } : {}),
          ...(event.videoUrl ? { video: event.videoUrl } : {}),
          ...(event.sourceUrl ? { url: event.sourceUrl } : {}),
          eventStatus:
            event.status === "cancelled"
              ? "https://schema.org/EventCancelled"
              : "https://schema.org/EventScheduled",
          eventAttendanceMode: attendanceMode,
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
        {event.format && (
          <>
            <span className="text-border hidden sm:inline">|</span>
            <span className="text-border sm:hidden">&middot;</span>
            <span>{EVENT_FORMAT_LABELS[event.format] ?? event.format}</span>
          </>
        )}
      </div>

      <h1 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
        {event.title}
      </h1>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="border-border text-muted-foreground rounded border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider">
          {EVENT_TYPE_LABELS[event.type] ?? event.type}
        </span>
        {event.reviewStatus && (
          <span className="border-border text-muted-foreground rounded border px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider">
            {EVENT_REVIEW_STATUS_LABELS[event.reviewStatus] ?? event.reviewStatus}
          </span>
        )}
        {typeof event.aitFitScore === "number" && (
          <span className="rounded bg-foreground px-2.5 py-0.5 font-mono text-[11px] font-medium tracking-wider text-background">
            AIT FIT {event.aitFitScore}/10
          </span>
        )}
      </div>

      {heroImage?.url && (
        <div className="mt-8 overflow-hidden rounded-lg border border-border">
          <Image
            src={heroImage.url}
            alt={heroImage.alt ?? event.title}
            width={1200}
            height={675}
            className="h-auto w-full object-cover"
            priority
          />
        </div>
      )}

      {(event.summary ?? event.focus ?? event.level ?? event.city ?? event.region ?? event.country ?? event.sourceUrl ?? event.videoUrl ?? (audience.length > 0 ? "audience" : undefined) ?? (tags.length > 0 ? "tags" : undefined)) && (
        <div className="border-border mt-8 grid gap-6 border-t pt-8 lg:grid-cols-[2fr_1fr]">
          <div>
            {event.summary && (
              <p className="text-lg leading-relaxed text-foreground/90">{event.summary ?? undefined}</p>
            )}
            {tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-3 rounded-lg border border-border p-4 text-sm">
            {event.focus && <DetailRow label="Focus" value={EVENT_FOCUS_LABELS[event.focus] ?? event.focus} />}
            {event.level && <DetailRow label="Level" value={EVENT_LEVEL_LABELS[event.level] ?? event.level} />}
            {audience.length > 0 && <DetailRow label="Audience" value={audience.map((entry) => EVENT_AUDIENCE_LABELS[entry] ?? entry).join(", ")} />}
            {(event.city ?? event.region ?? event.country) && <DetailRow label="Region" value={[event.city, event.region, event.country].filter(Boolean).join(", ")} />}
            {event.discoverySource && <DetailRow label="Discovery" value={event.discoverySource} />}
            {typeof event.confidenceScore === "number" && <DetailRow label="Confidence" value={String(event.confidenceScore)} />}
            {event.lastVerifiedAt && <DetailRow label="Verified" value={new Date(event.lastVerifiedAt).toLocaleString(locale)} />}
            {event.curatedByAgent && <DetailRow label="Curated" value="By agent" />}
            {event.sourceUrl && <DetailRow label="Source" value={<a href={event.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">Original event</a>} />}
            {event.videoUrl && <DetailRow label="Video" value={<a href={event.videoUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4">Watch video</a>} />}
          </div>
        </div>
      )}

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

      {gallery.length > 0 && (
        <div className="border-border mt-8 border-t pt-8">
          <div className="border-border border-b pb-4">
            <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
              / GALLERY
            </h2>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gallery.map((image, index) => (
              <div key={`${image?.url}-${index}`} className="overflow-hidden rounded-lg border border-border">
                {image?.url && (
                  <Image
                    src={image.url}
                    alt={image.alt ?? `${event.title} gallery image ${index + 1}`}
                    width={600}
                    height={400}
                    className="h-56 w-full object-cover"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
