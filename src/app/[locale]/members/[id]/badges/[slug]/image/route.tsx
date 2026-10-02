import { ImageResponse } from "next/og";
import { getTranslations } from "next-intl/server";
import type { NextRequest } from "next/server";

import { routing } from "@/i18n/routing";
import { emblemPalette } from "@/lib/badges/emblem-palette";
import { staticSvgMarkup, svgDataUrl } from "@/lib/svg/static-markup";
import { getMemberBadge } from "@/server/members/profile-page";
import {
  BadgeEmblem,
  emblemStyleOf,
  type EmblemSubject,
} from "@/components/badges/badge-emblem";

// Reads the profile (and its visibility) from the database.
export const runtime = "nodejs";

const SIZE = { width: 1200, height: 630 };
const EMBLEM_PX = 320;

type Locale = (typeof routing.locales)[number];

/**
 * The Open Graph image of a badge's share page: the emblem, the member's
 * name and the badge, on the same black card as the site's generic image.
 * Same visibility as the page: a 404 when the viewer may not see the
 * profile or the member does not hold the badge.
 *
 * The emblem is the real `BadgeEmblem`, drawn with literal colours (the
 * dark theme's) into a static SVG, because the image renderer takes
 * neither CSS custom properties nor React components inside an `<svg>`.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ locale: string; id: string; slug: string }> },
) {
  const { locale: raw, id, slug } = await params;
  const locale: Locale =
    routing.locales.find((l) => l === raw) ?? routing.defaultLocale;
  const share = await getMemberBadge(id, slug);
  if (!share) return new Response("Not found", { status: 404 });

  const [t, tBadges] = await Promise.all([
    getTranslations({ locale, namespace: "badgeMoment" }),
    getTranslations({ locale, namespace: "badges" }),
  ]);
  const subject: EmblemSubject = { kind: "badge", slug: share.badge.slug };
  const emblem = svgDataUrl(
    staticSvgMarkup(
      <BadgeEmblem
        subject={subject}
        state={{ earned: true, earnedAt: share.earnedAt }}
        size="lg"
        palette={emblemPalette(emblemStyleOf(subject), "dark")}
      />,
    ),
  );
  const name = share.data.profile.displayName;
  const badgeName = tBadges(share.badge.nameKey);

  const image = new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        backgroundColor: "#000",
        padding: "60px 80px",
        gap: 72,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- rendered by the image renderer, not the browser */}
      <img src={emblem} width={EMBLEM_PX} height={EMBLEM_PX} alt="" />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minWidth: 0,
        }}
      >
        <div
          style={{
            fontSize: name.length > 28 ? 44 : 56,
            fontWeight: 800,
            color: "#fff",
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 36,
            color: "#d4d4d4",
            marginTop: 16,
            lineHeight: 1.2,
          }}
        >
          {t("share.imageEarned", { badge: badgeName })}
        </div>
        <div
          style={{
            width: 60,
            height: 4,
            backgroundColor: "#EA580C",
            marginTop: 40,
            marginBottom: 24,
          }}
        />
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span
            style={{
              fontSize: 28,
              fontWeight: 800,
              color: "#fff",
              letterSpacing: "-0.02em",
            }}
          >
            AIT Community
          </span>
          <span style={{ fontSize: 28, fontWeight: 800, color: "#EA580C" }}>
            .
          </span>
        </div>
      </div>
    </div>,
    SIZE,
  );

  // A public profile's image may be cached for an hour; the owner's view
  // of their own private profile never is.
  image.headers.set(
    "Cache-Control",
    share.data.reach.kind === "public"
      ? "public, max-age=3600, s-maxage=3600"
      : "private, no-store",
  );
  return image;
}
