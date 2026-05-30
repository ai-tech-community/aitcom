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

  // Collect rows for bulk inserts flushed after all events are processed.
  const notificationRows: (typeof notifications.$inferInsert)[] = [];
  const deliveryRows: (typeof broadcastDeliveries.$inferInsert)[] = [];

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

    // Batch dedupe: one query per event instead of one per registration (eliminates N+1 SELECT).
    const regUserIds = regs.map((r) => r.userId);
    const alreadyReminded = new Set(
      regUserIds.length === 0
        ? []
        : (
            await db
              .select({ userId: broadcastDeliveries.userId })
              .from(broadcastDeliveries)
              .where(
                and(
                  inArray(broadcastDeliveries.userId, regUserIds),
                  eq(broadcastDeliveries.dedupeKey, dedupeKey),
                ),
              )
          ).map((r) => r.userId),
    );

    const title = String(event.title ?? "your event");
    // `date` field is the event's start date in the events collection.
    const whenText = new Date(String(event.date)).toUTCString();

    for (const reg of regs) {
      if (alreadyReminded.has(reg.userId)) continue;

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
        console.error(
          `event-reminders: send failed for ${reg.userId}`,
          err,
        );
      }

      deliveryRows.push({
        userId: reg.userId,
        class: "transactional",
        emailSent,
        windowKey,
        dedupeKey,
      });
      reminded++;
    }
  }

  // Flush all collected rows in two bulk inserts after processing all events.
  if (notificationRows.length) await db.insert(notifications).values(notificationRows);
  if (deliveryRows.length) await db.insert(broadcastDeliveries).values(deliveryRows);

  return NextResponse.json({ success: true, reminded, windowKey });
}
