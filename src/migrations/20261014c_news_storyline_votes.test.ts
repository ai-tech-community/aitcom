import { expect, it } from "vitest";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import { newsStorylineVotes, newsStorylines, user } from "@/server/db/schema";
import { up, down } from "./20261014c_news_storyline_votes";

it("keeps one vote per member per story and removes it with either side", () => {
  const config = getTableConfig(newsStorylineVotes);
  const columns = (name: string) =>
    config.foreignKeys.find((key) =>
      key.reference().columns.some((column) => column.name === name),
    );
  expect(columns("storyId")?.reference().foreignTable).toBe(newsStorylines);
  expect(columns("storyId")?.onDelete).toBe("cascade");
  expect(columns("userId")?.reference().foreignTable).toBe(user);
  expect(columns("userId")?.onDelete).toBe("cascade");
  expect(config.primaryKeys[0]?.columns.map((column) => column.name)).toEqual([
    "storyId",
    "userId",
  ]);
  expect(
    config.uniqueConstraints.some(
      (constraint) => constraint.name === "news_storyline_vote_story_user_key",
    ),
  ).toBe(true);
  expect(config.checks.map((check) => check.name)).toContain(
    "news_storyline_vote_value_check",
  );
});

it("prepares DDL only and drops the table on the way down", async () => {
  const queries: string[] = [];
  const db = {
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      queries.push(new PgDialect().sqlToQuery(query).sql);
    },
  };
  await up({ db } as never);
  expect(queries[0]).toContain(
    "CREATE TABLE IF NOT EXISTS app.news_storyline_vote",
  );
  expect(queries[0]).toContain("UNIQUE (story_id, user_id)");
  expect(queries[0]).toContain("PRIMARY KEY (story_id, user_id)");
  expect(queries[0]).toContain("CHECK (value IN (-1, 1))");
  expect(queries[0]).not.toMatch(/INSERT INTO|UPDATE app/);
  await down({ db } as never);
  expect(queries[1]).toContain("DROP TABLE IF EXISTS app.news_storyline_vote");
});
