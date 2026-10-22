import type { MetadataRoute } from "next";
import { unstable_noStore as noStore } from "next/cache";
import type { Where } from "payload";
import { awesomeDirectorySitemapPaths } from "@/lib/investigations/awesome-ai-oss";
import {
  startupDirectorySitemapPaths,
  startupProfileSitemapPaths,
} from "@/lib/investigations/startups";
import { routing } from "@/i18n/routing";
import { absoluteLocaleUrl } from "@/lib/metadata";
import { isUnlistedNewsGamePath } from "@/lib/news/indexability";
import {
  HUB_FORUM_PATH,
  forumThreadSitemapPath,
} from "@/server/communities/forum-scope";
import { communityContentReadableWhere } from "@/server/communities/content-visibility";
import { publishedEventsVisibleWhere } from "@/lib/events/public-event-access";
import {
  docBelongsToHiddenCommunity,
  hiddenCommunitySlugs,
  withoutHiddenCommunityUrls,
} from "@/server/communities/sitemap-exclusions";
import { getPayloadClient } from "@/server/payload";

// Time-based ISR instead of force-dynamic: a sitemap does not need to be
// live-fresh on every crawl. force-dynamic + three sequential Payload
// finds against Neon meant every Googlebot/manual hit was a cold-capable
// serverless invocation with no cache (production always sent
// `x-vercel-cache: MISS` + `max-age=0`). Any transient pg/Neon error
// then 500'd the whole route because nothing was caught.
export const revalidate = 3600;

// /news (weekly board included), story pages, /news/stories/contribute,
// contribution-badge shares, claim URLs, and per-week query URLs stay out.
// Those routes are noindex. A claim is a POST, not a URL.
const STATIC_PAGES = [
  "",
  "/events",
  "/blog",
  HUB_FORUM_PATH,
  "/members",
  "/sponsors",
  "/jobs",
  "/agents",
  "/ideas",
  "/privacy",
  "/terms",
  "/setup",
  "/join",
  "/guides/register-agent-mcp",
  "/guides/mcp-registry-vs-community-hub",
  "/guides/agent-ready-community",
  "/investigations/awesome-ai-oss",
  "/investigations/awesome-ai-oss/insights",
  "/startups",
  "/startups/insights",
  "/roles",
] as const;

type SitemapDoc = {
  slug?: string | null;
  status?: string | null;
  communityId?: string | null;
  updatedAt?: string | Date | null;
};

type SitemapClient = Pick<Awaited<ReturnType<typeof getPayloadClient>>, "find">;

function safeDate(value: string | Date | null | undefined): Date | undefined {
  if (value == null || value === "") return undefined;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

const RETIRED_SITEMAP_SECTIONS = ["benchmark", "challenges", "impact"] as const;

/** True for `/en/benchmark` (and subpaths) and the same paths in other locales. */
export function isRetiredSectionSitemapUrl(url: string): boolean {
  let pathname = url;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return false;
  }
  const locales = routing.locales.join("|");
  const section = new RegExp(`^/(?:${locales})/([^/]+)`).exec(pathname)?.[1];
  return (
    section != null &&
    (RETIRED_SITEMAP_SECTIONS as readonly string[]).includes(section)
  );
}

export function withoutRetiredSectionUrls(
  entries: MetadataRoute.Sitemap,
): MetadataRoute.Sitemap {
  return entries.filter((entry) => {
    if (isRetiredSectionSitemapUrl(entry.url)) return false;
    const languages = entry.alternates?.languages;
    if (!languages) return true;
    return Object.values(languages).every(
      (value) =>
        typeof value !== "string" || !isRetiredSectionSitemapUrl(value),
    );
  });
}

function localeEntries(
  path: string,
  lastModified?: Date,
): MetadataRoute.Sitemap[number] {
  return {
    url: absoluteLocaleUrl("en", path),
    ...(lastModified ? { lastModified } : {}),
    alternates: {
      languages: {
        en: absoluteLocaleUrl("en", path),
        nl: absoluteLocaleUrl("nl", path),
      },
    },
  };
}

function uniqueLocaleEntries(
  paths: readonly string[],
  updatedAtByPath: ReadonlyMap<string, Date> = new Map(),
): MetadataRoute.Sitemap {
  const seen = new Set<string>();
  const entries: MetadataRoute.Sitemap = [];
  for (const path of paths) {
    if (seen.has(path)) continue;
    seen.add(path);
    entries.push(localeEntries(path, safeDate(updatedAtByPath.get(path))));
  }
  return entries;
}

