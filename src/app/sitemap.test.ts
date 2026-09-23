import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/payload", () => ({
  getPayloadClient: vi.fn(),
}));

// The default hidden-community lookup must never reach a real database here.
vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/server/communities/content-visibility-queries", () => ({
  hiddenContentCommunityIds: vi.fn(async () => []),
}));

import { getPayloadClient } from "@/server/payload";
import * as sitemapModule from "./sitemap";
import { buildSitemapEntries } from "./sitemap";

const mockGetPayloadClient = vi.mocked(getPayloadClient);

const STATIC_PATHS = [
  "/",
  "/events",
  "/blog",
  "/communities/ait/forum",
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

function urlsOf(entries: Awaited<ReturnType<typeof buildSitemapEntries>>) {
  return entries.map((entry) => entry.url);
}

function localeFor(path: string) {
  const suffix = path === "/" ? "" : path;
  return {
    url: `https://www.aitcommunity.org/en${suffix}`,
    languages: {
      en: `https://www.aitcommunity.org/en${suffix}`,
      nl: `https://www.aitcommunity.org/nl${suffix}`,
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("sitemap cache policy", () => {
  it("uses hourly ISR instead of force-dynamic", () => {
    expect(sitemapModule.revalidate).toBe(3600);
    expect((sitemapModule as { dynamic?: string }).dynamic).toBeUndefined();
  });
});

describe("buildSitemapEntries", () => {
  it("includes static pages plus published collections with locale alternates", async () => {
    const find = vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === "events") {
        return {
          docs: [{ slug: "ai-night", updatedAt: "2026-04-01T12:00:00.000Z" }],
        };
      }
      if (collection === "articles") {
        return {
          docs: [{ slug: "hello", updatedAt: "2026-04-02T12:00:00.000Z" }],
        };
      }
      if (collection === "forum-threads") {
        return {
          docs: [
            { slug: "intro", updatedAt: "2026-04-03T12:00:00.000Z" },
            {
              slug: "welcome-start-here-hub-join-guides-1788790840883",
              communityId: null,
              updatedAt: "2026-09-07T14:20:40.897Z",
            },
            {
              slug: "tesst-1780215061668",
              communityId: "nl-community-id",
              updatedAt: "2026-04-04T12:00:00.000Z",
            },
          ],
        };
      }
      throw new Error(`unexpected collection ${collection}`);
    });
    mockGetPayloadClient.mockResolvedValue({
      find,
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const entries = await buildSitemapEntries(
      undefined,
      async () => new Map([["nl-community-id", "ait-community-netherlands"]]),
      async () => [],
    );
    const urls = urlsOf(entries);

    for (const path of STATIC_PATHS) {
      const loc = localeFor(path);
      expect(urls).toContain(loc.url);
      const entry = entries.find((item) => item.url === loc.url);
      expect(entry?.alternates?.languages).toEqual(loc.languages);
    }

    expect(urls).toContain("https://www.aitcommunity.org/en/events/ai-night");
    expect(urls).toContain("https://www.aitcommunity.org/en/blog/hello");
    expect(urls).toContain(
      "https://www.aitcommunity.org/en/communities/ait/forum/intro",
    );
    expect(urls).toContain(
      "https://www.aitcommunity.org/en/communities/ait/forum/welcome-start-here-hub-join-guides-1788790840883",
    );
    expect(urls).toContain(
      "https://www.aitcommunity.org/en/communities/ait-community-netherlands/forum/tesst-1780215061668",
    );
    expect(urls).not.toContain(
      "https://www.aitcommunity.org/en/community/intro",
    );
    expect(urls).not.toContain("https://www.aitcommunity.org/en/community");
    expect(
      entries.find(
        (item) =>
          item.url === "https://www.aitcommunity.org/en/events/ai-night",
      )?.alternates?.languages,
    ).toEqual({
      en: "https://www.aitcommunity.org/en/events/ai-night",
      nl: "https://www.aitcommunity.org/nl/events/ai-night",
    });

    const eventQuery = find.mock.calls.find(
      (call) => call[0]?.collection === "events",
    )?.[0];
    expect(eventQuery).toMatchObject({
      collection: "events",
      where: {
        status: { equals: "published" },
        discoverySource: { not_equals: "luma" },
      },
      limit: 1000,
      depth: 0,
    });
    expect(find).toHaveBeenCalledTimes(3);
  });

  it("keeps successful collections when one query rejects", async () => {
    const find = vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === "events") {
        throw new Error("connection reset");
      }
      if (collection === "articles") {
        return {
          docs: [{ slug: "hello", updatedAt: "2026-04-02T12:00:00.000Z" }],
        };
      }
      return {
        docs: [{ slug: "intro", updatedAt: "2026-04-03T12:00:00.000Z" }],
      };
    });
    mockGetPayloadClient.mockResolvedValue({
      find,
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const entries = await buildSitemapEntries(
      undefined,
      async () => new Map(),
      async () => [],
    );
    const urls = urlsOf(entries);

    expect(urls).toContain("https://www.aitcommunity.org/en/blog/hello");
    expect(urls).toContain(
      "https://www.aitcommunity.org/en/communities/ait/forum/intro",
    );
    expect(urls).not.toContain(
      "https://www.aitcommunity.org/en/community/intro",
    );
    expect(urls).not.toContain("https://www.aitcommunity.org/en/community");
    expect(urls).not.toContain(
      "https://www.aitcommunity.org/en/events/ai-night",
    );
    expect(urls).toContain("https://www.aitcommunity.org/en");
    expect(console.error).toHaveBeenCalledWith(
      "[sitemap] events query failed",
      expect.any(Error),
    );
  });

  it("returns static pages when payload init fails", async () => {
    mockGetPayloadClient.mockRejectedValue(new Error("too many clients"));

    const entries = await buildSitemapEntries(
      undefined,
      async () => new Map(),
      async () => [],
      async () => [],
    );
    const urls = urlsOf(entries);

    expect(urls).toContain("https://www.aitcommunity.org/en");
    expect(urls).toContain("https://www.aitcommunity.org/en/events");
    expect(
      urls.filter(
        (url) =>
          /\/en\/(events|blog)\/.+/.test(url) ||
          /\/en\/community\/.+/.test(url) ||
          /\/en\/communities\/[^/]+\/forum\/.+/.test(url),
      ),
    ).toEqual([]);
    expect(entries).toHaveLength(STATIC_PATHS.length);
    expect(console.error).toHaveBeenCalledWith(
      "[sitemap] payload client init failed; returning static entries only",
      expect.any(Error),
    );
  });

  it("does not throw when a collection lastModified is unparseable", async () => {
    const find = vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === "events") {
        return { docs: [{ slug: "broken", updatedAt: "not-a-date" }] };
      }
      return { docs: [] };
    });
    mockGetPayloadClient.mockResolvedValue({
      find,
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const entries = await buildSitemapEntries(
      undefined,
      async () => new Map(),
      async () => [],
    );
    const event = entries.find(
      (item) => item.url === "https://www.aitcommunity.org/en/events/broken",
    );
    expect(event).toBeDefined();
    expect(event?.lastModified).toBeInstanceOf(Date);
    expect(Number.isNaN((event?.lastModified as Date).getTime())).toBe(false);
  });

  it("includes Startups Directory and Insights even below the promo count", async () => {
    mockGetPayloadClient.mockRejectedValue(new Error("skip collections"));

    const staticOnly = await buildSitemapEntries(
      undefined,
      async () => new Map(),
      async () => [],
      async () => [],
    );
    const staticUrls = urlsOf(staticOnly);
    expect(staticUrls).toContain("https://www.aitcommunity.org/en/startups");
    expect(staticUrls).toContain(
      "https://www.aitcommunity.org/en/startups/insights",
    );
    expect(staticUrls).toContain("https://www.aitcommunity.org/en/jobs");
    expect(staticUrls).not.toContain(
      "https://www.aitcommunity.org/en/startups/jobs",
    );

    const indexed = await buildSitemapEntries(
      undefined,
      async () => new Map(),
      async () => [],
      async () => [
        "/startups",
        "/startups/insights",
        "/startups?page=2",
        "/startups/cursor-anysphere",
      ],
    );
    const indexedUrls = urlsOf(indexed);
    expect(indexedUrls).toContain("https://www.aitcommunity.org/en/startups");
    expect(indexedUrls).toContain(
      "https://www.aitcommunity.org/en/startups/insights",
    );
    expect(indexedUrls).toContain(
      "https://www.aitcommunity.org/en/startups?page=2",
    );
    expect(indexedUrls).toContain(
      "https://www.aitcommunity.org/en/startups/cursor-anysphere",
    );
    expect(
      indexedUrls.filter(
        (url) => url === "https://www.aitcommunity.org/en/startups",
      ),
    ).toHaveLength(1);
  });

  it("grows Startups ?page= locs with the listed row count, like Awesome", async () => {
    mockGetPayloadClient.mockRejectedValue(new Error("skip collections"));
    const { STARTUPS_PAGE_SIZE, STARTUPS_PATH, startupDirectorySitemapPaths } =
      await import("@/lib/investigations/startups");

    const listed = 3479;
    const extra = startupDirectorySitemapPaths(listed, STARTUPS_PAGE_SIZE);
    expect(extra).toHaveLength(Math.ceil(listed / STARTUPS_PAGE_SIZE) - 1);
    expect(extra[0]).toBe(`${STARTUPS_PATH}?page=2`);
    expect(extra.at(-1)).toBe(`${STARTUPS_PATH}?page=145`);

    const entries = await buildSitemapEntries(
      undefined,
      async () => new Map(),
      async () => [],
      async () => extra,
    );
    const urls = urlsOf(entries);
    expect(urls).toContain("https://www.aitcommunity.org/en/startups?page=2");
    expect(urls).toContain("https://www.aitcommunity.org/en/startups?page=145");
    expect(urls).not.toContain(
      "https://www.aitcommunity.org/en/startups?page=1",
    );
    expect(
      entries.find(
        (item) =>
          item.url === "https://www.aitcommunity.org/en/startups?page=145",
      )?.alternates?.languages,
    ).toEqual({
      en: "https://www.aitcommunity.org/en/startups?page=145",
      nl: "https://www.aitcommunity.org/nl/startups?page=145",
    });
  });

  it("includes later Startups directory pages from the live Neon row count", async () => {
    mockGetPayloadClient.mockRejectedValue(new Error("skip collections"));

    const entries = await buildSitemapEntries(
      undefined,
      async () => new Map(),
      async () => [],
      async () => ["/startups?page=2", "/startups?page=3"],
    );
    const urls = urlsOf(entries);

    expect(urls).toContain("https://www.aitcommunity.org/en/startups?page=2");
    expect(urls).toContain("https://www.aitcommunity.org/en/startups?page=3");
    expect(
      entries.find(
        (item) =>
          item.url === "https://www.aitcommunity.org/en/startups?page=2",
      )?.alternates?.languages,
    ).toEqual({
      en: "https://www.aitcommunity.org/en/startups?page=2",
      nl: "https://www.aitcommunity.org/nl/startups?page=2",
    });
  });

  it("includes later Awesome AI OSS directory pages with locale alternates", async () => {
    mockGetPayloadClient.mockRejectedValue(new Error("skip collections"));

    const entries = await buildSitemapEntries(
      undefined,
      async () => new Map(),
      async () => [
        "/investigations/awesome-ai-oss?page=2",
        "/investigations/awesome-ai-oss?page=3",
      ],
    );
    const urls = urlsOf(entries);

    expect(urls).toContain(
      "https://www.aitcommunity.org/en/investigations/awesome-ai-oss?page=2",
    );
    expect(urls).toContain(
      "https://www.aitcommunity.org/en/investigations/awesome-ai-oss?page=3",
    );
    expect(
      entries.find(
        (item) =>
          item.url ===
          "https://www.aitcommunity.org/en/investigations/awesome-ai-oss?page=2",
      )?.alternates?.languages,
    ).toEqual({
      en: "https://www.aitcommunity.org/en/investigations/awesome-ai-oss?page=2",
      nl: "https://www.aitcommunity.org/nl/investigations/awesome-ai-oss?page=2",
    });
  });
  it("asks Payload only for threads of publicly readable communities", async () => {
    const find = vi.fn(async (_args: { collection: string }) => ({
      docs: [],
    }));
    mockGetPayloadClient.mockResolvedValue({
      find,
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    await buildSitemapEntries(
      undefined,
      async () => new Map(),
      async () => [],
      async () => [],
      async () => ["unlisted-id"],
    );

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "forum-threads",
        where: {
          or: [
            { communityId: { exists: false } },
            { communityId: { not_in: ["unlisted-id"] } },
          ],
        },
      }),
    );
  });

  it("lists no threads when the hidden-community lookup fails", async () => {
    const find = vi.fn(async ({ collection }: { collection: string }) => ({
      docs:
        collection === "forum-threads"
          ? [{ slug: "secret", updatedAt: "2026-04-03T12:00:00.000Z" }]
          : [],
    }));
    mockGetPayloadClient.mockResolvedValue({
      find,
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const entries = await buildSitemapEntries(
      undefined,
      async () => new Map(),
      async () => [],
      async () => [],
      async () => {
        throw new Error("db down");
      },
    );

    expect(find).not.toHaveBeenCalledWith(
      expect.objectContaining({ collection: "forum-threads" }),
    );
    expect(urlsOf(entries).some((url) => url.includes("/forum/secret"))).toBe(
      false,
    );
  });
});
