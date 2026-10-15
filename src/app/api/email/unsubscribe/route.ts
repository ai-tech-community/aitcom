import { NextResponse } from "next/server";

import { recordGlobalDigestOptOut } from "@/server/notifications/digest-optout";
import { recordStoryEmailOptOut } from "@/server/notifications/story-email-optout";
import {
  unsubscribeSecret,
  verifyUnsubscribeToken,
} from "@/server/notifications/unsubscribe-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function localeFrom(value: string | null): "en" | "nl" {
  return value === "nl" ? "nl" : "en";
}

/** RFC 8058 one-click, and the confirm-page form. GET must not opt anyone out. */
export async function POST(req: Request) {
  const secret = unsubscribeSecret();
  if (!secret) {
    return NextResponse.json(
      { error: "Unsubscribe is not configured" },
      { status: 500 },
    );
  }

  const url = new URL(req.url);
  const body = new URLSearchParams(await req.text());
  const token = url.searchParams.get("t") ?? body.get("t");
  const oneClick = body.get("List-Unsubscribe") === "One-Click";
  const confirmed = body.get("confirm") === "unsubscribe";
  if (!token || (!oneClick && !confirmed)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const payload = verifyUnsubscribeToken(token, secret);
  if (!payload) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  try {
    if (payload.scope === "story") await recordStoryEmailOptOut(payload.userId);
    else await recordGlobalDigestOptOut(payload.userId);
  } catch (err) {
    console.error("email unsubscribe failed", err);
    return NextResponse.json(
      { error: "Could not unsubscribe" },
      { status: 400 },
    );
  }

  if (confirmed && !oneClick) {
    const locale = localeFrom(body.get("locale"));
    const kind = payload.scope === "story" ? "&kind=story" : "";
    return NextResponse.redirect(
      new URL(`/${locale}/unsubscribe?done=1${kind}`, req.url),
      303,
    );
  }

  return NextResponse.json({ ok: true });
}
