import { beforeEach, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import { newsStorylineVotes } from "@/server/db/schema";

const mock = vi.hoisted(() => ({
  rows: [] as unknown[][],
  writes: [] as Array<{ action: string; table: unknown; value: unknown }>,
  conflicts: [] as unknown[],
  conditions: [] as unknown[],
}));

vi.mock("@/server/db", () => {
  const chain = (result: () => unknown) => {
    const query: Record<string, unknown> = {};
    for (const method of ["from", "limit"]) query[method] = () => query;
    query.where = (condition: unknown) => {
      mock.conditions.push(condition);
      return query;
    };
    query.onConflictDoUpdate = (config: unknown) => {
      mock.conflicts.push(config);
      return query;
    };
    query.then = (resolve: (value: unknown) => void) => resolve(result());
    return query;
  };
  const tx = {
    select: () => chain(() => mock.rows.shift() ?? []),
    insert: (table: unknown) => ({
      values: (value: unknown) =>
        chain(() => {
          mock.writes.push({ action: "insert", table, value });
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
      transaction: async (fn: (client: never) => Promise<unknown>) =>
        fn(tx as never),
    },
  };
});

import { castStorylineVote, StorylineVoteError } from "./storyline-votes";

const dialect = new PgDialect({ casing: "snake_case" });

beforeEach(() => {
  mock.rows = [];
  mock.writes = [];
  mock.conflicts = [];
  mock.conditions = [];
});

it("upserts one up or down vote for a published story and can clear it", async () => {
  mock.rows = [[{ id: "story" }], [{ score: 1, mine: 1 }]];
  await expect(
    castStorylineVote({ storyId: "story", userId: "member", vote: "up" }),
  ).resolves.toEqual({ score: 1, myVote: "up" });
  expect(mock.writes).toEqual([
    {
      action: "insert",
      table: newsStorylineVotes,
      value: { storyId: "story", userId: "member", value: 1 },
    },
  ]);
  expect(mock.conflicts).toHaveLength(1);
  const published = dialect.sqlToQuery(mock.conditions[0] as never);
  expect(published.sql).toContain(`"status"`);
  expect(published.params).toContain("published");

  mock.rows = [[{ id: "story" }], [{ score: -1, mine: -1 }]];
  mock.writes = [];
  await castStorylineVote({
    storyId: "story",
    userId: "member",
    vote: "down",
  });
  expect(mock.writes[0]?.value).toMatchObject({ value: -1 });

  mock.rows = [[{ id: "story" }], [{ score: 0, mine: null }]];
  mock.writes = [];
  mock.conditions = [];
  await expect(
    castStorylineVote({ storyId: "story", userId: "member", vote: "clear" }),
  ).resolves.toEqual({ score: 0, myVote: null });
  expect(mock.writes).toEqual([
    { action: "delete", table: newsStorylineVotes, value: null },
  ]);
  const cleared = dialect.sqlToQuery(mock.conditions.at(-2) as never).sql;
  expect(cleared).toContain("story_id");
  expect(cleared).toContain("user_id");
});

it("refuses a vote on a story that is not published and writes nothing", async () => {
  mock.rows = [[]];
  await expect(
    castStorylineVote({ storyId: "draft", userId: "member", vote: "up" }),
  ).rejects.toBeInstanceOf(StorylineVoteError);
  expect(mock.writes).toEqual([]);
  expect(mock.conflicts).toEqual([]);
});
