/**
 * Persists Luma-discovered events into the existing `events` collection
 * (Slice K, K-T2 / #199 — no parallel "discovered event" model, per
 * CONTEXT.md [[discovered-event]]). Reuses the dormant curation fields
 * (`discoverySource`, `curatedByAgent`, `confidenceScore`, `lastVerifiedAt`,
 * `reviewStatus`, `sourceUrl`) and the `audience` relationship — no schema
 * migration.
 *
 * Trusted-source decision: ingested events are written `status: "published"`
 * + `reviewStatus: "approved"` so they immediately enter the scheduling
 * conflict corpus (src/server/events/conflicts/corpus.ts) — Luma organizers
 * are treated as already having published their event, unlike member
 * submissions which start unapproved.
 *
 * Dedupe key: (`communityId` + `sourceUrl`) scoped to `discoverySource:
 * "luma"`, matching the brief's documented `payload.find` shape exactly.
 */

import type { Payload } from "payload";

import { EVENT_TYPES, type EventType } from "@/lib/event-metadata";
import { slugify } from "@/lib/text-utils";
import { plainTextToLexical } from "@/server/challenge-engine/lexical";
import type { NormalizedEvent } from "@/server/luma/normalize";
import type { ClassificationResult } from "./classify";

const URL_PATTERN = /^https?:\/\//i;
const EVENT_TYPE_SET: readonly string[] = EVENT_TYPES;

/**
 * `NormalizedEvent.type` is declared as a loose `string` (normalize.ts
 * currently only ever produces `"meetup"`), but the `events` collection's
 * `type` field is a closed select. Defensively narrow to the known
 * `EventType` union, falling back to `"meetup"` for any unrecognized value
 * rather than widening the collection's contract or crashing the ingest run.
 */
function toEventType(type: string): EventType {
  return EVENT_TYPE_SET.includes(type) ? (type as EventType) : "meetup";
}

/**
 * Fallback-only format heuristic from the location string: "in-person" when
 * it is non-empty and doesn't look like a URL (a street address / venue
 * name); "online" otherwise. This is only reached when a NormalizedEvent
 * carries no `format` — the Luma path now derives a real
 * online/in-person/hybrid signal from the raw event's geo/meeting-url pair
 * (normalize.ts), which `buildDiscoveredEventData` prefers. Kept as a
 * defensive default for any event that somehow lacks that signal.
 */
function deriveFormat(location: string): "online" | "in-person" {
  if (!location || URL_PATTERN.test(location)) return "online";
  return "in-person";
}

/**
 * Pure mapping from a normalized Luma event (+ upstream audience
 * classification, + an injected "now" timestamp) to the payload
 * create/update data for the `events` collection. No I/O, no `Date` — the
 * caller supplies `nowIso` so this stays deterministic and testable.
 *
 * Deliberately omits `slug`: a slug is generated once, only at create time,
 * by the caller (`upsertDiscoveredEvent`) — re-slugging on every update
 * would churn a field other systems may link against.
 *
 * No explicit return-type annotation (mirrors `buildEventPayloadData` in
 * `event-upsert-data.ts`): TypeScript infers the concrete object-literal
 * shape, which is required for `payload.create`/`payload.update` to resolve
 * to their non-draft overload — a `Record<string, unknown>` annotation
 * structurally satisfies only the draft-branch overload (all-optional
 * fields) and then fails on the missing `draft: true` literal.
 */
export function buildDiscoveredEventData(
  n: NormalizedEvent,
  classification: ClassificationResult,
  nowIso: string,
) {
  return {
    title: n.title,
    description: plainTextToLexical(n.description ?? ""),
    date: n.date,
    startTime: n.startTime,
    endTime: n.endTime,
    timezone: n.timezone,
    location: n.location,
    // Prefer the real online/in-person/hybrid signal the source derived from
    // its structured geo/meeting-url data; fall back to the location-string
    // heuristic only when a NormalizedEvent carries no format at all.
    format: n.format ?? deriveFormat(n.location),
    type: toEventType(n.type),
    status: "published" as const,
    communityId: n.communityId,
    discoverySource: "luma" as const,
    curatedByAgent: true,
    sourceUrl: n.lumaUrl,
    reviewStatus: "approved" as const,
    lastVerifiedAt: nowIso,
    confidenceScore: classification.confidence,
    audience: classification.audienceIds,
    coverImage: n.coverImageId ?? undefined,
  };
}

/**
 * Short (base36) deterministic hash of `communityId`, used to disambiguate
 * generated slugs (see `upsertDiscoveredEvent`'s create branch) without
 * embedding the full communityId (a UUID) into every slug. Not a security
 * hash — just a cheap, stable per-community token so two communities
 * cross-listing the same Luma event land on distinct `events.slug` values.
 */
