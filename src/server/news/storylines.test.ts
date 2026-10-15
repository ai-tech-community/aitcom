import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { storylineInputSchema } from "@/lib/news/storylines";

const mock = vi.hoisted(() => ({
  rows: [] as unknown[][],
  writes: [] as Array<{ action: string; table: unknown; value: unknown }>,
  committed: [] as unknown[],
  conditions: [] as unknown[],
  orders: [] as unknown[][],
  selects: [] as unknown[],
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
      "leftJoin",
      "limit",
      "offset",
      "for",
      "onConflictDoUpdate",
    ])
      query[method] = () => query;
    query.orderBy = (...args: unknown[]) => {
      mock.orders.push(args);
      return query;
    };
    query.where = (condition: unknown) => {
      where?.(condition);
      return query;
    };
    query.then = (resolve: (value: unknown) => void) => resolve(result());
    return query;
  };
  const tx = {
    select: (fields?: unknown) => {
      mock.selects.push(fields);
      return chain(
        () => mock.rows.shift() ?? [],
        (condition) => mock.conditions.push(condition),
      );
    },
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
  mock.orders = [];
  mock.selects = [];
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
  const selected = mock.selects.find(
    (fields): fields is { articleCount: unknown; score: unknown } =>
      !!fields &&
      typeof fields === "object" &&
      "articleCount" in fields &&
      "score" in fields,
  );
  expect(selected).toBeTruthy();
  const dialect = new PgDialect({ casing: "snake_case" });
  const articleSql = dialect.sqlToQuery(selected!.articleCount as never).sql;
  expect(articleSql).toContain('"news_item"."id"');
  expect(articleSql).toContain('"news_storyline"."id"');
  const scoreSql = dialect.sqlToQuery(selected!.score as never).sql;
  expect(scoreSql).toContain('"news_storyline_vote"');
  expect(scoreSql).toContain('"news_storyline"."id"');
  const orderSql = (mock.orders.at(-1) ?? [])
    .map((part) => {
      try {
        return new PgDialect({ casing: "snake_case" }).sqlToQuery(part as never)
          .sql;
      } catch {
        return "";
      }
    })
    .join("\n");
  expect(orderSql).toContain("news_storyline_vote");
  expect(orderSql.indexOf("news_storyline_vote")).toBeLessThan(
    orderSql.indexOf("desc nulls last"),
  );
  expect(await articleStorylineLinks([])).toEqual([]);
  mock.orders = [];
  mock.rows = [[{ total: 0 }], []];
  await listStorylines({ staff: true });
  const staffOrder = (mock.orders.at(-1) ?? [])
    .map((part) => {
      try {
        return new PgDialect({ casing: "snake_case" }).sqlToQuery(part as never)
          .sql;
      } catch {
        return "";
      }
    })
    .join("\n");
  expect(staffOrder).not.toContain("news_storyline_vote");
  expect(staffOrder).toContain("desc nulls last");
});
it("names the newest stored human and visible agent on each story card", async () => {
  mock.rows = [
    [{ total: 1 }],
    [
      {
        storyline: {
          id: "s1",
          slug: "ai-agents",
          titleEn: "AI Agents",
        },
        articleCount: 6,
        latestAt: new Date("2026-10-14T00:00:00.000Z"),
        score: 1,
        myVote: 1,
      },
    ],
    [
      {
        storyId: "s1",
        createdAt: new Date("2026-10-14T00:00:00.000Z"),
        ownerId: "greg",
        displayName: "gregy",
        isPublic: true,
        hiddenFromPublic: false,
        image: "  ",
        agentName: "Nova",
        agentVisibility: "visible",
      },
      {
        storyId: "s1",
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
        ownerId: "old",
        displayName: "Older name",
        isPublic: true,
        hiddenFromPublic: false,
        image: "https://cdn.example/old.jpg",
        agentName: "Retired",
        agentVisibility: "visible",
      },
    ],
  ];
  const result = await listStorylines();
  expect(result.items[0]?.credit).toEqual({
    human: { name: "gregy", profilePath: "/members/greg", image: null },
    agentName: "Nova",
  });
  expect(result.items[0]?.myVote).toBe("up");
  expect(JSON.stringify(result.items[0]?.credit)).not.toContain("Retired");
  expect(JSON.stringify(result.items[0]?.credit)).not.toContain("Older name");
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
  expect(result?.contributor).toBeNull();
});
it("links a public contributor by the name stored on their profile", async () => {
  const story = { ...input(), id: "s1" };
  const rows = input().articles.map((membership) => ({
    membership,
    article: article(membership.articleId),
  }));
  mock.rows = [
    [story],
    rows,
    [
      {
        name: "Atlas",
        visibilityMode: "visible",
        ownerId: "member-1",
        displayName: "Ada Lovelace",
        isPublic: true,
        hiddenFromPublic: false,
      },
    ],
  ];
  const result = await findStoryline({ slug: "local-ai" });
  expect(result?.contributor).toEqual({
    name: "Ada Lovelace",
    profilePath: "/members/member-1",
  });
});
