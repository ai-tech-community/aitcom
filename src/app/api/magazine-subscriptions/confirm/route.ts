import { NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import { MAGAZINE_SUBSCRIPTION_CONFIRM_PATH } from "@/lib/magazines/paths";
import { db } from "@/server/db";
import { confirmEmailSubscription } from "@/server/magazines/subscriptions/service";
import { getPayloadClient } from "@/server/payload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Mail scanners may open the page; only an explicit POST confirms. */
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const token = form.get("t");
  if (typeof token !== "string" || !token) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const rawLocale = form.get("locale");
  const locale =
    typeof rawLocale === "string" &&
    (routing.locales as readonly string[]).includes(rawLocale)
      ? rawLocale
      : routing.defaultLocale;
  try {
    const payload = await getPayloadClient();
    await confirmEmailSubscription({ db, payload }, token, new Date());
  } catch {
    console.error("[magazine-subscriptions] confirmation failed");
  }
  const path = `/${locale}${MAGAZINE_SUBSCRIPTION_CONFIRM_PATH}?t=${encodeURIComponent(token)}`;
  return NextResponse.redirect(new URL(path, req.url), 303);
}
