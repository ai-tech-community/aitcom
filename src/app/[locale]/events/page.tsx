import type { Metadata } from "next";
import type { Where } from "payload";
import Image from "next/image";
import { getLocale, getTranslations } from "next-intl/server";
import { getPayloadClient } from "@/server/payload";
import { Link } from "@/i18n/navigation";
import { db } from "@/server/db";
import { communities } from "@/server/db/schema";
import { inArray } from "drizzle-orm";
import { buildAlternates, buildOgMeta } from "@/lib/metadata";
import {
  EVENT_FORMAT_LABELS,
  EVENT_FORMAT_OPTIONS,
  EVENT_FOCUS_OPTIONS,
  EVENT_TYPE_LABELS,
  EVENT_TYPES,
  type EventFocus,
  type EventFormat,
  type EventType,
} from "@/lib/event-metadata";
import { EventsFilterBar } from "@/components/events-filter-bar";
import { Badge } from "@/components/ui/badge";
import { SectionLabel } from "@/components/ui/section-label";
import { EventsMap, type MapEvent } from "@/components/events-map";
import { UseMyLocationButton } from "@/components/use-my-location-button";
import { getVisitorLocation } from "@/lib/visitor-location";
import { haversineDistanceKm, formatDistance } from "@/lib/geo";
import { formatEventTimeRange } from "@/lib/event-time";

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

function toMapEvents(
  events: Array<{
    id: number;
    slug: string;
    title: string;
    date: string;
    location: string;
    latitude?: number | null;
    longitude?: number | null;
    type: string;
    aitFitScore?: number | null;
  }>,
): MapEvent[] {
  return events
    .filter(
      (e): e is typeof e & { latitude: number; longitude: number } =>
        typeof e.latitude === "number" && typeof e.longitude === "number",
    )
    .map((e) => ({
      id: e.id,
      slug: e.slug,
      title: e.title,
      date: e.date,
      location: e.location,
      latitude: e.latitude,
      longitude: e.longitude,
      type: e.type,
      aitFitScore: e.aitFitScore ?? null,
    }));
}

function getImageUrl(event: { coverImage?: unknown; image?: unknown }) {
  const media = event.coverImage ?? event.image;
  if (
    media &&
    typeof media === "object" &&
    "url" in media &&
    typeof media.url === "string"
  ) {
    return media.url;
  }
  return null;
}

function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  return value && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

type SP = Record<string, string | string[] | undefined>;

