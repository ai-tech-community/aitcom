import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { cleanReferralEmails } from "@/server/communities/referral-email/service";
import {
  dispatchReferralEmails,
  queueReferralReminders,
} from "@/server/communities/referral-email/dispatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (
    !process.env.CRON_SECRET ||
    request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`
  )
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cleaned = await cleanReferralEmails(db);
  const reminders = await queueReferralReminders(db);
  const processed = await dispatchReferralEmails(db);
  return NextResponse.json({ cleaned, reminders, processed });
}
