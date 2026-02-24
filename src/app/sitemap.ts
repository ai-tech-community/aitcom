import type { MetadataRoute } from "next";
import { getPayloadClient } from "@/server/payload";

const BASE_URL = "https://aitcommunity.org";

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

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const payload = await getPayloadClient();

  const staticPages = [
    "",
    "/events",
    "/blog",
    "/community",
    "/members",
    "/sponsors",
    "/jobs",
    "/privacy",
    "/terms",
  ];

  const staticEntries = staticPages.map((path) => localeEntries(path));

  const { docs: events } = await payload.find({
    collection: "events",
    where: { status: { equals: "published" } },
    limit: 1000,
    depth: 0,
  });
  const eventEntries = events.map((event) =>
    localeEntries(`/events/${event.slug}`, new Date(event.updatedAt)),
  );

  const { docs: articles } = await payload.find({
    collection: "articles",
    where: { status: { equals: "published" } },
    limit: 1000,
    depth: 0,
  });
  const articleEntries = articles.map((article) =>
    localeEntries(`/blog/${article.slug}`, new Date(article.updatedAt)),
  );

  const { docs: threads } = await payload.find({
    collection: "forum-threads",
    limit: 1000,
    depth: 0,
  });
  const threadEntries = threads.map((thread) =>
    localeEntries(`/community/${thread.slug}`, new Date(thread.updatedAt)),
  );

  return [...staticEntries, ...eventEntries, ...articleEntries, ...threadEntries];
}
