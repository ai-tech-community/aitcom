import { describe, expect, it } from "vitest";

import { NEWS_FEEDS } from "@/server/news/feeds";

import {
  NEWS_MEMBER_SOURCE,
  NEWS_PAGE_SIZE,
  applyNewsTableQuery,
  buildNewsTableRows,
  newsSourceFromUrl,
  newsTableBlurb,
  newsTableFacets,
  newsTableHref,
  parseNewsTableQuery,
  type NewsRumorInput,
  type NewsStoryInput,
  type NewsTableQuery,
} from "./table";

function story(overrides: Partial<NewsStoryInput> = {}): NewsStoryInput {
  return {
    id: "story-1",
    url: "https://www.theverge.com/ai/models",
    title: "New models",
    author: "Ada",
    publishedAt: new Date("2026-10-11T00:00:00.000Z"),
    summary: "What shipped.",
    ...overrides,
  };
}

function rumor(overrides: Partial<NewsRumorInput> = {}): NewsRumorInput {
  return {
    id: "rumor-1",
    title: "Weights dropped",
    url: null,
    body: "Heard it at the meetup.",
    submitterName: "Ada Lovelace",
    createdAt: new Date("2026-10-12T00:00:00.000Z"),
    hiddenAt: null,
    ...overrides,
  };
}

function query(overrides: Partial<NewsTableQuery> = {}): NewsTableQuery {
  return {
    q: "",
    type: "all",
    source: "",
    company: "",
    sort: "date",
    page: 1,
    story: "",
    ...overrides,
  };
}

describe("parseNewsTableQuery", () => {
  it("keeps shareable defaults and drops unknown values", () => {
    expect(parseNewsTableQuery({})).toEqual(query());
    expect(
      parseNewsTableQuery({
        q: ["  OpenAI   news  "],
        type: "nope",
        sort: "title",
        page: "3",
        source: "feed:theverge.com",
        company: "openai",
        story: "older",
      }),
    ).toEqual(
      query({
        q: "OpenAI news",
        sort: "title",
        page: 3,
        source: "feed:theverge.com",
        company: "openai",
        story: "older",
      }),
    );
    expect(parseNewsTableQuery({ type: "rumor", page: "0" }).type).toBe(
      "rumor",
    );
    expect(parseNewsTableQuery({ page: "0" }).page).toBe(1);
    expect(parseNewsTableQuery({ page: 2.9 }).page).toBe(2);
  });
});

describe("news table rows", () => {
  it("uses the feed author, or the feed name when the author is missing", () => {
    const [withAuthor, without] = buildNewsTableRows(
      [
        story(),
        story({
          id: "story-2",
          author: "  ",
          url: "https://openai.com/news/item",
          title: "Research note",
        }),
      ],
      [],
      [],
      { memberSource: "Member rumor" },
    );
    expect(withAuthor?.writer).toBe("Ada");
    expect(withAuthor?.sourceLabel).toBe("The Verge — AI");
    expect(without?.writer).toBe("OpenAI News");
    expect(without?.companies.map((company) => company.id)).toEqual(["openai"]);
    expect(without?.fallbackLogo).toBeNull();
  });

  it("names the member on a rumor and falls back to the source favicon", () => {
    const [row] = buildNewsTableRows(
      [
        story({
          title: "A quiet week",
          summary: "No companies.",
          url: "https://example.com/week",
        }),
      ],
      [rumor()],
      [],
      { memberSource: "Member rumor" },
    );
    const rumorRow = buildNewsTableRows([], [rumor()], [], {
      memberSource: "Member rumor",
    })[0];
    expect(row?.fallbackLogo).toBe("https://example.com/favicon.ico");
    expect(row?.companies).toEqual([]);
    expect(rumorRow?.writer).toBe("Ada Lovelace");
    expect(rumorRow?.sourceKey).toBe(NEWS_MEMBER_SOURCE);
    expect(rumorRow?.kind).toBe("rumor");
  });

  it("labels every configured feed from its own host", () => {
    for (const feed of NEWS_FEEDS) {
      expect(newsSourceFromUrl(feed.url).label).toBe(feed.name);
    }
  });
});

