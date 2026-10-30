import "server-only";

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import sharp from "sharp";

import { BlackCard } from "@/lib/og/black-card";
import { readBodyCapped, safeFetch } from "@/server/net/safe-fetch";

import type { ShareCard } from "./share-cards";

export type ShareImageLabels = { issueLine: string; byline: string };

// Source: https://github.com/vercel/geist-font/tree/b5d164a0c066c2c9bfcd5ab65dd8244551f0ac06
// Local Geist assets (SIL OFL in the same folder) keep rendering offline;
// a CSS family name alone falls back to ImageResponse's proportional font.
// Each path is a literal: the file tracer cannot follow a computed path and
// would then ship the whole project with the route (it hit 3.75 GB on
// Vercel). Keep the folder equal to SHARE_IMAGE_FONT_FOLDER (a test checks).
function loadFonts() {
  return [
    {
      name: "Geist Sans",
      weight: 400 as const,
      data: readFileSync(
        join(process.cwd(), "src/lib/og/fonts/Geist-Regular.ttf"),
      ),
    },
    {
      name: "Geist Sans",
      weight: 600 as const,
      data: readFileSync(
        join(process.cwd(), "src/lib/og/fonts/Geist-SemiBold.ttf"),
      ),
    },
    {
      name: "Geist Mono",
      weight: 400 as const,
      data: readFileSync(
        join(process.cwd(), "src/lib/og/fonts/GeistMono-Regular.ttf"),
      ),
    },
  ];
}
let fonts: ReturnType<typeof loadFonts> | undefined;

/** Fetch editor-typed covers through the SSRF guard; failures omit the cover. */
export async function loadShareCover(
  url: string | null,
): Promise<string | null> {
  if (!url) return null;
  try {
    const { response } = await safeFetch(url, {
      userAgent: "AIT Community share image",
      timeoutMs: 3000,
      accept: "image/*",
    });
    const type = response.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();
    if (!response.ok || !type || !/^image\/(png|jpeg|webp|gif)$/.test(type)) {
      await response.body?.cancel();
      return null;
    }
    const body = await readBodyCapped(response, 2 * 1024 * 1024);
    // Decode inside this catch: ImageResponse decodes lazily and cannot
    // read WebP data URLs. Bound decoded pixels as well as downloaded bytes.
    const image = sharp(body, { limitInputPixels: 16_000_000 });
    const { format } = await image.metadata();
    if (!format || !["png", "jpeg", "webp", "gif"].includes(format))
      return null;
    const png = await image.resize(400, 630, { fit: "cover" }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

/** The cover must come from loadShareCover, never from the card's remote URL. */
export function renderMagazineShareImage(
  card: ShareCard,
  labels: ShareImageLabels,
  cover: string | null,
): ImageResponse {
  const title = card.article?.title ?? card.issueTitle;
  return new ImageResponse(
    <BlackCard
      aside={
        cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- drawn by ImageResponse, not the browser
          <img
            src={cover}
            alt=""
            width={400}
            height={630}
            style={{ objectFit: "cover" }}
          />
        ) : undefined
      }
    >
      <div
        style={{
          fontFamily: "Geist Mono",
          display: "block",
          lineClamp: 2,
          fontSize: 22,
          color: "#d4d4d4",
          marginBottom: 24,
        }}
      >
        {labels.issueLine}
      </div>
      <div
        style={{
          fontSize: title.length > 60 ? 44 : 56,
          display: "block",
          fontWeight: 600,
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          lineClamp: 4,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "block",
          lineClamp: 2,
          fontSize: 24,
          color: "#d4d4d4",
          marginTop: 24,
        }}
      >
        {labels.byline}
      </div>
    </BlackCard>,
    { width: 1200, height: 630, fonts: (fonts ??= loadFonts()) },
  );
}
