import { timingSafeEqual } from "node:crypto";
import { db } from "@/server/db";
import { runPaymentMaintenance } from "@/server/payments/billing-scheduler";

export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret ?? ""}`);
  if (
    !secret ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await runPaymentMaintenance(db));
  } catch {
    return new Response("Payment maintenance requires retry", { status: 500 });
  }
}
