import type { MetadataRoute } from "next";
import { getPayloadClient } from "@/server/payload";

// Time-based ISR instead of force-dynamic: a sitemap does not need to be
// live-fresh on every crawl. force-dynamic + three sequential Payload
// finds against Neon meant every Googlebot/manual hit was a cold-capable
// serverless invocation with no cache (production always sent
// `x-vercel-cache: MISS` + `max-age=0`). Any transient pg/Neon error
// then 500'd the whole route because nothing was caught.
export const revalidate = 3600;

const BASE_URL = "https://aitcommunity.org";

const STATIC_PAGES = [
  "",
  "/events",
  "/blog",
  "/community",
  "/members",
  "/sponsors",
  "/jobs",
  "/agents",
  "/ideas",
  "/privacy",
  "/terms",
] as const;

type SitemapDoc = {
  slug?: string | null;
  updatedAt?: string | Date | null;
};

type SitemapClient = Pick<Awaited<ReturnType<typeof getPayloadClient>>, "find">;

function safeDate(value: string | Date | null | undefined): Date {
  if (value == null || value === "") return new Date();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function localeEntries(
  path: string,
  lastModified?: Date,
): MetadataRoute.Sitemap[number] {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return {
    url: `${BASE_URL}/en${cleanPath}`,
    lastModified: lastModified ?? new Date(),
    alternates: {
      languages: {
        en: `${BASE_URL}/en${cleanPath}`,
        nl: `${BASE_URL}/nl${cleanPath}`,
      },
    },
  };
}

function docsFromSettled(
  result: PromiseSettledResult<{ docs: SitemapDoc[] }>,
  collection: string,
): SitemapDoc[] {
  if (result.status === "fulfilled") {
    return result.value.docs ?? [];
  }
  console.error(`[sitemap] ${collection} query failed`, result.reason);
  return [];
}

export async function buildSitemapEntries(
  getClient: () => Promise<SitemapClient> = getPayloadClient,
): Promise<MetadataRoute.Sitemap> {
  const staticEntries = STATIC_PAGES.map((path) => localeEntries(path));

  let payload: SitemapClient;
  try {
    payload = await getClient();
  } catch (error) {
    console.error(
      "[sitemap] payload client init failed; returning static entries only",
      error,
    );
    return staticEntries;
  }

  const [eventsResult, articlesResult, threadsResult] =
    await Promise.allSettled([
      payload.find({
        collection: "events",
        where: {
          status: { equals: "published" },
          // Discovered (Luma) events are "scheduled around, not attended
          // through" (CONTEXT.md [[discovered-event]]) — omit them from the
          // public sitemap; they stay in the conflict corpus (corpus.ts
          // untouched).
          discoverySource: { not_equals: "luma" },
        },
        limit: 1000,
        depth: 0,
      }),
      payload.find({
        collection: "articles",
        where: { status: { equals: "published" } },
        limit: 1000,
        depth: 0,
      }),
      payload.find({
        collection: "forum-threads",
        limit: 1000,
        depth: 0,
      }),
    ]);

  const eventEntries = docsFromSettled(eventsResult, "events").map((event) =>
    localeEntries(`/events/${event.slug}`, safeDate(event.updatedAt)),
  );
  const articleEntries = docsFromSettled(articlesResult, "articles").map(
    (article) =>
      localeEntries(`/blog/${article.slug}`, safeDate(article.updatedAt)),
  );
  const threadEntries = docsFromSettled(threadsResult, "forum-threads").map(
    (thread) =>
      localeEntries(`/community/${thread.slug}`, safeDate(thread.updatedAt)),
  );

  return [
    ...staticEntries,
    ...eventEntries,
    ...articleEntries,
    ...threadEntries,
  ];
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapEntries();
}
