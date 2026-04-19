import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import { getLocale } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { notFound } from "next/navigation";
import { EventRegisterButton } from "@/components/event-register-button";
import { EventAttendees } from "@/components/event-attendees";
import { EventShareRow } from "@/components/event-share-row";
import { LexicalRenderer } from "@/lib/lexical";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import { JsonLd } from "@/components/json-ld";
import {
  EVENT_AUDIENCE_LABELS,
  EVENT_FOCUS_LABELS,
  EVENT_FORMAT_LABELS,
  EVENT_LEVEL_LABELS,
  EVENT_TYPE_LABELS,
} from "@/lib/event-metadata";
import type { EventAudience, EventFocus } from "@/lib/event-metadata";

type MediaValue =
  | { url?: string | null; alt?: string | null }
  | number
  | null
  | undefined;

const MONTH_SHORT = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

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

function buildAitRationale({
  focus,
  audience,
  aitFitScore,
}: {
  focus: string | null;
  audience: string[];
  aitFitScore: number | null;
}): string {
  const parts: string[] = [];
  const focusLabel = focus
    ? EVENT_FOCUS_LABELS[focus as EventFocus] ?? String(focus)
    : null;
  const audienceLabels = audience
    .map((a) => EVENT_AUDIENCE_LABELS[a as EventAudience] ?? String(a))
    .filter(Boolean);

  if (focusLabel) parts.push(`${focusLabel.toLowerCase()} focus`);
  if (audienceLabels.length > 0) {
    parts.push(`relevant for ${audienceLabels.join(", ").toLowerCase()}`);
  }
  if (aitFitScore !== null && aitFitScore >= 8) parts.push("strong AIT fit");

  if (parts.length === 0) {
    return "Curated by the AIT event scout.";
  }
  const sentence = parts.join(" · ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
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
  const description =
    event.summary ??
    `${typeLabel} on ${formatDate(event.date)} at ${event.location}`;

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
  const sourceUrl =
    typeof event.sourceUrl === "string" && event.sourceUrl.length > 0
      ? event.sourceUrl
      : null;
  const isExternal = sourceUrl !== null;
  const heroImage = getMedia(
    (event.coverImage as MediaValue) ?? (event.image as MediaValue),
  );
  const gallery = Array.isArray(event.gallery)
    ? event.gallery
        .map((entry) => getMedia(entry as MediaValue))
        .filter(Boolean)
    : [];
  const tags = Array.isArray(event.tags)
    ? event.tags
        .map((entry) =>
          typeof entry === "object" && entry && "tag" in entry
            ? entry.tag
            : null,
        )
        .filter(Boolean)
    : [];
  const audience = Array.isArray(event.audience) ? event.audience : [];
  const attendanceMode =
    event.format === "online"
      ? "https://schema.org/OnlineEventAttendanceMode"
      : event.format === "hybrid"
        ? "https://schema.org/MixedEventAttendanceMode"
        : "https://schema.org/OfflineEventAttendanceMode";

  const dateObj = new Date(event.date);
  const dateMonth = MONTH_SHORT[dateObj.getMonth()] ?? "";
  const dateDay = dateObj.getDate();
  const dateYear = dateObj.getFullYear();
  const locationParts = [event.city, event.region, event.country].filter(
    Boolean,
  );
  const locationShort =
    locationParts.length > 0 ? locationParts.join(", ") : event.location;
  const priceLabel =
    price != null && price > 0
      ? `€${(price / 100).toFixed(2)}`
      : price === 0
        ? "Free"
        : null;

  const aitFitScore =
    typeof event.aitFitScore === "number" ? event.aitFitScore : null;
  const showAitCallout =
    Boolean(event.curatedByAgent) || (aitFitScore !== null && aitFitScore >= 7);
  const aitRationale = showAitCallout
    ? buildAitRationale({
        focus: event.focus ?? null,
        audience,
        aitFitScore,
      })
    : null;

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-12 sm:py-16">
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

      <EventHero
        title={event.title}
        heroImageUrl={heroImage?.url ?? null}
        heroImageAlt={heroImage?.alt ?? event.title}
        typeLabel={EVENT_TYPE_LABELS[event.type] ?? event.type}
        formatLabel={
          event.format ? EVENT_FORMAT_LABELS[event.format] ?? event.format : null
        }
        dateMonth={dateMonth}
        dateDay={dateDay}
        dateYear={dateYear}
        startTime={event.startTime ?? null}
        endTime={event.endTime ?? null}
        location={event.location}
        aitFitScore={
          typeof event.aitFitScore === "number" ? event.aitFitScore : null
        }
      />

      <div className="mt-6">
        <EventShareRow slug={event.slug} title={event.title} />
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-8">
          {event.summary && (
            <p className="text-foreground/90 text-lg leading-relaxed">
              {event.summary}
            </p>
          )}

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="border-border text-muted-foreground rounded-full border px-3 py-1 text-xs"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {Boolean(
            event.focus ??
              event.level ??
              event.videoUrl ??
              (audience.length > 0 || locationParts.length > 0 || null),
          ) && (
            <div className="border-border grid gap-4 rounded-lg border p-4 text-sm sm:grid-cols-2">
              {event.focus && (
                <DetailRow
                  label="Focus"
                  value={EVENT_FOCUS_LABELS[event.focus] ?? event.focus}
                />
              )}
              {event.level && (
                <DetailRow
                  label="Level"
                  value={EVENT_LEVEL_LABELS[event.level] ?? event.level}
                />
              )}
              {audience.length > 0 && (
                <DetailRow
                  label="Audience"
                  value={audience
                    .map((entry) => EVENT_AUDIENCE_LABELS[entry] ?? entry)
                    .join(", ")}
                />
              )}
              {locationParts.length > 0 && (
                <DetailRow label="Region" value={locationShort} />
              )}
              {event.videoUrl && (
                <DetailRow
                  label="Video"
                  value={
                    <a
                      href={event.videoUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-4"
                    >
                      Watch video
                    </a>
                  }
                />
              )}
            </div>
          )}

          {event.description && (
            <div className="border-border border-t pt-8">
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

          {speakers.length > 0 && (
            <div className="border-border border-t pt-8">
              <div className="border-border border-b pb-4">
                <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
                  / SPEAKERS
                </h2>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {speakers.map((speaker) => {
                  const photoUrl =
                    speaker.photo && typeof speaker.photo === "object"
                      ? speaker.photo.url
                      : undefined;
                  return (
                    <div
                      key={speaker.id}
                      className="border-border flex items-start gap-3 rounded-lg border p-4"
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
                        <div className="truncate font-medium">
                          {speaker.name}
                        </div>
                        {speaker.company && (
                          <div className="text-muted-foreground truncate font-mono text-xs">
                            {speaker.company}
                          </div>
                        )}
                        {speaker.bio && (
                          <p className="text-muted-foreground mt-2 line-clamp-3 text-sm leading-relaxed">
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

          {gallery.length > 0 && (
            <div className="border-border border-t pt-8">
              <div className="border-border border-b pb-4">
                <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
                  / GALLERY
                </h2>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {gallery.map((image, index) => (
                  <div
                    key={`${image?.url}-${index}`}
                    className="border-border overflow-hidden rounded-lg border"
                  >
                    {image?.url && (
                      <Image
                        src={image.url}
                        alt={
                          image.alt ?? `${event.title} gallery image ${index + 1}`
                        }
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

          <div className="border-border border-t pt-8">
            <div className="border-border border-b pb-4">
              <h2 className="text-muted-foreground font-mono text-xs font-medium tracking-wider">
                / ATTENDEES
              </h2>
            </div>
            <div className="mt-4">
              <EventAttendees
                eventId={eventId}
                maxAttendees={maxAttendees}
                isExternal={isExternal}
              />
            </div>
          </div>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="border-border bg-card space-y-4 rounded-lg border p-5">
            <div className="space-y-1">
              <div className="text-muted-foreground font-mono text-[11px] tracking-wider">
                {dateMonth} {dateDay}, {dateYear}
              </div>
              {event.startTime && (
                <div className="font-mono text-sm tracking-wider">
                  {event.startTime}
                  {event.endTime ? ` – ${event.endTime}` : ""}
                </div>
              )}
            </div>

            <div className="border-border border-t pt-4 text-sm">
              <div className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
                Location
              </div>
              <div className="mt-1">{event.location}</div>
              {locationParts.length > 0 &&
                locationShort !== event.location && (
                  <div className="text-muted-foreground mt-0.5 text-xs">
                    {locationShort}
                  </div>
                )}
            </div>

            {(event.format ?? priceLabel) && (
              <div className="border-border flex flex-wrap gap-2 border-t pt-4 font-mono text-[11px] tracking-wider">
                {event.format && (
                  <span className="border-border rounded border px-2 py-0.5">
                    {EVENT_FORMAT_LABELS[event.format] ?? event.format}
                  </span>
                )}
                {priceLabel && (
                  <span className="border-border rounded border px-2 py-0.5">
                    {priceLabel}
                  </span>
                )}
              </div>
            )}

            <div className="border-border border-t pt-4">
              <EventRegisterButton
                eventId={eventId}
                price={price}
                isExternal={isExternal}
                sourceUrl={sourceUrl}
              />
            </div>

            {isExternal && sourceUrl && (
              <div className="text-muted-foreground border-border border-t pt-4 font-mono text-[10px] tracking-wider">
                SOURCE ·{" "}
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-4"
                >
                  Original event ↗
                </a>
              </div>
            )}
          </div>

          {showAitCallout && aitRationale && (
            <div className="border-border bg-secondary/30 mt-4 space-y-2 rounded-lg border p-4">
              <div className="flex items-center gap-2 font-mono text-[10px] tracking-wider">
                <span className="bg-foreground text-background rounded px-1.5 py-0.5">
                  AIT PICK
                </span>
                {aitFitScore !== null && (
                  <span className="text-muted-foreground">
                    FIT {aitFitScore}/10
                  </span>
                )}
              </div>
              <p className="text-foreground/80 text-xs leading-relaxed">
                {aitRationale}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

function EventHero({
  title,
  heroImageUrl,
  heroImageAlt,
  typeLabel,
  formatLabel,
  dateMonth,
  dateDay,
  dateYear,
  startTime,
  endTime,
  location,
  aitFitScore,
}: {
  title: string;
  heroImageUrl: string | null;
  heroImageAlt: string;
  typeLabel: string;
  formatLabel: string | null;
  dateMonth: string;
  dateDay: number;
  dateYear: number;
  startTime: string | null;
  endTime: string | null;
  location: string;
  aitFitScore: number | null;
}) {
  return (
    <div className="border-border bg-secondary/30 relative overflow-hidden rounded-2xl border">
      <div className="relative h-64 w-full sm:h-80">
        {heroImageUrl ? (
          <Image
            src={heroImageUrl}
            alt={heroImageAlt}
            fill
            priority
            className="object-cover"
            sizes="(min-width: 1024px) 1024px, 100vw"
          />
        ) : (
          <div className="from-foreground/10 via-foreground/5 absolute inset-0 bg-linear-to-br to-transparent" />
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/40 to-black/10" />
      </div>

      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
        <div className="flex flex-wrap items-end gap-4 sm:gap-6">
          <div className="bg-background/95 text-foreground flex h-16 w-16 flex-col items-center justify-center rounded-lg text-center shadow-lg sm:h-20 sm:w-20">
            <span className="font-mono text-[10px] tracking-wider sm:text-xs">
              {dateMonth}
            </span>
            <span className="text-2xl leading-none font-bold sm:text-3xl">
              {dateDay}
            </span>
            <span className="text-muted-foreground font-mono text-[9px] tracking-wider sm:text-[10px]">
              {dateYear}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] tracking-wider text-white/80 sm:text-[11px]">
              <span>{typeLabel}</span>
              {formatLabel && (
                <>
                  <span>·</span>
                  <span>{formatLabel}</span>
                </>
              )}
              {startTime && (
                <>
                  <span>·</span>
                  <span>
                    {startTime}
                    {endTime ? `–${endTime}` : ""}
                  </span>
                </>
              )}
              {aitFitScore !== null && (
                <>
                  <span>·</span>
                  <span className="bg-foreground text-background rounded px-1.5 py-0.5">
                    AIT {aitFitScore}/10
                  </span>
                </>
              )}
            </div>
            <h1 className="mt-2 text-2xl leading-tight font-extrabold tracking-tight text-white sm:text-4xl">
              {title}
            </h1>
            <div className="mt-1 font-mono text-[11px] tracking-wider text-white/80 sm:text-xs">
              {location}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-muted-foreground font-mono text-[11px] tracking-wider uppercase">
        {label}
      </span>
      <span>{value}</span>
    </div>
  );
}
