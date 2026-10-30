import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { EventHubLinks } from "@/components/events/event-hub-links";
import { WorldSummitGuide } from "@/components/guides/world-summit-guide";
import { resolveLocale } from "@/i18n/messages";
import { localeAlternates, buildOgMeta } from "@/lib/metadata";
import { eventMetaDescription } from "@/lib/events/listing-policy";
import { lexicalToPlainText } from "@/server/challenge-engine/lexical";
import { getPayloadClient } from "@/server/payload";
import { WORLD_SUMMIT_PATH, WORLD_SUMMIT_VENUE } from "@/lib/seo-guides";

const WORLD_SUMMIT_SLUG = "world-summit-ai-amsterdam-2026";

/**
 * Facts already recorded for this summit. Used only when the stored event
 * cannot be read. Dates match WORLD_SUMMIT_DATES (7–8 October 2026).
 */
function fallbackMeta(locale: string, onlineLabel: string): string {
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
    onlineLabel,
  );
}

async function worldSummitMeta(
  locale: string,
  onlineLabel: string,
): Promise<string> {
  try {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "events",
      where: { slug: { equals: WORLD_SUMMIT_SLUG } },
      locale: resolveLocale(locale),
      limit: 1,
      depth: 0,
    });
    const event = docs[0];
    if (!event?.title) return fallbackMeta(locale, onlineLabel);
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
      onlineLabel,
    );
  } catch (error) {
    console.error("[world-summit] event meta fell back to stored facts", error);
    return fallbackMeta(locale, onlineLabel);
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const [t, tEvents] = await Promise.all([
    getTranslations("worldSummitEvent"),
    getTranslations("events"),
  ]);
  const title = t("title");
  const description = await worldSummitMeta(locale, tEvents("online"));
  return {
    title,
    description,
    ...buildOgMeta(title, description, t("kicker")),
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
