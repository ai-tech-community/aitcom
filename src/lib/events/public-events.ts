import { CANONICAL_PRODUCTION_ORIGIN } from "@/server/better-auth/base-url";
import { HUB_FORUM_PATH } from "@/server/communities/forum-scope";

export const PUBLIC_EVENTS_PATH = "/events";

export const PUBLIC_EVENTS_H1 = "AI events";

export const PUBLIC_EVENTS_META =
  "Public AI events we list for builders: date, city or online, and the official page. Join the Hub — community sign-up, not an event ticket.";

export const PUBLIC_EVENTS_JOIN_HREF =
  "https://www.aitcommunity.org/en/join?utm_source=aitcom&utm_medium=events&utm_campaign=ai-events";

/** Signed-in Hub members open the existing Hub forum — not Join. */
export const PUBLIC_EVENTS_HUB_HREF = HUB_FORUM_PATH;

export const PUBLIC_EVENTS_WHY_MAX = 140;

export type PublicEventLocale = "en" | "nl";

export type PublicEventSource = "curated" | "hosted";

export type PublicEventCard = {
  id: string;
  title: string;
  date: string;
  online: boolean;
  city: string | null;
  url: string;
  why: Record<PublicEventLocale, string>;
  source: PublicEventSource;
};

export type HostedEventInput = {
  id: number | string;
  title: string;
  slug?: string | null;
  date: string;
  format?: string | null;
  city?: string | null;
  location?: string | null;
  sourceUrl?: string | null;
  summary?: string | null;
  maxAttendees?: number | null;
};

export function isPublicEventUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function sanitizePublicEventWhy(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= PUBLIC_EVENTS_WHY_MAX) return compact;
  return compact.slice(0, PUBLIC_EVENTS_WHY_MAX).trimEnd();
}

export function publicEventPlace(
  event: Pick<PublicEventCard, "online" | "city">,
  onlineLabel = "Online",
): string {
  if (event.online) return onlineLabel;
  const city = event.city?.trim();
  return city && city.length > 0 ? city : onlineLabel;
}

export function toPublicEventDate(value: string): string | null {
  const iso = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

export function sortPublicEvents(
  events: readonly PublicEventCard[],
  today = new Date().toISOString().slice(0, 10),
): PublicEventCard[] {
  return [...events].sort((a, b) => {
    const aPast = a.date < today;
    const bPast = b.date < today;
    if (aPast !== bPast) return aPast ? 1 : -1;
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.title.localeCompare(b.title);
  });
}

export function mergePublicEvents(
  curated: readonly PublicEventCard[],
  hosted: readonly PublicEventCard[],
): PublicEventCard[] {
  const seen = new Set<string>();
  const merged: PublicEventCard[] = [];
  for (const event of [...curated, ...hosted]) {
    const key = event.url.replace(/\/+$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(event);
  }
  return sortPublicEvents(merged);
}

export function hostedEventUrl(
  event: Pick<HostedEventInput, "slug" | "sourceUrl">,
  locale: PublicEventLocale,
): string | null {
  if (event.sourceUrl && isPublicEventUrl(event.sourceUrl)) {
    return event.sourceUrl;
  }
  const slug = event.slug?.trim();
  if (!slug) return null;
  return `${CANONICAL_PRODUCTION_ORIGIN}/${locale}/events/${slug}`;
}

export function publicEventFromHosted(
  event: HostedEventInput,
  locale: PublicEventLocale,
): PublicEventCard | null {
  const date = toPublicEventDate(event.date);
  const url = hostedEventUrl(event, locale);
  const title = event.title.trim();
  if (!date || !url || !title) return null;

  const location = event.location?.trim() ?? "";
  const online =
    event.format === "online" || location.toLowerCase() === "online";
  const cityName = event.city?.trim();
  const city = online
    ? null
    : cityName && cityName.length > 0
      ? cityName
      : location.length > 0
        ? location
        : null;
  const why = sanitizePublicEventWhy(
    (typeof event.summary === "string" ? event.summary : "").split(/\n/)[0] ??
      "",
  );

  return {
    id: `hosted-${event.id}`,
    title,
    date,
    online,
    city,
    url,
    why: { en: why, nl: why },
    source: "hosted",
  };
}

export function publicEventsJsonLd(
  events: readonly PublicEventCard[],
): Record<string, unknown> {
  return {
    "@type": "ItemList",
    name: PUBLIC_EVENTS_H1,
    url: `${CANONICAL_PRODUCTION_ORIGIN}/en${PUBLIC_EVENTS_PATH}`,
    itemListElement: events.map((event, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "Event",
        name: event.title,
        startDate: event.date,
        url: event.url,
        eventAttendanceMode: event.online
          ? "https://schema.org/OnlineEventAttendanceMode"
          : "https://schema.org/OfflineEventAttendanceMode",
        location: event.online
          ? { "@type": "VirtualLocation", url: event.url }
          : { "@type": "Place", name: event.city, address: event.city },
        description: event.why.en,
      },
    })),
  };
}
