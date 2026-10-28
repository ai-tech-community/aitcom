import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { up } from "./20261028e_french_locale";

describe("French locale migration", () => {
  it("supports production and generated enum names without rewriting content", async () => {
    const queries: string[] = [];
    const db = {
      execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        queries.push(new PgDialect().sqlToQuery(query).sql);
      },
    };
    await up({ db } as never);
    const sql = queries.join("\n");
    expect(sql).toContain("'_locales', 'enum__locales'");
    expect(sql).toContain("t.typtype = 'e'");
    expect(sql).toContain("ADD VALUE IF NOT EXISTS");
    expect(sql).toContain("CHECK (\"locale\" IN ('en', 'nl', 'fr'))");
    expect(sql).not.toMatch(/\bINSERT\b|\bUPDATE\b|\bDELETE\s+FROM\b/i);
  });
});
