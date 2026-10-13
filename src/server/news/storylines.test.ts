import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { storylineInputSchema } from "@/lib/news/storylines";

const mock = vi.hoisted(() => ({
  rows: [] as unknown[][],
  writes: [] as Array<{ action: string; table: unknown; value: unknown }>,
  committed: [] as unknown[],
  conditions: [] as unknown[],
}));
vi.mock("@/server/db", () => {
  const chain = (
    result: () => unknown,
    where?: (condition: unknown) => void,
  ) => {
    const query: Record<string, unknown> = {};
    for (const method of [
      "from",
      "innerJoin",
      "orderBy",
      "limit",
      "offset",
      "for",
      "onConflictDoUpdate",
    ])
      query[method] = () => query;
    query.where = (condition: unknown) => {
      where?.(condition);
      return query;
    };
    query.then = (resolve: (value: unknown) => void) => resolve(result());
    return query;
  };
  const tx = {
    select: () =>
      chain(
        () => mock.rows.shift() ?? [],
        (condition) => mock.conditions.push(condition),
      ),
    insert: (table: unknown) => ({
      values: (value: unknown) =>
        chain(() => {
          mock.writes.push({ action: "insert", table, value });
          return [];
        }),
    }),
    update: (table: unknown) => ({
      set: (value: unknown) =>
        chain(() => {
          mock.writes.push({ action: "update", table, value });
          return [];
        }),
    }),
    delete: (table: unknown) =>
      chain(() => {
        mock.writes.push({ action: "delete", table, value: null });
        return [];
      }),
  };
  return {
    db: {
      ...tx,
      transaction: async (fn: (tx: unknown) => Promise<void>) => {
        await fn(tx);
        mock.committed = [...mock.writes];
      },
    },
  };
});
vi.mock("./cache", () => ({ revalidateNewsTable: vi.fn() }));

import {
  articleStorylineLinks,
  findStoryline,
  listStorylines,
  relatedStorylines,
  saveStoryline,
  searchStorylineArticles,
} from "./storylines";
import {
  newsStorylines,
  newsStorylineArticles,
  agentDrafts,
} from "@/server/db/schema";
import { revalidateNewsTable } from "./cache";

const article = (id: string) => ({
  id,
  title: "A model runs locally on devices",
  summary: "Local processing keeps documents on the device.",
  url: `https://example.org/${id}`,
  author: null,
  publishedAt: new Date("2026-10-13"),
});
const input = () =>
  storylineInputSchema.parse({
    slug: "local-ai",
    titleEn: "AI on devices",
    overviewEn: "Local processing",
    status: "published",
    articles: ["a", "b"].map((id) => ({
      articleId: id,
      noteEn: "A practical development",
      evidence: "Local processing keeps documents on the device.",
    })),
  });
beforeEach(() => {
  mock.rows = [];
  mock.writes = [];
  mock.committed = [];
  mock.conditions = [];
  vi.clearAllMocks();
});

describe("atomic storyline saves", () => {
  it("stores a validated aggregate and invalidates the archive only after commit", async () => {
    mock.rows = [[article("a"), article("b")]];
    const result = await saveStoryline(input(), "editor");
    expect(result.id).toBeTruthy();
    expect(mock.committed).toHaveLength(5);
    expect(
      mock.writes.find((w) => w.table === newsStorylines)?.value,
    ).toMatchObject({ createdBy: "editor", status: "published" });
    expect(
      mock.writes.filter(
        (w) => w.table === newsStorylineArticles && w.action === "insert",
      ),
    ).toHaveLength(2);
    expect(revalidateNewsTable).toHaveBeenCalledOnce();
  });
  it("allows incomplete drafts but refuses unsupported publication without writes", async () => {
    mock.rows = [[article("a"), article("b")]];
    const unsupported = {
      ...input(),
      articles: input().articles.map((m) => ({
        ...m,
        evidence: "An unsupported generated claim",
      })),
    };
    await expect(saveStoryline(unsupported, "editor")).rejects.toMatchObject({
      code: "invalid",
      message: "publish:evidence",
    });
    expect(mock.writes).toEqual([]);
    expect(revalidateNewsTable).not.toHaveBeenCalled();
    mock.rows = [[]];
    await expect(
      saveStoryline(
        { ...input(), status: "draft", articles: [], overviewEn: "" },
        "editor",
      ),
    ).resolves.toHaveProperty("id");
  });
  it("rejects stale edits and immutable URL changes", async () => {
    mock.rows = [[{ revision: 3, slug: "local-ai" }]];
    await expect(
      saveStoryline({ ...input(), id: "s", revision: 2 }, "editor"),
    ).rejects.toMatchObject({ code: "conflict", message: "stale" });
    mock.rows = [[{ revision: 2, slug: "original" }]];
    await expect(
      saveStoryline({ ...input(), id: "s", revision: 2 }, "editor"),
    ).rejects.toMatchObject({ code: "invalid", message: "immutableSlug" });
    expect(mock.writes).toEqual([]);
  });
  it("rejects missing articles and connections without target membership evidence", async () => {
    mock.rows = [[article("a")]];
    await expect(saveStoryline(input(), "editor")).rejects.toMatchObject({
      code: "invalid",
    });
    mock.rows = [[article("a"), article("b")], [], [article("target-article")]];
    await expect(
      saveStoryline(
        {
          ...input(),
          connections: [
            {
              targetId: "target",
              relation: "shared_development",
              explanationEn: "Common development",
              explanationNl: "",
              fromArticleId: "a",
              toArticleId: "target-article",
            },
          ],
        },
        "editor",
      ),
    ).rejects.toMatchObject({ message: "connectionEvidence" });
    expect(mock.writes).toEqual([]);
  });
});

