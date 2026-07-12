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
 * Format heuristic (documented per the task brief — Luma's normalize.ts
 * gives no format signal directly): "in-person" when the location string is
 * non-empty and doesn't look like a URL (e.g. a street address, venue name);
 * "online" otherwise (empty/"TBA" location, or a URL such as a video-call
 * link). This is a coarse default meant to feed human curator review via the
 * dormant `format` field, not a strong signal — deliberately simple per
 * YAGNI, no venue-name dictionary or geocoding here.
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
    format: deriveFormat(n.location),
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
    await payload.update({ collection: "events", id: existing.id, data });
    return { action: "updated", eventId: existing.id };
  }

  const created = await payload.create({
    collection: "events",
    data: { ...data, slug: `${slugify(n.title)}-${n.id}` },
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
 * Returns the count archived.
 */
export async function archiveStaleDiscoveredEvents(
  payload: Payload,
  communityId: string,
  seenSourceUrls: Set<string>,
): Promise<number> {
  const { docs } = await payload.find({
    collection: "events",
    where: {
      and: [
        { communityId: { equals: communityId } },
        { discoverySource: { equals: "luma" } },
        { sourceUrl: { not_in: Array.from(seenSourceUrls) } },
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
