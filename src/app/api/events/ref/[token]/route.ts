import { NextResponse } from "next/server";
import { env } from "@/env";
import { resolveLocale } from "@/i18n/messages";
import { externalEventUrl } from "@/lib/events/event-source";
import { getPayloadClient } from "@/server/payload";
import {
  ATTRIBUTION_SECONDS,
  createSourceToken,
  readSourceToken,
  sourceCookieName,
} from "@/server/events/registration-source-token";

export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const locale = resolveLocale(new URL(request.url).searchParams.get("locale"));
  const origin = env.NEXT_PUBLIC_APP_URL ?? "https://www.aitcommunity.org";
  const fallback = new URL(`/${locale}/events`, origin);
  const decoded = readSourceToken(token, env.BETTER_AUTH_SECRET);
  const redirect = (url: URL) => {
    const response = NextResponse.redirect(url, 307);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  };
  if (decoded?.purpose !== "link") return redirect(fallback);
  const payload = await getPayloadClient();
  const event = await payload.findByID({
    collection: "events",
    id: decoded.eventId,
    depth: 0,
    disableErrors: true,
  });
  if (
    event?.status !== "published" ||
    !event.communityId ||
    !event.slug ||
    (event.price ?? 0) > 0 ||
    externalEventUrl(event) !== null
  )
    return redirect(fallback);
  const response = redirect(
    new URL(`/${locale}/events/${encodeURIComponent(event.slug)}`, origin),
  );
  response.cookies.set(
    sourceCookieName(event.id),
    createSourceToken(
      event.id,
      decoded.source,
      "cookie",
      env.BETTER_AUTH_SECRET,
    ),
    {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ATTRIBUTION_SECONDS,
    },
  );
  return response;
}
