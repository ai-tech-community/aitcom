import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const state = vi.hoisted(() => ({
  rows: [] as unknown[][],
  joins: [] as unknown[],
  conditions: [] as unknown[],
  saved: vi.fn(async () => ({ id: "story-1" })),
  credit: vi.fn(async () => "credited" as const),
}));

vi.mock("@/server/db", () => {
  const chain = (result: () => unknown) => {
    const query: Record<string, unknown> = {};
    for (const method of ["from", "limit"]) query[method] = () => query;
    query.innerJoin = (_table: unknown, condition: unknown) => {
      state.joins.push(condition);
      return query;
    };
    query.where = (condition: unknown) => {
      state.conditions.push(condition);
      return query;
    };
    query.then = (resolve: (value: unknown) => void) => resolve(result());
    return query;
  };
  return {
    db: {
      select: () => chain(() => state.rows.shift() ?? []),
    },
  };
});
vi.mock("./storylines", () => ({
  saveStoryline: state.saved,
  StorylineError: class StorylineError extends Error {
    constructor(
      public readonly code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));
vi.mock("./contributions", () => ({
  recordPublishedStoryCredit: state.credit,
}));

import { StorylineError } from "./storylines";
import { publishApprovedEditorialDrafts } from "./publish-approved-storylines";

const DRAFT = "f79b8204-0a7a-485a-82c9-a2a072034eab";
const dialect = new PgDialect({ casing: "snake_case" });

const story = {
  id: "story-1",
  slug: "local-ai",
  titleEn: "Local AI",
  titleNl: "",
  overviewEn: "Local processing",
  overviewNl: "",
  questionsEn: ["What remains local?"],
  questionsNl: [],
  revision: 2,
  updatedBy: "editor",
  createdBy: "editor",
  draftId: DRAFT,
  reviewedBy: "editor",
};
const article = {
  articleId: "a",
  noteEn: "A practical development",
  noteNl: "",
  evidence: "Local processing keeps documents on the device.",
};

beforeEach(() => {
  state.rows = [];
  state.joins = [];
  state.conditions = [];
  state.saved.mockReset();
  state.saved.mockResolvedValue({ id: "story-1" });
  state.credit.mockReset();
  state.credit.mockResolvedValue("credited");
});

it("publishes an already approved editorial draft without inventing copy, and skips it once published", async () => {
  state.rows = [
    [story, { ...story, draftId: "second-draft" }],
    [article, { ...article, articleId: "b" }],
    [],
  ];
  const first = await publishApprovedEditorialDrafts();
  expect(first.published).toEqual([
    { draftId: DRAFT, id: "story-1", slug: "local-ai" },
  ]);
  expect(state.saved).toHaveBeenCalledTimes(1);
  expect(state.saved).toHaveBeenCalledWith(
    expect.objectContaining({
      id: "story-1",
      slug: "local-ai",
      titleEn: "Local AI",
      overviewEn: "Local processing",
      status: "published",
      revision: 2,
      articles: [article, { ...article, articleId: "b" }],
      connections: [],
    }),
    "editor",
  );
  expect(state.credit).toHaveBeenCalledWith("story-1");
  const join = dialect.sqlToQuery(state.joins[0] as never);
  expect(join.params).toContain("approved");
  expect(join.sql).toContain("savedStorylineId");
  expect(dialect.sqlToQuery(state.conditions[0] as never).params).toContain(
    "draft",
  );

  state.rows = [[]];
  state.saved.mockClear();
  const second = await publishApprovedEditorialDrafts();
  expect(second).toMatchObject({ scanned: 0, published: [], skipped: [] });
  expect(state.saved).not.toHaveBeenCalled();
});

it("leaves a draft in place when it cannot be published and continues the batch", async () => {
  state.rows = [
    [
      {
        ...story,
        id: "bad",
        slug: "bad",
        draftId: "draft-bad",
        updatedBy: null,
        createdBy: null,
        reviewedBy: null,
      },
      story,
    ],
    [article],
    [],
  ];
  const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
  state.credit.mockRejectedValueOnce(new Error("credit down"));
  const result = await publishApprovedEditorialDrafts();
  expect(result.skipped).toEqual([
    {
      draftId: "draft-bad",
      id: "bad",
      slug: "bad",
      reason: "noEditor",
    },
  ]);
  expect(result.published).toEqual([
    { draftId: DRAFT, id: "story-1", slug: "local-ai" },
  ]);
  expect(log).toHaveBeenCalled();
  log.mockRestore();

  state.rows = [[story], [article], []];
  state.saved.mockRejectedValueOnce(
    new StorylineError("invalid", "publish:evidence"),
  );
  const skipped = await publishApprovedEditorialDrafts();
  expect(skipped.published).toEqual([]);
  expect(skipped.skipped).toEqual([
    {
      draftId: DRAFT,
      id: "story-1",
      slug: "local-ai",
      reason: "publish:evidence",
    },
  ]);
});
