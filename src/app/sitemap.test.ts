import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/payload", () => ({
  getPayloadClient: vi.fn(),
}));

import { getPayloadClient } from "@/server/payload";
import * as sitemapModule from "./sitemap";
import { buildSitemapEntries } from "./sitemap";

const mockGetPayloadClient = vi.mocked(getPayloadClient);

const STATIC_PATHS = [
  "/",
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

function urlsOf(entries: Awaited<ReturnType<typeof buildSitemapEntries>>) {
  return entries.map((entry) => entry.url);
}

function localeFor(path: string) {
  const cleanPath = path === "/" ? "/" : path;
  return {
    url: `https://aitcommunity.org/en${cleanPath === "/" ? "/" : cleanPath}`,
    languages: {
      en: `https://aitcommunity.org/en${cleanPath === "/" ? "/" : cleanPath}`,
      nl: `https://aitcommunity.org/nl${cleanPath === "/" ? "/" : cleanPath}`,
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
    expect(
      (sitemapModule as { dynamic?: string }).dynamic,
    ).toBeUndefined();
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
          docs: [{ slug: "intro", updatedAt: "2026-04-03T12:00:00.000Z" }],
        };
      }
      throw new Error(`unexpected collection ${collection}`);
    });
    mockGetPayloadClient.mockResolvedValue({
      find,
    } as unknown as Awaited<ReturnType<typeof getPayloadClient>>);

    const entries = await buildSitemapEntries();
    const urls = urlsOf(entries);

    for (const path of STATIC_PATHS) {
      const loc = localeFor(path);
      expect(urls).toContain(loc.url);
      const entry = entries.find((item) => item.url === loc.url);
      expect(entry?.alternates?.languages).toEqual(loc.languages);
    }

    expect(urls).toContain("https://aitcommunity.org/en/events/ai-night");
    expect(urls).toContain("https://aitcommunity.org/en/blog/hello");
    expect(urls).toContain("https://aitcommunity.org/en/community/intro");
    expect(
      entries.find(
        (item) => item.url === "https://aitcommunity.org/en/events/ai-night",
      )?.alternates?.languages,
    ).toEqual({
      en: "https://aitcommunity.org/en/events/ai-night",
      nl: "https://aitcommunity.org/nl/events/ai-night",
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

    const entries = await buildSitemapEntries();
    const urls = urlsOf(entries);

    expect(urls).toContain("https://aitcommunity.org/en/blog/hello");
    expect(urls).toContain("https://aitcommunity.org/en/community/intro");
    expect(urls).not.toContain("https://aitcommunity.org/en/events/ai-night");
    expect(urls).toContain("https://aitcommunity.org/en/");
    expect(console.error).toHaveBeenCalledWith(
      "[sitemap] events query failed",
      expect.any(Error),
    );
  });

  it("returns static pages when payload init fails", async () => {
    mockGetPayloadClient.mockRejectedValue(new Error("too many clients"));

    const entries = await buildSitemapEntries();
    const urls = urlsOf(entries);

    expect(urls).toContain("https://aitcommunity.org/en/");
    expect(urls).toContain("https://aitcommunity.org/en/events");
    expect(
      urls.filter((url) =>
        /\/en\/(events|blog|community)\/.+/.test(url),
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

    const entries = await buildSitemapEntries();
    const event = entries.find(
      (item) => item.url === "https://aitcommunity.org/en/events/broken",
    );
    expect(event).toBeDefined();
    expect(event?.lastModified).toBeInstanceOf(Date);
    expect(Number.isNaN((event?.lastModified as Date).getTime())).toBe(false);
  });
});
