import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { getPayloadClient } from "@/server/payload";
import { broadcastDeliveries, notifications, user } from "@/server/db/schema";
import { sendBroadcastEmail } from "@/server/email";
import { currentWindowKey } from "@/server/notifications/constants";
import {
  buildConflictNotification,
  buildMonitorTarget,
  conflictDedupeKey,
  MONITOR_HORIZON_DAYS,
  selectMaterialConflicts,
} from "@/server/events/conflicts/monitor";
import {
  corpusDateWindow,
  expandAudiences,
  fetchCorpus,
} from "@/server/events/conflicts/corpus";
import {
  evaluateConflict,
  type ConflictVerdict,
} from "@/server/events/conflicts/rule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (
    req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const windowKey = currentWindowKey(now);
  const horizon = new Date(
    now.getTime() + MONITOR_HORIZON_DAYS * 24 * 3600 * 1000,
  );

  const payload = await getPayloadClient();
  // Published events with a non-empty audience, starting between now and the
  // monitor horizon. `depth: 1` is required — buildMonitorTarget needs
  // populated `{id,slug}` audience objects, not bare ids.
  const { docs: events, totalDocs } = await payload.find({
    collection: "events",
    where: {
      and: [
        { status: { equals: "published" } },
        { date: { greater_than: now.toISOString() } },
        { date: { less_than: horizon.toISOString() } },
        { audience: { exists: true } },
      ],
    },
    limit: 200,
    depth: 1,
  });

  if (totalDocs > 200) {
    console.warn(
      "event-conflict-monitor: hit 200-event page cap; some events may be skipped this run",
    );
  }

  let scanned = 0;
  let eventsNotified = 0;
  let pairsAlerted = 0;

  for (const doc of events) {
    scanned++;
    try {
      const target = buildMonitorTarget(doc);
      if (!target) continue; // no organizer or no usable audience

      const { direct, relatedIdSet } = await expandAudiences(
        payload,
        target.audienceSlugs,
      );
      if (!direct.length) continue; // audience slugs didn't resolve to anything
      target.candidate.audienceIds = direct.map((a) => a.id);

      const { dateFrom, dateTo } = corpusDateWindow(target.candidate.date);
      const audienceIdsExpanded = [
        ...new Set([...direct.map((a) => a.id), ...relatedIdSet]),
      ];
      const corpus = await fetchCorpus(payload, {
        dateFrom,
        dateTo,
        audienceIdsExpanded,
        excludeEventId: target.eventId,
      });

      const verdicts = corpus
        .map((corpusEvent) =>
          evaluateConflict(target.candidate, corpusEvent, relatedIdSet),
        )
        .filter((v): v is NonNullable<typeof v> => v !== null);
      const material = selectMaterialConflicts(verdicts);

      // Claim-before-send: insert dedupe rows first via the partial unique
      // index broadcast_delivery_dedupe_uidx WHERE dedupe_key IS NOT NULL.
      // onConflictDoNothing() with no target covers partial indexes in
      // Postgres. Each pair is claimed at most once, ever (forever dedupe).
      // pairsAlerted is incremented only after the notification insert below
      // succeeds, so it counts pairs actually alerted, not merely claimed —
      // a failed notification insert must not overcount.
      const newlyClaimed: { verdict: ConflictVerdict; deliveryId: string }[] =
        [];
      for (const verdict of material) {
        const claimed = await db
          .insert(broadcastDeliveries)
          .values({
            userId: target.organizerId,
            class: "transactional",
            emailSent: false,
            windowKey,
            dedupeKey: conflictDedupeKey(target.eventId, verdict.event.id),
          })
          .onConflictDoNothing()
          .returning({ id: broadcastDeliveries.id });
        const row = claimed[0];
        if (!row) continue; // already alerted for this pair
        newlyClaimed.push({ verdict, deliveryId: row.id });
      }

      if (newlyClaimed.length === 0) continue;

      const notif = buildConflictNotification(
        target,
        newlyClaimed.map((c) => c.verdict),
      );

      // In-app notification: written immediately after the claims win so a
      // mid-run crash (Vercel timeout) cannot leave claimed pairs without a
      // visible notification. Small at-least-once gap accepted (same as
      // event-reminders): if this insert itself fails, those pairs never
      // alert again (forever-dedupe already claimed them) — so we don't
      // count them as alerted below.
      await db.insert(notifications).values({
        userId: target.organizerId,
        type: "event_conflict",
        title: notif.title,
        content: notif.content,
        metadata: notif.metadata,
        communityId: doc.communityId ?? null,
      });
      eventsNotified++;
      pairsAlerted += newlyClaimed.length;

      // Transactional email (ceiling-EXEMPT — NO allowPromotional call, this
      // is about the organizer's own event). Failure must not lose the
      // in-app notification already written above.
      try {
        const [organizer] = await db
          .select({ email: user.email })
          .from(user)
          .where(eq(user.id, target.organizerId))
          .limit(1);
        if (organizer?.email) {
          const emailSent = await sendBroadcastEmail(
            organizer.email,
            notif.title,
            notif.content,
          );
          if (emailSent) {
            await db
              .update(broadcastDeliveries)
              .set({ emailSent: true })
              .where(
                inArray(
                  broadcastDeliveries.id,
                  newlyClaimed.map((c) => c.deliveryId),
                ),
              );
          }
        }
      } catch (err) {
        console.error(
          `event-conflict-monitor: email send failed for event ${target.eventId}`,
          err,
        );
      }
    } catch (err) {
      console.error(
        `event-conflict-monitor: scan failed for event ${doc.id}`,
        err,
      );
    }
  }

  return NextResponse.json({ scanned, eventsNotified, pairsAlerted });
}
