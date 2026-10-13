import { expect, it } from "vitest";
import { PgDialect, getTableConfig } from "drizzle-orm/pg-core";
import {
  newsStorylineConnections,
  newsStorylineArticles,
} from "@/server/db/schema";
import { up, down } from "./20261013f_news_storylines";

it("requires connection evidence to belong to the claimed story and cascades deleted evidence", () => {
  const config = getTableConfig(newsStorylineConnections);
  expect(config.foreignKeys).toHaveLength(2);
  for (const key of config.foreignKeys) {
    expect(key.reference().foreignTable).toBe(newsStorylineArticles);
    expect(key.reference().columns).toHaveLength(2);
    expect(key.onDelete).toBe("cascade");
  }
});
it("prepares DDL with both membership foreign keys and drops dependents first", async () => {
  const queries: string[] = [];
  const db = {
    execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      queries.push(new PgDialect().sqlToQuery(query).sql);
    },
  };
  await up({ db } as never);
  expect(queries[0]).toContain("FOREIGN KEY (source_id, from_article_id)");
  expect(queries[0]).toContain("FOREIGN KEY (target_id, to_article_id)");
  expect(queries[0]).not.toMatch(/INSERT INTO|UPDATE app/);
  await down({ db } as never);
  expect(queries[1]!.indexOf("news_storyline_connection")).toBeLessThan(
    queries[1]!.indexOf("news_storyline_article"),
  );
});
