import { NextResponse } from "next/server";
import { db } from "@/server/db";
import { referralSecret } from "@/server/communities/referral-email/config";
import { verifyReferralOptOut } from "@/server/communities/referral-email/tokens";
import { suppressReferralEmail } from "@/server/communities/referral-email/service";
import { resolveLocale } from "@/i18n/messages";

export const runtime = "nodejs";
export async function POST(request: Request) {
  let secret: string;
  try {
    secret = referralSecret();
  } catch {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }
  const query = new URL(request.url).searchParams;
  const form = new URLSearchParams(await request.text());
  if (
    form.get("List-Unsubscribe") !== "One-Click" &&
    form.get("confirm") !== "unsubscribe"
  )
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const hash = verifyReferralOptOut(
    query.get("t") ?? form.get("t") ?? "",
    secret,
  );
  if (!hash)
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  await suppressReferralEmail(db, hash, "unsubscribe");
  if (
    form.get("confirm") === "unsubscribe" &&
    form.get("List-Unsubscribe") !== "One-Click"
  ) {
    return NextResponse.redirect(
      new URL(
        `/${resolveLocale(form.get("locale"))}/invitations/unsubscribe?done=1`,
        request.url,
      ),
      303,
    );
  }
  return NextResponse.json({ ok: true });
}
