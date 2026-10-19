import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { EventHubLinks } from "@/components/events/event-hub-links";
import { WorldSummitGuide } from "@/components/guides/world-summit-guide";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { eventMetaDescription } from "@/lib/events/listing-policy";
import { lexicalToPlainText } from "@/server/challenge-engine/lexical";
import { getPayloadClient } from "@/server/payload";
import {
  WORLD_SUMMIT_H1,
  WORLD_SUMMIT_PATH,
  WORLD_SUMMIT_VENUE,
} from "@/lib/seo-guides";

const WORLD_SUMMIT_SLUG = "world-summit-ai-amsterdam-2026";

/**
 * Facts already recorded for this summit. Used only when the stored event
 * cannot be read. Dates match WORLD_SUMMIT_DATES (7–8 October 2026).
 */
function fallbackMeta(locale: string): string {
  return eventMetaDescription(
    {
      title: "World Summit AI Amsterdam 2026",
      date: "2026-10-07",
      endDate: "2026-10-08",
      city: "Amsterdam",
      location: WORLD_SUMMIT_VENUE,
      format: "in-person",
    },
    locale,
  );
}

async function worldSummitMeta(locale: string): Promise<string> {
  try {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "events",
      where: { slug: { equals: WORLD_SUMMIT_SLUG } },
      locale: locale === "nl" ? "nl" : "en",
      limit: 1,
      depth: 0,
    });
    const event = docs[0];
    if (!event?.title) return fallbackMeta(locale);
    return eventMetaDescription(
      {
        title: event.title,
        date: event.date ? String(event.date) : null,
        endDate: event.endDate ? String(event.endDate) : null,
        city: event.city,
        location: event.location,
        format: event.format,
        summary: event.summary,
        description: lexicalToPlainText(event.description),
      },
      locale,
    );
  } catch (error) {
    console.error("[world-summit] event meta fell back to stored facts", error);
    return fallbackMeta(locale);
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const description = await worldSummitMeta(locale);
  return {
    title: WORLD_SUMMIT_H1,
    description,
    ...buildOgMeta(WORLD_SUMMIT_H1, description, "Event"),
    alternates: await localeAlternates(WORLD_SUMMIT_PATH),
  };
}

export default async function WorldSummitPage() {
  const locale = await getLocale();
  const t = await getTranslations("worldSummitEvent");
  return (
    <WorldSummitGuide locale={locale} t={t}>
      <EventHubLinks />
    </WorldSummitGuide>
  );
}
