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
import { formatEventWhenText } from "@/lib/event-time";
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
    // Timezone-qualified, e.g. "15 Jul 2026, 18:00–21:00 CEST (Europe/Amsterdam)".
    const whenText = formatEventWhenText({
      date: String(event.date),
      startTime: event.startTime,
      endTime: event.endTime,
      timezone: event.timezone,
    });

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

      // In-app notification: written immediately after the claim wins so a
      // mid-run crash (Vercel timeout) cannot leave the member with an email
      // but no in-app notification.  The claim row already deduplicates per
      // (member × event × window), so this insert runs at most once per member.
      await db.insert(notifications).values({
        userId: reg.userId,
        type: "event_reminder",
        title: `Reminder: ${title}`,
        content: `${title} starts ${whenText}.`,
        metadata: { eventId: event.id },
      });

      // Transactional email (ceiling-EXEMPT — NO allowPromotional call).
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

  return NextResponse.json({ success: true, reminded, windowKey });
}
