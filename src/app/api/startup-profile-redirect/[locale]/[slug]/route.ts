import { NextResponse } from "next/server";

import { routing } from "@/i18n/routing";
import {
  investigationStartupShouldRewrite,
  startupLegacyKind,
} from "@/lib/investigations/startup-url-policy";
import {
  buildStartupProfilePath,
  parseStartupSlug,
} from "@/lib/investigations/startups";
import { findApprovedPublicStartupBySlug } from "@/server/startups/queries";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ locale: string; slug: string }>;
}

function notFound(): NextResponse {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * HTTP 301 from `/investigations/startups/<slug>` to `/startups/<slug>`
 * when both URLs are that company. Navier AI and any slug whose startups
 * page is a different entity never reach this route.
 */
export async function GET(
  request: Request,
  { params }: RouteParams,
): Promise<NextResponse> {
  const { locale, slug } = await params;
  if (!(routing.locales as readonly string[]).includes(locale))
    return notFound();
  const parsed = parseStartupSlug(slug);
  if (!parsed || !investigationStartupShouldRewrite(parsed)) return notFound();

  const card = await findApprovedPublicStartupBySlug(parsed);
  if (startupLegacyKind(parsed, card?.slug ?? null) !== "redirect" || !card) {
    return notFound();
  }

  const destination = new URL(
    `/${locale}${buildStartupProfilePath(card.slug)}`,
    request.url,
  );
  return NextResponse.redirect(destination, 301);
}
