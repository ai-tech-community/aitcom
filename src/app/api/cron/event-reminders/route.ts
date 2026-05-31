import { NextResponse } from "next/server";
import { and, eq, inArray } from "drizzle-orm";

import { db } from "@/server/db";
import { getPayloadClient } from "@/server/payload";
import {
  eventRegistrations,
  broadcastDeliveries,
  notifications,
  user,
} from "@/server/db/schema";
import { sendEventReminderEmail } from "@/server/email";
import {
  EVENT_REMINDER_LEAD_HOURS,
  currentWindowKey,
} from "@/server/notifications/constants";

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
    now.getTime() + EVENT_REMINDER_LEAD_HOURS * 3600 * 1000,
  );
  let reminded = 0;

  // Collect in-app notification rows for bulk insert flushed after all events are processed.
  // Delivery rows are claimed per-registration (claim-before-send); no bulk deliveryRows array.
  const notificationRows: (typeof notifications.$inferInsert)[] = [];

  const payload = await getPayloadClient();
  // Published events starting between now and the reminder horizon.
  // The events collection uses `date` (not startDate) as the start-date field.
  const { docs: events } = await payload.find({
    collection: "events",
    where: {
      and: [
        { status: { equals: "published" } },
        { date: { greater_than: now.toISOString() } },
        { date: { less_than: horizon.toISOString() } },
      ],
    },
    limit: 200,
    depth: 0,
  });

  if (events.length === 200) {
    console.warn(
      "event-reminders: hit 200-event page cap; some events may be skipped this run",
    );
  }

  for (const event of events) {
    const dedupeKey = `event:${event.id}`;
    const regs = await db
      .select({ userId: eventRegistrations.userId, email: user.email })
      .from(eventRegistrations)
      .innerJoin(user, eq(eventRegistrations.userId, user.id))
      .where(
        and(
          eq(eventRegistrations.eventId, event.id),
          inArray(eventRegistrations.status, ["registered", "waitlisted"]),
        ),
      );

    const title = String(event.title ?? "your event");
    // `date` field is the event's start date in the events collection.
    const whenText = new Date(String(event.date)).toUTCString();

    for (const reg of regs) {
      // Claim-before-send: insert dedupe row first via partial unique index
      // broadcast_delivery_dedupe_uidx WHERE dedupe_key IS NOT NULL.
      // onConflictDoNothing() with no target covers partial indexes in Postgres.
      // Promotional inserts (dedupeKey NULL) elsewhere are unaffected.
      const claimed = await db
        .insert(broadcastDeliveries)
        .values({
          userId: reg.userId,
          class: "transactional",
          emailSent: false,
          windowKey,
          dedupeKey,
        })
        .onConflictDoNothing()
        .returning({ id: broadcastDeliveries.id });
      if (claimed.length === 0) continue; // already reminded for this event

      // In-app (always) + transactional email (ceiling-EXEMPT — NO allowPromotional call).
      notificationRows.push({
        userId: reg.userId,
        type: "event_reminder",
        title: `Reminder: ${title}`,
        content: `${title} starts ${whenText}.`,
        metadata: { eventId: event.id },
      });

      let emailSent = false;
      try {
        emailSent = await sendEventReminderEmail(reg.email, {
          title,
          whenText,
          slug: String(event.slug ?? ""),
        });
      } catch (err) {
        console.error(`event-reminders: send failed for ${reg.userId}`, err);
      }

      if (emailSent && claimed[0]) {
        await db
          .update(broadcastDeliveries)
          .set({ emailSent: true })
          .where(eq(broadcastDeliveries.id, claimed[0].id));
      }
      reminded++;
    }
  }

  // Flush batched in-app notification rows after processing all events.
  if (notificationRows.length)
    await db.insert(notifications).values(notificationRows);

  return NextResponse.json({ success: true, reminded, windowKey });
}
