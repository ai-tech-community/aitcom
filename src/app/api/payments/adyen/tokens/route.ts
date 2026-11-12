import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { processAdyenToken } from "@/server/payments/adyen-events";

export async function POST(request: Request) {
  const secret = process.env.ADYEN_TOKEN_HMAC_KEY;
  if (!secret || !/^[a-fA-F0-9]{64}$/.test(secret))
    return new Response("Provider unavailable", { status: 503 });
  const raw = await request.text();
  if (raw.length > 1_000_000)
    return new Response("Payload too large", { status: 413 });
  const actual = Buffer.from(
    request.headers.get("hmacsignature") ?? "",
    "base64",
  );
  const expected = createHmac("sha256", Buffer.from(secret, "hex"))
    .update(raw)
    .digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return new Response("Invalid signature", { status: 400 });
  try {
    await processAdyenToken(db, JSON.parse(raw));
    return Response.json({ received: true });
  } catch {
    return new Response("Notification requires retry", { status: 500 });
  }
}
