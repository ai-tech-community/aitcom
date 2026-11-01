import { Resend } from "resend";
import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { validReferralEmail } from "@/lib/referral-invites";
import {
  referralEmailEnv,
  referralSecret,
} from "@/server/communities/referral-email/config";
import { recipientHash } from "@/server/communities/referral-email/tokens";
import { suppressReferralEmail } from "@/server/communities/referral-email/service";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const env = referralEmailEnv();
  if (
    !env.REFERRAL_RESEND_WEBHOOK_SECRET ||
    !env.RESEND_API_KEY ||
    !env.REFERRAL_INVITE_SECRET
  )
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  let event;
  try {
    event = new Resend(env.RESEND_API_KEY).webhooks.verify({
      payload: await request.text(),
      headers: {
        id: request.headers.get("svix-id") ?? "",
        timestamp: request.headers.get("svix-timestamp") ?? "",
        signature: request.headers.get("svix-signature") ?? "",
      },
      webhookSecret: env.REFERRAL_RESEND_WEBHOOK_SECRET,
    });
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }
  if (event.type === "email.bounced" || event.type === "email.complained") {
    const secret = referralSecret(env);
    const emails = [...new Set(event.data.to)].filter(validReferralEmail);
    for (const email of emails)
      await suppressReferralEmail(
        db,
        recipientHash(email, secret),
        event.type === "email.bounced" ? "bounce" : "complaint",
      );
  }
  return NextResponse.json({ ok: true });
}