it("excludes drafts and insufficient source evidence before pagination", async () => {
  mock.rows = [[{ total: 0 }], []];
  await listStorylines();
  const query = new PgDialect({ casing: "snake_case" }).sqlToQuery(
    mock.conditions[0] as Parameters<PgDialect["sqlToQuery"]>[0],
  );
  expect(query.params).toContain("published");
  expect(query.sql).toContain('"news_storyline_article"');
  expect(query.sql).toContain("position(");
  expect(query.sql).toContain(">= 2");
  expect(query.sql).not.toContain("ai_summary");
  expect(await articleStorylineLinks([])).toEqual([]);
});
it("returns null for an inaccessible slug", async () => {
  mock.rows = [[]];
  expect(await findStoryline({ slug: "draft" })).toBeNull();
});
it("preserves incoming relationship direction and hides invalid connection evidence", async () => {
  const edge = {
    sourceId: "other",
    targetId: "current",
    relation: "builds_on",
    fromArticleId: "a",
    toArticleId: "b",
    explanationEn: "A follows B",
    explanationNl: "",
  };
  const member = (
    storylineId: string,
    articleId: string,
    evidence = "Local processing keeps documents on the device.",
  ) => ({
    membership: {
      storylineId,
      articleId,
      noteEn: "Development",
      noteNl: "",
      evidence,
    },
    article: article(articleId),
  });
  mock.rows = [
    [{ edge, target: { id: "other", slug: "other" } }],
    [member("other", "a"), member("current", "b")],
  ];
  expect(await relatedStorylines("current")).toMatchObject([
    { incoming: true, sourceId: "other", targetId: "current" },
  ]);
  mock.rows = [
    [{ edge, target: { id: "other", slug: "other" } }],
    [member("other", "a", "Invented claim"), member("current", "b")],
  ];
  expect(await relatedStorylines("current")).toEqual([]);
});

it("uses archive search semantics including AI summaries while keeping evidence source-only", async () => {
  mock.rows = [[{ total: 0 }], []];
  await searchStorylineArticles("Local   AI (small)", 1);
  const query = new PgDialect({ casing: "snake_case" }).sqlToQuery(
    mock.conditions[0] as Parameters<PgDialect["sqlToQuery"]>[0],
  );
  expect(query.sql).toContain('"ai_summary"');
  expect(query.params).toEqual(
    Array(3).fill(String.raw`local\s+ai\s+\(small\)`),
  );
});

it("consumes an agent proposal in the same transaction as the editorial save", async () => {
  mock.rows = [
    [{ id: "d1", metadata: { original: "agent proposal" } }],
    [article("a"), article("b")],
  ];
  const result = await saveStoryline(
    { ...input(), sourceDraftId: "d1" },
    "editor",
  );
  const consumed = mock.writes.find((w) => w.table === agentDrafts);
  expect(consumed?.value).toMatchObject({
    status: "approved",
    metadata: {
      original: "agent proposal",
      savedStorylineId: result.id,
      reviewedBy: "editor",
    },
  });
  expect(
    mock.writes.find((w) => w.table === newsStorylines)?.value,
  ).not.toHaveProperty("sourceDraftId");
  mock.writes = [];
  mock.committed = [];
  mock.rows = [[]];
  await expect(
    saveStoryline({ ...input(), sourceDraftId: "d1" }, "editor"),
  ).rejects.toMatchObject({ code: "conflict", message: "sourceDraftReviewed" });
  expect(mock.committed).toEqual([]);
});
it("does not expose the name of a hidden contributing agent on public storylines", async () => {
  const story = { ...input(), id: "s1" };
  const rows = input().articles.map((membership) => ({
    membership,
    article: article(membership.articleId),
  }));
  mock.rows = [
    [story],
    rows,
    [{ name: "Hidden agent", visibilityMode: "ghost" }],
  ];
  const result = await findStoryline({ slug: "local-ai" });
  expect(result?.proposedBy).toEqual({ name: null });
});
