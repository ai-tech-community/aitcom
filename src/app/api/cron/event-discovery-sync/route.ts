import { NextResponse } from "next/server";
import { and, eq, ne } from "drizzle-orm";

import { db } from "@/server/db";
import { getPayloadClient } from "@/server/payload";
import { communityLumaIntegrations } from "@/server/db/schema";
import { decryptApiKey } from "@/server/luma/crypto";
import { getCalendarEvents } from "@/server/luma/client";
import { normalizeLumaEvent } from "@/server/luma/normalize";
import {
  classifyAudiences,
  type ClassifiableAudience,
} from "@/server/events/discovery/classify";
import {
  archiveStaleDiscoveredEvents,
  upsertDiscoveredEvent,
} from "@/server/events/discovery/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily Luma discovery sync (Slice K, K-T3 / #199): for every community with
 * an enabled Luma integration, pulls its calendar, classifies each event's
 * audience with the pure heuristic in classify.ts (no LLM — see that file's
 * header), and upserts it into the `events` collection (ingest.ts) so it
 * enters the scheduling-conflict corpus. Runs at 05:00, ahead of the 06:00
 * event-conflict-monitor cron, so the corpus is fresh when that run scans it.
 *
 * This is the INGESTION (write) path and is intentionally distinct from
 * ADR-0035's rule that the conflict CHECK path never calls a live external
 * API: rule.ts/suggest.ts/corpus.ts only ever read our own `events` table at
 * check time. This route is what keeps that table fresh *in advance*, on its
 * own schedule and with its own failure isolation, so the check path never
 * needs to reach out to Luma itself.
 *
 * Per-community try/catch isolation mirrors event-conflict-monitor: one
 * community's Luma fetch failing (bad/expired key, API outage) must not
 * abort the sync for every other community.
 */
export async function GET(req: Request) {
  if (
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Computed once so every event upserted in this run shares one
  // `lastVerifiedAt` / created-at instant, per buildDiscoveredEventData's
  // contract (nowIso is caller-supplied, not read internally).
  const nowIso = new Date().toISOString();

  const payload = await getPayloadClient();

  // Loaded once for the whole run — the classifier vocabulary is shared
  // across every community's events, not per-community state.
  const { docs: audienceDocs } = await payload.find({
    collection: "audiences",
    limit: 200,
    depth: 0,
  });
  const audiences: ClassifiableAudience[] = audienceDocs.map((doc) => ({
    id: doc.id,
    slug: doc.slug,
    name: doc.name,
    interests: (doc.interests ?? []).map((interest) => interest.tag),
  }));

  const integrations = await db
    .select()
    .from(communityLumaIntegrations)
    .where(
      and(
        eq(communityLumaIntegrations.isEnabled, true),
        ne(communityLumaIntegrations.calendarApiId, ""),
      ),
    );

  let communities = 0;
  let created = 0;
  let updated = 0;
  let archived = 0;

  for (const integration of integrations) {
    // Counts attempted communities (mirrors event-conflict-monitor's
    // `scanned`), not just ones that completed without error — a failure
    // below is still a community this run considered.
    communities++;
    try {
      const apiKey = decryptApiKey(integration.apiKeyEncrypted);
      const rawEvents = await getCalendarEvents(
        apiKey,
        integration.calendarApiId,
      );

      const seenSourceUrls = new Set<string>();
      for (const rawEvent of rawEvents) {
        const normalized = normalizeLumaEvent(
          rawEvent,
          integration.communityId,
        );
        if (!normalized.lumaUrl) continue; // no dedupe key to upsert against

        const classification = classifyAudiences(
          {
            title: normalized.title,
            description: normalized.description,
            location: normalized.location,
          },
          audiences,
        );
        const result = await upsertDiscoveredEvent(
          payload,
          normalized,
          classification,
          nowIso,
        );
        if (result.action === "created") created++;
        else if (result.action === "updated") updated++;

        seenSourceUrls.add(normalized.lumaUrl);
      }

      // Only sweep for stale events when the fetch actually returned some.
      // getCalendarEvents throws on non-OK HTTP, but a 200 with an empty
      // `entries` array (Luma glitch, a rate-limit answered 200, a pagination
      // edge, a momentarily-empty calendar) is indistinguishable from "the
      // community genuinely cleared their calendar" — from a single response
      // we cannot tell them apart. Archiving on an empty result would mark
      // EVERY previously-ingested luma event for this community as
      // "archived", dropping the whole community's corpus for up to 24h with
      // no error logged. The conservative lesser evil is to skip the sweep on
      // an empty fetch (a stale event lingers, its lastVerifiedAt simply stops
      // advancing) rather than wipe the corpus on any transient blip. On a
      // non-empty fetch, archival works as before.
      if (rawEvents.length > 0) {
        archived += await archiveStaleDiscoveredEvents(
          payload,
          integration.communityId,
          seenSourceUrls,
        );
      }

      await db
        .update(communityLumaIntegrations)
        .set({ lastSyncCheck: new Date() })
        .where(eq(communityLumaIntegrations.id, integration.id));
    } catch (err) {
      console.error(
        `event-discovery-sync: sync failed for community ${integration.communityId}`,
        err,
      );
    }
  }

  return NextResponse.json({ communities, created, updated, archived });
}