function shortCommunityHash(communityId: string): string {
  let hash = 0;
  for (let i = 0; i < communityId.length; i++) {
    hash = (hash * 31 + communityId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36);
}

export type UpsertDiscoveredEventResult =
  | { action: "created" | "updated"; eventId: number }
  | { action: "skipped" };

/**
 * Idempotent upsert of a single normalized Luma event. Dedupes on
 * (`communityId` + `sourceUrl`) scoped to `discoverySource: "luma"`: a hit
 * is updated in place (this also re-approves an event that had previously
 * been archived by `archiveStaleDiscoveredEvents`, since
 * `buildDiscoveredEventData` always sets `reviewStatus: "approved"`); a miss
 * is created fresh with a slug derived from the title + Luma's own event id
 * (deterministic, not a `Date.now()` suffix, so re-runs are stable).
 *
 * Skips (no `find`/`create`/`update` call) when `n.lumaUrl` is null — there
 * is no dedupe key to upsert against.
 */
export async function upsertDiscoveredEvent(
  payload: Payload,
  n: NormalizedEvent,
  classification: ClassificationResult,
  nowIso: string,
): Promise<UpsertDiscoveredEventResult> {
  if (!n.lumaUrl) return { action: "skipped" };

  const { docs } = await payload.find({
    collection: "events",
    where: {
      and: [
        { communityId: { equals: n.communityId } },
        { sourceUrl: { equals: n.lumaUrl } },
        { discoverySource: { equals: "luma" } },
      ],
    },
    limit: 1,
    depth: 0,
  });

  const data = buildDiscoveredEventData(n, classification, nowIso);
  const existing = docs[0] as { id: number } | undefined;

  if (existing) {
    await payload.update({
      collection: "events",
      id: existing.id,
      data,
      // Re-syncs never need to re-geocode: this branch only ever changes
      // curation fields (audience, reviewStatus, lastVerifiedAt, ...), never
      // location — routing it through the collection's afterChange geocode
      // hook (Events.ts) would burn a throttled (1.1s) Nominatim call on
      // every update, serializing the whole cron behind the rate limit for
      // no benefit. The hook honors this flag (Events.ts's afterChange
      // wrapper checks `context?.skipGeocode` before running).
      context: { skipGeocode: true },
    });
    return { action: "updated", eventId: existing.id };
  }

  const created = await payload.create({
    collection: "events",
    // Slug includes a short deterministic hash of `communityId`: `slug` is
    // unique on `events`, and the SAME Luma event (same `n.id` /
    // `api_id`-derived) can be cross-listed on two connected communities —
    // without a per-community component, the second community's create
    // throws a unique violation on its very first sync.
    data: {
      ...data,
      slug: `${slugify(n.title)}-${shortCommunityHash(n.communityId)}-${n.id}`,
    },
  });
  return { action: "created", eventId: created.id };
}

/**
 * Staleness sweep: given every `sourceUrl` seen for `communityId` in the
 * current Luma pull, archives (`reviewStatus: "archived"`) every
 * previously-ingested luma-sourced event for that community whose
 * `sourceUrl` was NOT in the seen set (cancelled/removed upstream, or
 * outside Luma's returned window). Archiving leaves the row in the `events`
 * collection but drops it out of the conflict corpus (which requires
 * `reviewStatus` approved-or-unset) — it does not delete data, and a later
 * `upsertDiscoveredEvent` re-approves it if the event reappears.
 *
 * `todayDate` (a YYYY-MM-DD calendar-date key, mirroring corpus.ts's date
 * keys) bounds the sweep to events on or after today: `getCalendarEvents`
 * only pulls a bounded page window (now that it's called with `after`, that
 * window is future-only — see route.ts), so a genuinely-past event's
 * `sourceUrl` legitimately falls outside `seenSourceUrls` on every run and
 * must never be treated as "removed upstream" and archived.
 *
 * The `reviewStatus: { not_equals: "archived" }` clause excludes rows this
 * sweep already archived on a prior run — without it, an already-archived
 * row gets re-updated (a new version row, since `events` has `drafts:
 * true`) on every single sync, inflating both DB writes and the returned
 * `archived` count with no behavioral change.
 *
 * Returns the count archived.
 */
export async function archiveStaleDiscoveredEvents(
  payload: Payload,
  communityId: string,
  seenSourceUrls: Set<string>,
  todayDate: string,
): Promise<number> {
  const { docs } = await payload.find({
    collection: "events",
    where: {
      and: [
        { communityId: { equals: communityId } },
        { discoverySource: { equals: "luma" } },
        { sourceUrl: { not_in: Array.from(seenSourceUrls) } },
        { reviewStatus: { not_equals: "archived" } },
        { date: { greater_than_equal: todayDate } },
      ],
    },
    limit: 500,
    depth: 0,
  });

  for (const doc of docs) {
    await payload.update({
      collection: "events",
      id: (doc as { id: number }).id,
      data: { reviewStatus: "archived" },
    });
  }

  return docs.length;
}
