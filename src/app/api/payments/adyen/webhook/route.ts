import { db } from "@/server/db";
import { processAdyenEvents } from "@/server/payments/adyen-events";

export async function POST(request: Request) {
  const secret = process.env.ADYEN_HMAC_KEY;
  if (!secret) return new Response("Provider unavailable", { status: 503 });
  const raw = await request.text();
  if (raw.length > 1_000_000)
    return new Response("Payload too large", { status: 413 });
  try {
    await processAdyenEvents(db, JSON.parse(raw), secret);
    return new Response("[accepted]");
  } catch {
    return new Response("Notification requires retry", { status: 500 });
  }
}