function firstParam(sp: SP, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const locale = await getLocale();
  const t = await getTranslations("events");
  const sp = await searchParams;

  const isPast = firstParam(sp, "past") === "1";
  const q = firstParam(sp, "q")?.trim();
  const type = oneOf<EventType>(firstParam(sp, "type"), EVENT_TYPES);
  const focus = oneOf<EventFocus>(firstParam(sp, "focus"), EVENT_FOCUS_OPTIONS);
  const format = oneOf<EventFormat>(
    firstParam(sp, "format"),
    EVENT_FORMAT_OPTIONS,
  );
  const fitRaw = Number(firstParam(sp, "fit"));
  const fit =
    Number.isFinite(fitRaw) && fitRaw >= 1 && fitRaw <= 10 ? fitRaw : undefined;

  const sortRaw = firstParam(sp, "sort");
  const sort: "date" | "fit" | "newest" | "near" =
    sortRaw === "fit" || sortRaw === "newest" || sortRaw === "near"
      ? sortRaw
      : "date";

  const userLat = Number(firstParam(sp, "lat"));
  const userLng = Number(firstParam(sp, "lng"));
  const userCoords =
    Number.isFinite(userLat) && Number.isFinite(userLng)
      ? { lat: userLat, lng: userLng }
      : null;
  const nearSort = sort === "near" && userCoords !== null;

  const pageRaw = Number(firstParam(sp, "page"));
  const page =
    Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  const isMapView = firstParam(sp, "view") === "map";
  const perPage = isMapView || nearSort ? 200 : 12;

  const visitor = await getVisitorLocation();
  const countryParam = firstParam(sp, "country");
  const nearMe = firstParam(sp, "near") === "1";
  const activeCountry =
    countryParam ?? (nearMe ? (visitor?.countryName ?? null) : null);

  const now = new Date().toISOString();
  const conditions: Where[] = [{ status: { equals: "published" } }];
  // Discovered (Luma) events are "scheduled around, not attended through"
  // (CONTEXT.md [[discovered-event]]) — keep them out of this hub-wide
  // public listing; they stay in the conflict corpus (corpus.ts untouched).
  conditions.push({ discoverySource: { not_equals: "luma" } });
  conditions.push(
    isPast
      ? { date: { less_than: now } }
      : { date: { greater_than_equal: now } },
  );
  if (type) conditions.push({ type: { equals: type } });
  if (focus) conditions.push({ focus: { equals: focus } });
  if (format) conditions.push({ format: { equals: format } });
  if (fit) conditions.push({ aitFitScore: { greater_than_equal: fit } });
  if (activeCountry) conditions.push({ country: { like: activeCountry } });
  if (q && q.length > 0) {
    conditions.push({
      or: [
        { title: { like: q } },
        { summary: { like: q } },
        { location: { like: q } },
      ],
    });
  }

  const sortParam =
    sort === "fit"
      ? "-aitFitScore"
      : sort === "newest"
        ? "-createdAt"
        : isPast
          ? "-date"
          : "date";

  if (nearSort) {
    conditions.push({ latitude: { exists: true } });
    conditions.push({ longitude: { exists: true } });
  }

  const payload = await getPayloadClient();
  const {
    docs: eventsFetched,
    totalPages,
    page: currentPage,
  } = await payload.find({
    collection: "events",
    where: { and: conditions },
    sort: sortParam,
    locale: locale as "en" | "nl",
    draft: false,
    depth: 1,
    limit: perPage,
    page,
  });

  const distanceByEventId = new Map<number, number>();
  let events = eventsFetched;
  if (nearSort && userCoords) {
    const withDistance = eventsFetched
      .map((e) => {
        if (typeof e.latitude !== "number" || typeof e.longitude !== "number")
          return null;
        const km = haversineDistanceKm(userCoords, {
          lat: e.latitude,
          lng: e.longitude,
        });
        distanceByEventId.set(e.id, km);
        return { event: e, km };
      })
      .filter(
        (x): x is { event: (typeof eventsFetched)[number]; km: number } =>
          x !== null,
      );
    withDistance.sort((a, b) => a.km - b.km);
    events = withDistance.map((x) => x.event);
  }

  // Batch-fetch community metadata for events sourced from a community
  const communityIds = [
    ...new Set(
      eventsFetched
        .map((e) => e.communityId as string | undefined)
        .filter((id): id is string => !!id),
    ),
  ];

  const communityRows =
    communityIds.length > 0
      ? await db
          .select({
            id: communities.id,
            name: communities.name,
            slug: communities.slug,
            logoUrl: communities.logoUrl,
          })
          .from(communities)
          .where(inArray(communities.id, communityIds))
      : [];

  const communityMap = Object.fromEntries(
    communityRows.map((c) => [c.id, c]),
  ) as Record<string, { name: string; slug: string; logoUrl: string | null }>;

  const hasFilters =
    !!q ||
    !!type ||
    !!focus ||
    !!format ||
    fit !== undefined ||
    !!countryParam ||
    nearMe;

  const baseParams = () => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (type) next.set("type", type);
    if (focus) next.set("focus", focus);
    if (format) next.set("format", format);
    if (fit) next.set("fit", String(fit));
    if (sort !== "date") next.set("sort", sort);
    if (countryParam) next.set("country", countryParam);
    if (nearMe) next.set("near", "1");
    if (isMapView) next.set("view", "map");
    if (userCoords) {
      next.set("lat", String(userLat));
      next.set("lng", String(userLng));
    }
    return next;
  };

  const buildViewHref = (view: "grid" | "map") => {
    const next = baseParams();
    if (view === "map") next.set("view", "map");
    else next.delete("view");
    if (isPast) next.set("past", "1");
    const qs = next.toString();
    return qs ? `/events?${qs}` : "/events";
  };

  const buildTabHref = (past: boolean) => {
    const next = baseParams();
    if (past) next.set("past", "1");
    const qs = next.toString();
    return qs ? `/events?${qs}` : "/events";
  };

  const buildPageHref = (targetPage: number) => {
    const next = baseParams();
    if (isPast) next.set("past", "1");
    if (targetPage > 1) next.set("page", String(targetPage));
    const qs = next.toString();
    return qs ? `/events?${qs}` : "/events";
  };

  return (
    <div className="mx-auto max-w-6xl px-6 py-16 sm:px-12">
      <SectionLabel as="h1">{t("title")}</SectionLabel>

      <div className="mt-6 flex gap-1 font-mono text-xs tracking-wider">
        <Link
          href={buildTabHref(false)}
          className={`rounded border px-4 py-2 transition-colors ${
            !isPast
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-secondary/40"
          }`}
        >
          UPCOMING
        </Link>
        <Link
          href={buildTabHref(true)}
          className={`rounded border px-4 py-2 transition-colors ${
            isPast
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-secondary/40"
          }`}
        >
          PAST
        </Link>
      </div>

      <EventsFilterBar
        visitorCountryCode={visitor?.countryCode ?? null}
        visitorCountryName={visitor?.countryName ?? null}
      />

      <div className="mt-4 flex flex-wrap items-center gap-2 font-mono text-xs tracking-wider">
        <UseMyLocationButton />
        <Link
          href={buildViewHref("grid")}
          className={`rounded border px-3 py-1.5 transition-colors ${
            !isMapView
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-secondary/40"
          }`}
        >
          GRID
        </Link>
        <Link
          href={buildViewHref("map")}
          className={`rounded border px-3 py-1.5 transition-colors ${
            isMapView
              ? "border-foreground bg-foreground text-background"
              : "border-border text-muted-foreground hover:bg-secondary/40"
          }`}
        >
          MAP
        </Link>
      </div>

      {isMapView ? (
        <EventsMap events={toMapEvents(events)} userCoords={userCoords} />
      ) : events.length === 0 ? (
        <p className="text-muted-foreground mt-12 text-center">
          {hasFilters
            ? "No events match these filters."
            : isPast
              ? "No past events yet."
              : t("noEvents")}
        </p>
      ) : (
        <div className="mt-8 grid gap-5 lg:grid-cols-2">
          {events.map((event) => {
            const imageUrl = getImageUrl(event);
            const summary =
              typeof event.summary === "string" ? event.summary : "";
            const distanceKm = distanceByEventId.get(event.id);
            const communityId = event.communityId as string | undefined;
            const communityMeta = communityId
              ? communityMap[communityId]
              : undefined;
            return (
              <div
                key={event.id}
                className="group border-border hover:bg-secondary/40 relative overflow-hidden rounded-xl border transition-colors"
              >
                {imageUrl && (
                  <div className="border-border overflow-hidden border-b">
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
                  <div className="text-muted-foreground flex flex-wrap items-center gap-2 font-mono text-xs tracking-wider">
                    <span>{formatDate(event.date)}</span>
                    {event.startTime && (
                      <>
                        <span>•</span>
                        <span>
                          {formatEventTimeRange({
                            date: event.date,
                            startTime: event.startTime,
                            endTime: event.endTime,
                            timezone: event.timezone,
                          })}
                        </span>
                      </>
                    )}
                    <span>•</span>
                    <span>{EVENT_TYPE_LABELS[event.type] ?? event.type}</span>
                    {event.format && (
                      <>
                        <span>•</span>
                        <span>
                          {EVENT_FORMAT_LABELS[event.format] ?? event.format}
                        </span>
                      </>
                    )}
                    {typeof distanceKm === "number" && (
                      <>
                        <span>•</span>
                        <span className="text-foreground">
                          {formatDistance(distanceKm)}
                        </span>
                      </>
                    )}
                    {communityMeta && (
                      <>
                        <span>•</span>
                        <Link
                          href={`/communities/${communityMeta.slug}` as never}
                          className="relative z-10 flex items-center gap-1 hover:underline"
                        >
                          {communityMeta.logoUrl && (
                            <Image
                              src={communityMeta.logoUrl}
                              alt={communityMeta.name}
                              width={14}
                              height={14}
                              className="rounded-full object-cover"
                            />
                          )}
                          <span>{communityMeta.name}</span>
                        </Link>
                      </>
                    )}
                  </div>
                  <div>
                    <h2 className="text-xl leading-tight font-semibold">
                      <Link
                        href={`/events/${event.slug}`}
                        className="after:absolute after:inset-0"
                      >
                        {event.title}
                      </Link>
                    </h2>
                    <p className="text-muted-foreground mt-2 text-sm">
                      {event.location}
                    </p>
                  </div>
                  {summary && (
                    <p className="text-foreground/80 line-clamp-3 text-sm leading-relaxed">
                      {summary}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {event.focus && (
                      <Badge variant="outline" className="px-2.5 py-1">
                        {String(event.focus)}
                      </Badge>
                    )}
                    {typeof event.aitFitScore === "number" && (
                      <Badge className="px-2.5 py-1">
                        AIT {event.aitFitScore}/10
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isMapView && totalPages > 1 && (
        <Pagination
          currentPage={currentPage ?? page}
          totalPages={totalPages}
          buildHref={buildPageHref}
        />
      )}
    </div>
  );
}

function Pagination({
  currentPage,
  totalPages,
  buildHref,
}: {
  currentPage: number;
  totalPages: number;
  buildHref: (p: number) => string;
}) {
  const pages: (number | "gap")[] = [];
  const push = (v: number | "gap") => {
    if (pages[pages.length - 1] !== v) pages.push(v);
  };
  for (let i = 1; i <= totalPages; i++) {
    if (
      i === 1 ||
      i === totalPages ||
      (i >= currentPage - 1 && i <= currentPage + 1)
    ) {
      push(i);
    } else {
      push("gap");
    }
  }

  const linkBase =
    "font-mono text-xs tracking-wider rounded border px-3 py-1.5 transition-colors";
  const inactive = "border-border text-muted-foreground hover:bg-secondary/40";
  const active = "border-foreground bg-foreground text-background";
  const disabled =
    "border-border text-muted-foreground/40 pointer-events-none cursor-default";

  return (
    <nav className="mt-10 flex flex-wrap items-center justify-center gap-1.5">
      {currentPage > 1 ? (
        <Link
          href={buildHref(currentPage - 1)}
          className={`${linkBase} ${inactive}`}
        >
          ← PREV
        </Link>
      ) : (
        <span className={`${linkBase} ${disabled}`}>← PREV</span>
      )}

      {pages.map((p, idx) =>
        p === "gap" ? (
          <span
            key={`gap-${idx}`}
            className="text-muted-foreground font-mono text-xs tracking-wider"
          >
            …
          </span>
        ) : (
          <Link
            key={p}
            href={buildHref(p)}
            className={`${linkBase} ${p === currentPage ? active : inactive}`}
          >
            {p}
          </Link>
        ),
      )}

      {currentPage < totalPages ? (
        <Link
          href={buildHref(currentPage + 1)}
          className={`${linkBase} ${inactive}`}
        >
          NEXT →
        </Link>
      ) : (
        <span className={`${linkBase} ${disabled}`}>NEXT →</span>
      )}
    </nav>
  );
}