describe("applyNewsTableQuery", () => {
  const rows = buildNewsTableRows(
    [
      story({
        id: "openai",
        title: "OpenAI ships",
        summary: "A model card.",
        publishedAt: new Date("2026-10-10T00:00:00.000Z"),
        url: "https://www.theverge.com/openai",
      }),
      story({
        id: "quiet",
        title: "A quiet week",
        summary: "No companies here.",
        author: "Grace",
        publishedAt: new Date("2026-10-09T00:00:00.000Z"),
        url: "https://example.com/quiet",
      }),
      story({
        id: "undated",
        title: "Undated note",
        summary: "",
        publishedAt: null,
        url: "https://blog.google/undated",
      }),
    ],
    [
      rumor({
        id: "rumor-meta",
        title: "Meta rumor",
        body: "Heard about a lab.",
        createdAt: new Date("2026-10-12T00:00:00.000Z"),
      }),
    ],
    [],
    { memberSource: "Member rumor" },
  );

  it("filters by type, source, company, and title or text", () => {
    expect(
      applyNewsTableQuery(rows, query({ type: "rumor" })).items.map(
        (row) => row.id,
      ),
    ).toEqual(["rumor-meta"]);
    expect(
      applyNewsTableQuery(rows, query({ type: "verified" })).items.every(
        (row) => row.kind === "story",
      ),
    ).toBe(true);
    expect(
      applyNewsTableQuery(rows, query({ q: "model card" })).items.map(
        (row) => row.id,
      ),
    ).toEqual(["openai"]);
    expect(applyNewsTableQuery(rows, query({ q: "Grace" })).items).toEqual([]);
    expect(
      applyNewsTableQuery(rows, query({ company: "openai" })).items.map(
        (row) => row.id,
      ),
    ).toEqual(["openai"]);
    expect(
      applyNewsTableQuery(rows, query({ company: "meta" })).items.map(
        (row) => row.id,
      ),
    ).toEqual(["rumor-meta"]);
    const verge = rows.find((row) => row.id === "openai")?.sourceKey ?? "";
    expect(
      applyNewsTableQuery(rows, query({ source: verge })).items.map(
        (row) => row.id,
      ),
    ).toEqual(["openai"]);
    expect(
      applyNewsTableQuery(
        rows,
        query({ source: NEWS_MEMBER_SOURCE }),
      ).items.map((row) => row.id),
    ).toEqual(["rumor-meta"]);
  });

  it("sorts by date, title, and source", () => {
    expect(
      applyNewsTableQuery(rows, query({ sort: "date" })).items.map(
        (row) => row.id,
      ),
    ).toEqual(["rumor-meta", "openai", "quiet", "undated"]);
    expect(
      applyNewsTableQuery(rows, query({ sort: "title" })).items.map(
        (row) => row.title,
      ),
    ).toEqual(["A quiet week", "Meta rumor", "OpenAI ships", "Undated note"]);
    const bySource = applyNewsTableQuery(rows, query({ sort: "source" })).items;
    const labels = bySource.map((row) => row.sourceLabel);
    expect([...labels].sort((a, b) => a.localeCompare(b))).toEqual(labels);
  });

  it("pages about twenty rows and clamps a page past the end", () => {
    const many = buildNewsTableRows(
      Array.from({ length: NEWS_PAGE_SIZE + 1 }, (_, index) =>
        story({
          id: `s${index}`,
          title: `Title ${String(index).padStart(2, "0")}`,
          url: `https://example.com/${index}`,
          publishedAt: new Date(Date.UTC(2026, 0, index + 1)),
        }),
      ),
      [],
      [],
      { memberSource: "Member rumor" },
    );
    const page1 = applyNewsTableQuery(many, query({ page: 1 }));
    expect(page1.total).toBe(NEWS_PAGE_SIZE + 1);
    expect(page1.totalPages).toBe(2);
    expect(page1.items).toHaveLength(NEWS_PAGE_SIZE);
    expect(page1.items[0]?.id).toBe(`s${NEWS_PAGE_SIZE}`);
    const page2 = applyNewsTableQuery(many, query({ page: 2 }));
    expect(page2.items.map((row) => row.id)).toEqual(["s0"]);
    const clamped = applyNewsTableQuery(many, query({ page: 9 }));
    expect(clamped.page).toBe(2);
    expect(clamped.items.map((row) => row.id)).toEqual(["s0"]);
  });

  it("keeps a linked story on the page even when filters or the page would hide it", () => {
    const many = buildNewsTableRows(
      Array.from({ length: NEWS_PAGE_SIZE + 1 }, (_, index) =>
        story({
          id: `s${index}`,
          title: `Title ${index}`,
          url: `https://example.com/${index}`,
          publishedAt: new Date(Date.UTC(2026, 0, index + 1)),
        }),
      ),
      [],
      [],
      { memberSource: "Member rumor" },
    );
    const paged = applyNewsTableQuery(many, query({ story: "s0", page: 1 }));
    expect(paged.items.some((row) => row.id === "s0")).toBe(true);
    expect(paged.total).toBe(NEWS_PAGE_SIZE + 1);

    const filtered = applyNewsTableQuery(
      rows,
      query({ q: "model card", story: "quiet" }),
    );
    expect(filtered.items.map((row) => row.id)).toEqual(["openai", "quiet"]);
    expect(filtered.total).toBe(1);
  });
});

