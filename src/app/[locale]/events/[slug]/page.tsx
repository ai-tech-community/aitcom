import type { Metadata } from "next";
import type { ReactNode } from "react";
import type { Where } from "payload";
import Image from "next/image";
import { getLocale } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { notFound } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { EventRegisterButton } from "@/components/event-register-button";
import { EventAttendees } from "@/components/event-attendees";
import { EventShareRow } from "@/components/event-share-row";
import { LexicalRenderer } from "@/lib/lexical";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { JsonLd } from "@/components/json-ld";
import {
  EVENT_FOCUS_LABELS,
  EVENT_FORMAT_LABELS,
  EVENT_LEVEL_LABELS,
  EVENT_TYPE_LABELS,
} from "@/lib/event-metadata";
import type { EventFocus } from "@/lib/event-metadata";
import type { Audience } from "@/payload-types";
import {
  formatEventIsoWithOffset,
  formatEventTimeRange,
} from "@/lib/event-time";
import { EventTimeDisplay } from "@/components/event-time-display";
import { getTranslations } from "next-intl/server";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import { getInitials } from "@/lib/avatar";

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
  // Display names of the event's `audiences` relationship docs (already
  // resolved by the caller — see `audience` below).
  audience: string[];
  aitFitScore: number | null;
}): string {
  const parts: string[] = [];
  const focusLabel = focus
    ? (EVENT_FOCUS_LABELS[focus as EventFocus] ?? String(focus))
    : null;

  if (focusLabel) parts.push(`${focusLabel.toLowerCase()} focus`);
  if (audience.length > 0) {
    parts.push(`relevant for ${audience.join(", ").toLowerCase()}`);
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
    where: {
      and: [
        { slug: { equals: slug } },
        // Hide un-approved submissions (pending/rejected) from public view
        { status: { not_in: ["draft", "rejected"] } },
      ],
    },
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
    alternates: await localeAlternates(`/events/${slug}`),
  };
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const tEvents = await getTranslations("events");

  const payload = await getPayloadClient();
  const { docs } = await payload.find({
    collection: "events",
    where: {
      and: [
        { slug: { equals: slug } },
        // Hide un-approved submissions (pending/rejected) from public view
        { status: { not_in: ["draft", "rejected"] } },
      ],
    },
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
  // events.audience is a relationship to `audiences`, populated (depth: 2
  // above) into full Audience docs. Non-populated (bare id) entries are
  // guarded out defensively rather than trusted.
  const audience = (Array.isArray(event.audience) ? event.audience : [])
    .filter(
      (entry): entry is Audience => typeof entry === "object" && entry !== null,
    )
    .map((entry) => entry.name);
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

  let hackathonChallenge: {
    id: number;
    rewards: {
      xpReward?: number | null;
      sponsorReward?: string | null;
      badgeReward?: string | null;
    };
  } | null = null;
  if (event.challengeId) {
    try {
      const ch = await payload.findByID({
        collection: "challenges",
        id: Number(event.challengeId),
        depth: 0,
      });
      hackathonChallenge = {
        id: Number(ch.id),
        rewards: (ch.rewards ?? {}) as {
          xpReward?: number | null;
          sponsorReward?: string | null;
          badgeReward?: string | null;
        },
      };
    } catch {
      hackathonChallenge = null;
    }
  }

  const now = new Date().toISOString();
  const relatedOrConditions: Where[] = [{ type: { equals: event.type } }];
  if (event.focus) {
    relatedOrConditions.push({ focus: { equals: event.focus } });
  }

  const { docs: relatedEvents } = await payload.find({
    collection: "events",
    where: {
      and: [
        { status: { equals: "published" } },
        { date: { greater_than_equal: now } },
        { id: { not_equals: event.id } },
        { or: relatedOrConditions },
      ],
    },
    sort: "date",
    locale: locale as "en" | "nl",
    depth: 1,
    limit: 3,
  });

  // Prizes for hackathons — reuse the same labels the winners page uses.
  let prizeParts: Array<{ label: string; value: string }> = [];
  if (hackathonChallenge) {
    const t = await getTranslations("hackathon");
    const r = hackathonChallenge.rewards;
    const parts: Array<{ label: string; value: string }> = [];
    if (r.xpReward)
      parts.push({ label: t("xpReward"), value: `${r.xpReward} XP` });
    if (r.badgeReward) parts.push({ label: t("badge"), value: r.badgeReward });
    if (r.sponsorReward)
      parts.push({ label: t("sponsorPrize"), value: r.sponsorReward });
    prizeParts = parts;
  }

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

  // HACKATHON: the hub layout owns the chrome (cover/title/phase/tabs + the
  // max-w container). Render ONLY the overview body — no breadcrumb, no
  // EventHero, no outer container — plus a Prizes block. Team-formation UI
  // (formerly HackathonPanel) lives in the My Team / Participants tabs now.
  if (hackathonChallenge) {
    return (
      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-8">
          {event.summary && (
            <p className="text-foreground/90 text-lg leading-relaxed">
              {event.summary}
            </p>
          )}

          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="outline" className="px-3 py-1">
                  #{tag}
                </Badge>
              ))}
            </div>
          )}

          {prizeParts.length > 0 && (
            <div className="border-border bg-card space-y-3 rounded-lg border p-4">
              <SectionLabel bordered={false}>
                {tEvents("sectionPrizes")}
              </SectionLabel>
              <dl className="grid gap-3 sm:grid-cols-2">
                {prizeParts.map((part) => (
                  <div key={part.label} className="flex flex-col gap-1">
                    <dt className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                      {part.label}
                    </dt>
                    <dd className="text-sm font-medium">{part.value}</dd>
                  </div>
                ))}
              </dl>
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
                <DetailRow label="Audience" value={audience.join(", ")} />
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
              <SectionLabel>{tEvents("sectionAbout")}</SectionLabel>
              <div className="mt-4">
                <LexicalRenderer content={event.description} />
              </div>
            </div>
          )}

          {speakers.length > 0 && (
            <div className="border-border border-t pt-8">
              <SectionLabel>{tEvents("sectionSpeakers")}</SectionLabel>
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
                      <Avatar size="lg" className="shrink-0">
                        {photoUrl ? (
                          <AvatarImage
                            src={photoUrl}
                            alt={speaker.name}
                            className="object-cover"
                          />
                        ) : null}
                        <AvatarFallback className="bg-secondary font-mono text-xs">
                          {getInitials(speaker.name)}
                        </AvatarFallback>
                      </Avatar>
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
              <SectionLabel>{tEvents("sectionGallery")}</SectionLabel>
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
                          image.alt ??
                          `${event.title} gallery image ${index + 1}`
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
            <SectionLabel>{tEvents("attendees")}</SectionLabel>
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
              <div className="text-muted-foreground font-mono text-xs tracking-wider">
                {dateMonth} {dateDay}, {dateYear}
              </div>
              <EventTimeDisplay
                date={event.date}
                startTime={event.startTime ?? null}
                endTime={event.endTime ?? null}
                timezone={event.timezone ?? null}
              />
            </div>

            <div className="border-border border-t pt-4 text-sm">
              <div className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                Location
              </div>
              <div className="mt-1">{event.location}</div>
              {locationParts.length > 0 && locationShort !== event.location && (
                <div className="text-muted-foreground mt-0.5 text-xs">
                  {locationShort}
                </div>
              )}
              {event.format !== "online" && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    [event.location, locationShort].filter(Boolean).join(", "),
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground mt-2 inline-block font-mono text-xs tracking-wider underline underline-offset-4"
                >
                  View on map ↗
                </a>
              )}
            </div>

            {(event.format ?? priceLabel) && (
              <div className="border-border flex flex-wrap gap-2 border-t pt-4">
                {event.format && (
                  <Badge
                    variant="outline"
                    className="rounded-md font-mono text-xs tracking-wider"
                  >
                    {EVENT_FORMAT_LABELS[event.format] ?? event.format}
                  </Badge>
                )}
                {priceLabel && (
                  <Badge
                    variant="outline"
                    className="rounded-md font-mono text-xs tracking-wider"
                  >
                    {priceLabel}
                  </Badge>
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
              <div className="text-muted-foreground border-border border-t pt-4 font-mono text-xs tracking-wider">
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
        </aside>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 sm:px-12 sm:py-16">
      <JsonLd
        data={{
          "@type": "Event",
          name: event.title,
          description: event.summary ?? undefined,
          startDate: event.startTime
            ? formatEventIsoWithOffset(
                event.date,
                event.startTime,
                event.timezone,
              )
            : event.date,
          ...(event.endTime
            ? {
                endDate: formatEventIsoWithOffset(
                  event.date,
                  event.endTime,
                  event.timezone,
                ),
              }
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

      <nav className="mb-6 flex items-center gap-2 font-mono text-xs tracking-wider">
        <Link
          href="/events"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          / EVENTS
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-foreground/80 truncate">{event.title}</span>
      </nav>

      <EventHero
        title={event.title}
        heroImageUrl={heroImage?.url ?? null}
        heroImageAlt={heroImage?.alt ?? event.title}
        typeLabel={EVENT_TYPE_LABELS[event.type] ?? event.type}
        formatLabel={
          event.format
            ? (EVENT_FORMAT_LABELS[event.format] ?? event.format)
            : null
        }
        dateMonth={dateMonth}
        dateDay={dateDay}
        dateYear={dateYear}
        timeLabel={formatEventTimeRange({
          date: event.date,
          startTime: event.startTime,
          endTime: event.endTime,
          timezone: event.timezone,
        })}
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
                <Badge key={tag} variant="outline" className="px-3 py-1">
                  #{tag}
                </Badge>
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
                <DetailRow label="Audience" value={audience.join(", ")} />
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
              <SectionLabel>{tEvents("sectionAbout")}</SectionLabel>
              <div className="mt-4">
                <LexicalRenderer content={event.description} />
              </div>
            </div>
          )}

          {speakers.length > 0 && (
            <div className="border-border border-t pt-8">
              <SectionLabel>{tEvents("sectionSpeakers")}</SectionLabel>
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
                      <Avatar size="lg" className="shrink-0">
                        {photoUrl ? (
                          <AvatarImage
                            src={photoUrl}
                            alt={speaker.name}
                            className="object-cover"
                          />
                        ) : null}
                        <AvatarFallback className="bg-secondary font-mono text-xs">
                          {getInitials(speaker.name)}
                        </AvatarFallback>
                      </Avatar>
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
              <SectionLabel>{tEvents("sectionGallery")}</SectionLabel>
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
                          image.alt ??
                          `${event.title} gallery image ${index + 1}`
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
            <SectionLabel>{tEvents("attendees")}</SectionLabel>
            <div className="mt-4">
              <EventAttendees
                eventId={eventId}
                maxAttendees={maxAttendees}
                isExternal={isExternal}
              />
            </div>
          </div>

          {relatedEvents.length > 0 && (
            <div className="border-border border-t pt-8">
              <SectionLabel>{tEvents("sectionRelated")}</SectionLabel>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {relatedEvents.map((related) => {
                  const relMedia = getMedia(
                    (related.coverImage as MediaValue) ??
                      (related.image as MediaValue),
                  );
                  const relDate = new Date(related.date);
                  return (
                    <Link
                      key={related.id}
                      href={`/events/${related.slug}`}
                      className="group border-border hover:bg-secondary/40 overflow-hidden rounded-lg border transition-colors"
                    >
                      {relMedia?.url && (
                        <div className="border-border overflow-hidden border-b">
                          <Image
                            src={relMedia.url}
                            alt={related.title}
                            width={400}
                            height={200}
                            className="h-32 w-full object-cover transition-transform group-hover:scale-[1.02]"
                          />
                        </div>
                      )}
                      <div className="space-y-2 p-3">
                        <div className="text-muted-foreground font-mono text-xs tracking-wider">
                          {MONTH_SHORT[relDate.getMonth()]} {relDate.getDate()},{" "}
                          {relDate.getFullYear()}
                          {" · "}
                          {EVENT_TYPE_LABELS[related.type] ?? related.type}
                        </div>
                        <div className="line-clamp-2 text-sm leading-tight font-semibold">
                          {related.title}
                        </div>
                        <div className="text-muted-foreground line-clamp-1 text-xs">
                          {related.location}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="border-border bg-card space-y-4 rounded-lg border p-5">
            <div className="space-y-1">
              <div className="text-muted-foreground font-mono text-xs tracking-wider">
                {dateMonth} {dateDay}, {dateYear}
              </div>
              <EventTimeDisplay
                date={event.date}
                startTime={event.startTime ?? null}
                endTime={event.endTime ?? null}
                timezone={event.timezone ?? null}
              />
            </div>

            <div className="border-border border-t pt-4 text-sm">
              <div className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
                Location
              </div>
              <div className="mt-1">{event.location}</div>
              {locationParts.length > 0 && locationShort !== event.location && (
                <div className="text-muted-foreground mt-0.5 text-xs">
                  {locationShort}
                </div>
              )}
              {event.format !== "online" && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    [event.location, locationShort].filter(Boolean).join(", "),
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground mt-2 inline-block font-mono text-xs tracking-wider underline underline-offset-4"
                >
                  View on map ↗
                </a>
              )}
            </div>

            {(event.format ?? priceLabel) && (
              <div className="border-border flex flex-wrap gap-2 border-t pt-4">
                {event.format && (
                  <Badge
                    variant="outline"
                    className="rounded-md font-mono text-xs tracking-wider"
                  >
                    {EVENT_FORMAT_LABELS[event.format] ?? event.format}
                  </Badge>
                )}
                {priceLabel && (
                  <Badge
                    variant="outline"
                    className="rounded-md font-mono text-xs tracking-wider"
                  >
                    {priceLabel}
                  </Badge>
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
              <div className="text-muted-foreground border-border border-t pt-4 font-mono text-xs tracking-wider">
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
              <div className="flex items-center gap-2 font-mono text-xs tracking-wider">
                <Badge className="rounded-md font-mono text-xs tracking-wider">
                  AIT PICK
                </Badge>
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
  timeLabel,
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
  timeLabel: string | null;
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
        <div className="absolute inset-0 bg-linear-to-t from-black/95 via-black/70 to-black/30" />
      </div>

      <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
        <div className="flex flex-wrap items-end gap-4 sm:gap-6">
          <div className="bg-background/95 text-foreground flex h-16 w-16 flex-col items-center justify-center rounded-lg text-center shadow-lg sm:h-20 sm:w-20">
            <span className="font-mono text-xs tracking-wider sm:text-xs">
              {dateMonth}
            </span>
            <span className="text-2xl leading-none font-semibold sm:text-3xl">
              {dateDay}
            </span>
            <span className="text-muted-foreground font-mono text-xs tracking-wider sm:text-xs">
              {dateYear}
            </span>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs tracking-wider text-white/80 sm:text-xs">
              <span>{typeLabel}</span>
              {formatLabel && (
                <>
                  <span>·</span>
                  <span>{formatLabel}</span>
                </>
              )}
              {timeLabel && (
                <>
                  <span>·</span>
                  <span>{timeLabel}</span>
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
            <h1 className="mt-2 text-2xl leading-tight font-semibold tracking-tight text-white sm:text-4xl">
              {title}
            </h1>
            <div className="mt-1 font-mono text-xs tracking-wider text-white/80 sm:text-xs">
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
      <span className="text-muted-foreground font-mono text-xs tracking-wider uppercase">
        {label}
      </span>
      <span>{value}</span>
    </div>
  );
}
