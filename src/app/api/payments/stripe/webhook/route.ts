import { db } from "@/server/db";
import { verifyStripeSignature } from "@/server/payments/signatures";
import { processStripeEvent } from "@/server/payments/stripe-events";

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response("Provider unavailable", { status: 503 });
  const raw = await request.text();
  if (
    raw.length > 1_000_000 ||
    !verifyStripeSignature(
      raw,
      request.headers.get("stripe-signature") ?? "",
      secret,
    )
  )
    return new Response("Invalid signature", { status: 400 });
  try {
    await processStripeEvent(db, JSON.parse(raw));
    return Response.json({ received: true });
  } catch {
    return new Response("Payment update requires retry", { status: 500 });
  }
}
