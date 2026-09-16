import { asc } from "drizzle-orm";

import { curatedPublicEventCards } from "@/lib/events/public-events-seeds";
import {
  publicEventFromHosted,
  type PublicEventCard,
  type PublicEventLocale,
} from "@/lib/events/public-events";
import { db } from "@/server/db";
import { curatedPublicEvents } from "@/server/db/schema";
import { getPayloadClient } from "@/server/payload";

function toCuratedCard(
  row: typeof curatedPublicEvents.$inferSelect,
): PublicEventCard {
  return {
    id: row.id,
    title: row.title,
    date: row.date,
    online: row.online,
    city: row.city,
    url: row.url,
    why: { en: row.whyEn, nl: row.whyNl },
    source: "curated",
  };
}

export async function listCuratedPublicEvents(): Promise<PublicEventCard[]> {
  try {
    const rows = await db
      .select()
      .from(curatedPublicEvents)
      .orderBy(asc(curatedPublicEvents.date));
    if (rows.length === 0) return curatedPublicEventCards();
    return rows.map(toCuratedCard);
  } catch {
    return curatedPublicEventCards();
  }
}

export async function listHostedPublicEventCards(
  locale: PublicEventLocale,
): Promise<PublicEventCard[]> {
  try {
    const payload = await getPayloadClient();
    const { docs } = await payload.find({
      collection: "events",
      where: {
        and: [
          { status: { equals: "published" } },
          { discoverySource: { not_equals: "luma" } },
        ],
      },
      sort: "date",
      locale,
      draft: false,
      depth: 0,
      limit: 200,
    });

    return docs.flatMap((doc) => {
      const card = publicEventFromHosted(
        {
          id: doc.id,
          title: typeof doc.title === "string" ? doc.title : "",
          slug: typeof doc.slug === "string" ? doc.slug : "",
          date: typeof doc.date === "string" ? doc.date : "",
          format: typeof doc.format === "string" ? doc.format : null,
          city: typeof doc.city === "string" ? doc.city : null,
          location: typeof doc.location === "string" ? doc.location : null,
          sourceUrl: typeof doc.sourceUrl === "string" ? doc.sourceUrl : null,
          summary: typeof doc.summary === "string" ? doc.summary : null,
        },
        locale,
      );
      return card ? [card] : [];
    });
  } catch {
    return [];
  }
}

export async function listPublicEventCards(
  _locale?: PublicEventLocale,
): Promise<PublicEventCard[]> {
  return listCuratedPublicEvents();
}
