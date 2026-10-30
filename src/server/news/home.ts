import { desc, sql } from "drizzle-orm";
import type { db as database } from "@/server/db";
import { newsItems, newsStorylines } from "@/server/db/schema";
import { plainText } from "@/server/collectors/helpers/feed";
import { newsSourceFromUrl } from "@/lib/news/table";
import { publicStoryline } from "./storylines";

export type HomeNewsItem = {
  id: string;
  kind: "news" | "story";
  title: string;
  summary: string;
  href: string;
  source: string | null;
  date: string;
  englishFallback: boolean;
};

/** Six recent updates, reserving room for up to two public editorial stories. */
export async function loadHomeNews(
  db: typeof database,
  locale: string,
): Promise<HomeNewsItem[]> {
  const [news, stories] = await Promise.all([
    db
      .select({
        id: newsItems.id,
        title: newsItems.title,
        summary: newsItems.summary,
        url: newsItems.url,
        date: sql<Date>`coalesce(${newsItems.publishedAt}, ${newsItems.createdAt})`,
      })
      .from(newsItems)
      .orderBy(
        sql`coalesce(${newsItems.publishedAt}, ${newsItems.createdAt}) desc`,
        desc(newsItems.id),
      )
      .limit(6)
      .catch((error: unknown) => {
        console.error("home: could not load latest news", error);
        return [];
      }),
    db
      .select({
        id: newsStorylines.id,
        slug: newsStorylines.slug,
        titleEn: newsStorylines.titleEn,
        titleNl: newsStorylines.titleNl,
        overviewEn: newsStorylines.overviewEn,
        overviewNl: newsStorylines.overviewNl,
        date: newsStorylines.updatedAt,
      })
      .from(newsStorylines)
      .where(publicStoryline)
      .orderBy(desc(newsStorylines.updatedAt), desc(newsStorylines.id))
      .limit(2)
      .catch((error: unknown) => {
        console.error("home: could not load latest stories", error);
        return [];
      }),
  ]);
  const updates: HomeNewsItem[] = [
    ...news.slice(0, 6 - stories.length).map((item) => ({
      id: item.id,
      kind: "news" as const,
      title: item.title,
      summary: plainText(item.summary),
      href: item.url,
      source: newsSourceFromUrl(item.url).label,
      date: new Date(item.date).toISOString(),
      englishFallback: false,
    })),
    ...stories.map((item) => {
      const translated =
        locale === "nl" && !!item.titleNl.trim() && !!item.overviewNl.trim();
      return {
        id: item.id,
        kind: "story" as const,
        title: translated ? item.titleNl : item.titleEn,
        summary: translated ? item.overviewNl : item.overviewEn,
        href: `/news/stories/${item.slug}`,
        source: null,
        date: new Date(item.date).toISOString(),
        englishFallback: locale !== "en" && !translated,
      };
    }),
  ];
  return updates.sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  );
}