/**
 * Published events a guest may see. Discovered (Luma) events are "scheduled
 * around, not attended through" (CONTEXT.md [[discovered-event]]) — omit
 * them from the public sitemap; they stay in the conflict corpus.
 * When visibility is unknown, keep only events with no community. Otherwise
 * drop events of private, unlisted, or invite-only communities and keep
 * unscoped events. Cancelled events are not published, and a returned
 * cancelled row is dropped again below.
 */
function publishedEventsWhere(
  hiddenCommunityIds: readonly string[] | null,
): Where {
  return publishedEventsVisibleWhere(hiddenCommunityIds);
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

async function defaultCommunitySlugById(): Promise<
  ReadonlyMap<string, string>
> {
  try {
    const { isNull } = await import("drizzle-orm");
    const { db } = await import("@/server/db");
    const { communities } = await import("@/server/db/schema");
    const rows = await db
      .select({ id: communities.id, slug: communities.slug })
      .from(communities)
      .where(isNull(communities.deletedAt));
    return new Map(rows.map((row) => [row.id, row.slug]));
  } catch (error) {
    console.error("[sitemap] community slug lookup failed", error);
    return new Map();
  }
}

/** Communities whose threads a signed-out visitor may not read (ADR-0030). */
async function defaultHiddenCommunityIds(): Promise<string[]> {
  const { db } = await import("@/server/db");
  const { hiddenContentCommunityIds } =
    await import("@/server/communities/content-visibility-queries");
  return hiddenContentCommunityIds(db, null);
}

/** Communities whose events a signed-out visitor may not see. */
async function defaultHiddenEventCommunityIds(): Promise<string[]> {
  const { db } = await import("@/server/db");
  const { hiddenEventCommunityIds } =
    await import("@/server/events/public-event-access");
  return hiddenEventCommunityIds(db, null);
}

/** `updated_at` for startup profiles and open roles, keyed by public path. */
async function defaultPathUpdatedAt(): Promise<ReadonlyMap<string, Date>> {
  try {
    const { listSitemapContentUpdatedAt } =
      await import("@/server/startups/sitemap-updated-at");
    return await listSitemapContentUpdatedAt();
  } catch (error) {
    console.error("[sitemap] content lastmod lookup failed", error);
    return new Map();
  }
}

async function defaultAwesomePagePaths(): Promise<string[]> {
  try {
    const { listApprovedPublicCards } =
      await import("@/server/awesome-ai-oss/queries");
    const cards = await listApprovedPublicCards();
    return awesomeDirectorySitemapPaths(cards.length);
  } catch (error) {
    console.error("[sitemap] awesome directory page lookup failed", error);
    return [];
  }
}

async function defaultStartupPagePaths(): Promise<string[]> {
  noStore();
  try {
    const {
      listedPublicStartupCount,
      listApprovedPublicStartupSlugs,
      listOpenStartupRoleSlugs,
    } = await import("@/server/startups/queries");
    const { startupRoleSitemapPaths } =
      await import("@/lib/investigations/startup-roles");
    const listed = await listedPublicStartupCount();
    const slugs = await listApprovedPublicStartupSlugs();
    const roleSlugs = await listOpenStartupRoleSlugs();
    return [
      ...startupDirectorySitemapPaths(listed),
      ...startupProfileSitemapPaths(slugs),
      ...startupRoleSitemapPaths(roleSlugs),
    ];
  } catch (error) {
    console.error("[sitemap] startups directory page lookup failed", error);
    return [];
  }
}

export async function buildSitemapEntries(
  getClient: () => Promise<SitemapClient> = getPayloadClient,
  getCommunitySlugById: () => Promise<
    ReadonlyMap<string, string>
  > = defaultCommunitySlugById,
  getAwesomePagePaths: () => Promise<string[]> = defaultAwesomePagePaths,
  getStartupPagePaths: () => Promise<string[]> = defaultStartupPagePaths,
  getHiddenCommunityIds: () => Promise<
    readonly string[]
  > = defaultHiddenCommunityIds,
  getPathUpdatedAt: () => Promise<
    ReadonlyMap<string, Date>
  > = defaultPathUpdatedAt,
  getHiddenEventCommunityIds: () => Promise<
    readonly string[]
  > = defaultHiddenEventCommunityIds,
): Promise<MetadataRoute.Sitemap> {
  let awesomePagePaths: string[] = [];
  try {
    awesomePagePaths = await getAwesomePagePaths();
  } catch (error) {
    console.error("[sitemap] awesome directory page lookup failed", error);
  }
  let startupPagePaths: string[] = [];
  try {
    startupPagePaths = await getStartupPagePaths();
  } catch (error) {
    console.error("[sitemap] startups directory page lookup failed", error);
    startupPagePaths = [];
  }

  let updatedAtByPath: ReadonlyMap<string, Date> = new Map();
  try {
    updatedAtByPath = await getPathUpdatedAt();
  } catch (error) {
    console.error("[sitemap] content lastmod lookup failed", error);
  }

  const staticEntries = uniqueLocaleEntries(
    [...STATIC_PAGES, ...awesomePagePaths, ...startupPagePaths],
    updatedAtByPath,
  );

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

  // Fail closed: if we cannot tell which communities are members-only, list
  // no community threads or community events rather than risk publishing an
  // unlisted community's URLs.
  let hiddenCommunityIds: readonly string[] | null = null;
  try {
    hiddenCommunityIds = await getHiddenCommunityIds();
  } catch (error) {
    console.error("[sitemap] hidden community lookup failed", error);
  }

  // Events use a wider gate than forum threads: invite-only as well as
  // unlisted. A failed lookup fails closed (no community events).
  let hiddenEventCommunityIds: readonly string[] | null = null;
  try {
    const eventHidden = await getHiddenEventCommunityIds();
    hiddenEventCommunityIds =
      hiddenCommunityIds === null
        ? eventHidden
        : [...new Set([...hiddenCommunityIds, ...eventHidden])];
  } catch (error) {
    console.error("[sitemap] hidden event community lookup failed", error);
  }

  const [eventsResult, articlesResult, threadsResult] =
    await Promise.allSettled([
      payload.find({
        collection: "events",
        where: publishedEventsWhere(hiddenEventCommunityIds),
        limit: 1000,
        depth: 0,
      }),
      payload.find({
        collection: "articles",
        where: { status: { equals: "published" } },
        limit: 1000,
        depth: 0,
      }),
      hiddenCommunityIds === null
        ? Promise.resolve({ docs: [] })
        : payload.find({
            collection: "forum-threads",
            where:
              communityContentReadableWhere(hiddenCommunityIds) ?? undefined,
            limit: 1000,
            depth: 0,
          }),
    ]);

  let communitySlugById: ReadonlyMap<string, string> = new Map();
  try {
    communitySlugById = await getCommunitySlugById();
  } catch (error) {
    console.error("[sitemap] community slug lookup failed", error);
  }

  const visible = (doc: SitemapDoc) =>
    !docBelongsToHiddenCommunity(doc.communityId, hiddenCommunityIds);

  const eventEntries = docsFromSettled(eventsResult, "events")
    .filter((event) => event.status !== "cancelled")
    .filter(
      (event) =>
        !docBelongsToHiddenCommunity(
          event.communityId,
          hiddenEventCommunityIds,
        ),
    )
    .map((event) =>
      localeEntries(`/events/${event.slug}`, safeDate(event.updatedAt)),
    );
  const articleEntries = docsFromSettled(articlesResult, "articles")
    .filter(visible)
    .map((article) =>
      localeEntries(`/blog/${article.slug}`, safeDate(article.updatedAt)),
    );

  const threadEntries = docsFromSettled(threadsResult, "forum-threads")
    .filter(visible)
    .flatMap((thread) => {
      const path = forumThreadSitemapPath(thread, communitySlugById);
      return path ? [localeEntries(path, safeDate(thread.updatedAt))] : [];
    });

  // Community pages, forum threads, and any other URL under an unlisted
  // slug, in every locale. Event URLs do not carry the slug; those are
  // dropped above by community id.
  const hiddenSlugs =
    hiddenCommunityIds === null
      ? new Set<string>()
      : hiddenCommunitySlugs(communitySlugById, hiddenCommunityIds);

  return withoutRetiredSectionUrls(
    withoutHiddenCommunityUrls(
      [...staticEntries, ...eventEntries, ...articleEntries, ...threadEntries],
      hiddenSlugs,
    ).filter((entry) => !isUnlistedNewsGamePath(entry.url)),
  );
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return buildSitemapEntries();
}
