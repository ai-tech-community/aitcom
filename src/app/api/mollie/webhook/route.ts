import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getMollie } from "@/server/mollie";
import { db } from "@/server/db";
import { eventRegistrations, memberProfiles, user } from "@/server/db/schema";
import { awardXp, XP_AMOUNTS } from "@/lib/gamification";
import { sendRegistrationConfirmation } from "@/server/email";
import { getPayloadClient } from "@/server/payload";

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${d.getMonth() + 1}.${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Mollie webhook handler.
 * Mollie sends a POST with `id` (payment ID) when payment status changes.
 */
export async function POST(request: Request) {
  const mollie = getMollie();
  if (!mollie) {
    return NextResponse.json(
      { error: "Mollie not configured" },
      { status: 500 },
    );
  }

  const formData = await request.formData();
  const paymentId = formData.get("id") as string | null;

  if (!paymentId) {
    return NextResponse.json({ error: "Missing payment ID" }, { status: 400 });
  }

  // Fetch payment status from Mollie
  const payment = await mollie.payments.get(paymentId);

  // Find the registration with this payment ID
  const [registration] = await db
    .select()
    .from(eventRegistrations)
    .where(eq(eventRegistrations.paymentId, paymentId))
    .limit(1);

  if (!registration) {
    return NextResponse.json(
      { error: "Registration not found" },
      { status: 404 },
    );
  }

  // Update payment status
  const paymentStatus = String(payment.status);
  await db
    .update(eventRegistrations)
    .set({ paymentStatus })
    .where(eq(eventRegistrations.id, registration.id));
  if (paymentStatus === "paid" && registration.status === "pending_payment") {
    await db
      .update(eventRegistrations)
      .set({ status: "registered", paymentStatus: "paid" })
      .where(eq(eventRegistrations.id, registration.id));

    // Award XP
    const [profile] = await db
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.userId, registration.userId))
      .limit(1);

    if (profile) {
      await awardXp(db, registration.userId, XP_AMOUNTS.REGISTER_EVENT);
    }

    // Send confirmation email
    try {
      const [registeredUser] = await db
        .select({ name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, registration.userId))
        .limit(1);

      if (registeredUser?.email) {
        const payload = await getPayloadClient();
        const event = await payload.findByID({
          collection: "events",
          id: registration.eventId,
        });

        await sendRegistrationConfirmation(
          registeredUser.email,
          registeredUser.name ?? "there",
          {
            eventTitle: event.title,
            eventDate: formatDate(event.date),
            eventLocation: event.location,
            eventSlug: event.slug,
          },
        );
      }
    } catch (e) {
      console.error("Failed to send post-payment confirmation email:", e);
    }
  }

  // Handle failed/expired/canceled payments
  if (["failed", "expired", "canceled"].includes(paymentStatus)) {
    await db
      .update(eventRegistrations)
      .set({ status: "payment_failed", paymentStatus })
      .where(eq(eventRegistrations.id, registration.id));
  }

  return NextResponse.json({ received: true });
}
