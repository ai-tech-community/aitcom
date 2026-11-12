import { and, eq, isNull, sql } from "drizzle-orm";
import type { db } from "@/server/db";
import {
  courseEnrollments,
  paymentOrders,
  paymentOutbox,
  user,
} from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";
import { sendRegistrationConfirmation } from "@/server/email";
import { toEventEmailData } from "@/server/events/event-email-data";
import { toRegistrationCalendarInvite } from "@/server/events/registration-invite";

/** Database projection is atomic with payment; external email delivery is retried separately. */
export async function drainPaymentOutbox(
  database: typeof db,
  now = new Date(),
) {
  const pending = await database
    .select({ orderId: paymentOutbox.orderId })
    .from(paymentOutbox)
    .innerJoin(paymentOrders, eq(paymentOrders.id, paymentOutbox.orderId))
    .where(
      and(
        isNull(paymentOutbox.sentAt),
        process.env.RESEND_API_KEY
          ? sql`true`
          : eq(paymentOrders.kind, "course"),
      ),
    )
    .orderBy(sql`${paymentOutbox.lastAttemptAt} ASC NULLS FIRST`)
    .limit(1);
  let completed = 0;
  for (const candidate of pending) {
    try {
      await database
        .update(paymentOutbox)
        .set({ lastAttemptAt: now })
        .where(eq(paymentOutbox.orderId, candidate.orderId));
      const [order] = await database
        .select()
        .from(paymentOrders)
        .where(eq(paymentOrders.id, candidate.orderId));
      if (!order || (order.kind === "event" && !process.env.RESEND_API_KEY))
        continue;
      const claimed = await database.transaction(async (tx) => {
        const [row] = await tx
          .select()
          .from(paymentOutbox)
          .where(eq(paymentOutbox.orderId, candidate.orderId))
          .for("update");
        if (
          !row ||
          row.sentAt ||
          (row.attemptedAt &&
            now.getTime() - row.attemptedAt.getTime() > 23 * 3600000)
        )
          return false;
        await tx
          .update(paymentOutbox)
          .set({ attemptedAt: row.attemptedAt ?? now })
          .where(eq(paymentOutbox.orderId, row.orderId));
        return true;
      });
      if (!claimed) continue;
      if (
        order.kind === "event" &&
        order.fulfillment === "fulfilled" &&
        order.status === "paid"
      ) {
        if (!process.env.RESEND_API_KEY) continue;
        const event = await (
          await getPayloadClient()
        ).findByID({
          collection: "events",
          id: order.resourceId!,
          depth: 0,
          disableErrors: true,
        });
        if (event?.status !== "published") continue;
        const [buyer] = await database
          .select({ name: user.name })
          .from(user)
          .where(eq(user.id, order.buyerId!));
        await sendRegistrationConfirmation(
          order.buyerEmail,
          buyer?.name ?? "there",
          toEventEmailData(event),
          toRegistrationCalendarInvite(
            event,
            { email: order.buyerEmail, name: buyer?.name ?? undefined },
            "invite",
          ),
          `payment-${order.id}`,
        );
      }
      if (order.kind === "course") {
        const [{ count } = { count: 0 }] = await database
          .select({ count: sql<number>`count(*)::int` })
          .from(courseEnrollments)
          .where(eq(courseEnrollments.courseId, order.resourceId!));
        await (
          await getPayloadClient()
        ).update({
          collection: "courses",
          id: order.resourceId!,
          data: { enrollmentCount: Number(count) },
        });
      }
      await database
        .update(paymentOutbox)
        .set({ sentAt: now })
        .where(
          and(
            eq(paymentOutbox.orderId, order.id),
            isNull(paymentOutbox.sentAt),
          ),
        );
      completed++;
    } catch {
      console.error("[payments] fulfillment follow-up requires retry", {
        orderId: candidate.orderId,
      });
    }
  }
  return completed;
}
