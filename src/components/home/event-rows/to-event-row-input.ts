import type { Event } from "@/payload-types";
import type { EventRowInput } from "./event-rows";

/** The Payload event fields the homepage event sections read. */
export type EventRowDoc = Pick<
  Event,
  | "id"
  | "slug"
  | "title"
  | "type"
  | "format"
  | "date"
  | "startTime"
  | "timezone"
  | "city"
  | "country"
  | "location"
  | "communityId"
>;

/**
 * Payload event doc → the plain row input the section renders, with the
 * host community's name resolved from a batched lookup. Every field the
 * presenter reads is copied here and only here.
 */
export function toEventRowInput(
  doc: EventRowDoc,
  hostNames: ReadonlyMap<string, string>,
): EventRowInput {
  return {
    id: doc.id,
    slug: doc.slug,
    title: doc.title,
    type: doc.type,
    format: doc.format ?? null,
    date: doc.date,
    startTime: doc.startTime ?? null,
    timezone: doc.timezone ?? null,
    city: doc.city ?? null,
    country: doc.country ?? null,
    location: doc.location,
    host: doc.communityId ? (hostNames.get(doc.communityId) ?? null) : null,
  };
}