describe("newsTableBlurb", () => {
  it("uses the stored TL;DR and otherwise the cleaned feed excerpt", () => {
    expect(
      newsTableBlurb({
        aiSummary: "  A stored line.  ",
        excerpt: "<p>Raw   feed   copy.</p>",
      }),
    ).toBe("A stored line.");
    expect(
      newsTableBlurb({
        aiSummary: "   ",
        excerpt: "<p>Raw   feed &amp; copy.</p>",
      }),
    ).toBe("Raw feed & copy.");
    expect(newsTableBlurb({ aiSummary: null, excerpt: "" })).toBe("");
    const long = `<p>${"word ".repeat(80)}</p>`;
    const clipped = newsTableBlurb({ excerpt: long });
    expect(clipped.endsWith("…")).toBe(true);
    expect(clipped.length).toBeLessThanOrEqual(240);
    expect(clipped).not.toContain("<");
  });

  it("searches the stored summary, the feed excerpt, and the member note", () => {
    const rows = buildNewsTableRows(
      [
        story({
          id: "stored",
          title: "Lab note",
          summary: "The feed mentions widgets.",
          aiSummary: "A stored TL;DR about lattices.",
          url: "https://example.com/lab",
        }),
      ],
      [rumor({ body: "Heard it at the meetup." })],
      [],
      { memberSource: "Member rumor" },
    );
    expect(rows[0]?.blurb).toBe("A stored TL;DR about lattices.");
    expect(
      applyNewsTableQuery(rows, query({ q: "lattices" })).items.map(
        (row) => row.id,
      ),
    ).toEqual(["stored"]);
    expect(
      applyNewsTableQuery(rows, query({ q: "widgets" })).items.map(
        (row) => row.id,
      ),
    ).toEqual(["stored"]);
    expect(
      applyNewsTableQuery(rows, query({ q: "meetup" })).items.map(
        (row) => row.id,
      ),
    ).toEqual(["rumor-1"]);
    expect(rows.find((row) => row.kind === "rumor")?.blurb).toBe(
      "Heard it at the meetup.",
    );
  });
});

describe("newsTableFacets and newsTableHref", () => {
  it("lists sources and companies and omits default query params", () => {
    const rows = buildNewsTableRows(
      [story({ title: "OpenAI ships", url: "https://www.theverge.com/x" })],
      [rumor()],
      [],
      { memberSource: "Member rumor" },
    );
    const facets = newsTableFacets(rows);
    expect(facets.companies.map((company) => company.id)).toContain("openai");
    expect(facets.sources.map((source) => source.label)).toEqual([
      "Member rumor",
      "The Verge — AI",
    ]);
    expect(newsTableHref(query())).toBe("/news");
    expect(
      newsTableHref(query(), {
        q: "OpenAI",
        type: "verified",
        sort: "title",
        page: 2,
        story: "older",
      }),
    ).toBe("/news?q=OpenAI&type=verified&sort=title&page=2&story=older");
  });
});
