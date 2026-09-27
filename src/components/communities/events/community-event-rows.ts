import { pastEvents, upcomingEvents } from "@/lib/event-time";
import type {
  EventRowInput,
  EventRowLink,
} from "@/components/events/rows/event-rows";

/**
 * One event as a community's lists receive it: the published list (native
 * events plus a live Luma feed), the moderators' pending queue and a
 * member's own submissions. Every field past the core is optional because
 * the three queries do not all carry it.
 */
export interface CommunityEventItem {
  id: number | string;
  slug: string | null;
  title: string;
  type: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  timezone?: string | null;
  location: string;
  format?: string | null;
  city?: string | null;
  country?: string | null;
  status: string;
  source?: "native" | "luma";
  lumaUrl?: string | null;
}

/** Which list the row sits in. Each list links rows by its own rule. */
export type CommunityEventView = "published" | "pending" | "mine";

export interface CommunityEventContext {
  communitySlug: string;
  view: CommunityEventView;
  /** Owners and admins can open a hackathon's manage page. */
  isAdminOrOwner: boolean;
}

/** The hackathon manage page inside the community. */
export function manageHackathonHref(
  communitySlug: string,
  eventSlug: string,
): string {
  return `/communities/${communitySlug}/events/${eventSlug}/manage`;
}

/**
 * Where a community event row goes:
 * - a live Luma row opens its Luma page in a new tab;
 * - pending-queue rows never link: they hold their own controls (conflict
 *   badge, approve, reject), and a draft's public page 404s (#214);
 * - a draft hackathon opens its manage page for owners and admins (its
 *   public page does not exist yet), and nothing for anyone else;
 * - other drafts and rejected submissions are hidden from the public page,
 *   so they do not link;
 * - everything else opens the event's public page.
 */
export function communityEventLink(
  event: CommunityEventItem,
  { communitySlug, view, isAdminOrOwner }: CommunityEventContext,
): EventRowLink | null {
  if (event.source === "luma") {
    return event.lumaUrl ? { kind: "external", href: event.lumaUrl } : null;
  }
  if (view === "pending" || !event.slug) return null;
  if (event.type === "hackathon" && event.status === "draft") {
    return isAdminOrOwner
      ? {
          kind: "internal",
          href: manageHackathonHref(communitySlug, event.slug),
        }
      : null;
  }
  if (event.status === "draft" || event.status === "rejected") return null;
  return { kind: "internal", href: `/events/${event.slug}` };
}

/**
 * Community event → shared row input. The community is the host of every
 * row here, so no "by <community>" line repeats the page's own name.
 */
export function toCommunityEventRowInput(
  event: CommunityEventItem,
  context: CommunityEventContext,
): EventRowInput {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    type: event.type,
    format: event.format ?? null,
    date: event.date,
    startTime: event.startTime ?? null,
    timezone: event.timezone ?? null,
    city: event.city ?? null,
    country: event.country ?? null,
    location: event.location,
    host: null,
    link: communityEventLink(event, context),
  };
}

/**
 * A community's published events split the way people read a schedule:
 * what is still ahead (soonest first; a running event stays here until it
 * ends where it happens) and what already took place (most recent first).
 * Both judged in each event's own zone, so no viewer sees a wrong day.
 */
export function splitCommunityEvents<T extends CommunityEventItem>(
  events: readonly T[],
  now: Date = new Date(),
): { upcoming: T[]; past: T[] } {
  return {
    upcoming: upcomingEvents(events, now),
    past: pastEvents(events, now),
  };
}
