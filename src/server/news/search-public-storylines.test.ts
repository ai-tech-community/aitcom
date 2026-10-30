import { drizzle, type RemoteCallback } from "drizzle-orm/pg-proxy";
import { describe, expect, it, vi } from "vitest";

import type { db } from "@/server/db";
import { searchPublicStorylines } from "./storylines";

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("./cache", () => ({ revalidateNewsTable: vi.fn() }));

describe("public storyline picker search", () => {
  it("uses the injected database once, excludes held ids and applies public and title/overview rules before the limit", async () => {
    const execute = vi.fn<RemoteCallback>(async () => ({ rows: [] }));
    const client = drizzle(execute, {
      casing: "snake_case",
    }) as unknown as typeof db;
    expect(
      await searchPublicStorylines("50%_\\news", 12, client, ["held"]),
    ).toEqual([]);
    expect(execute).toHaveBeenCalledTimes(1);
    const [sql, params] = execute.mock.calls[0]!;
    expect(sql).toContain('"app"."news_storyline"');
    expect(sql).toContain('"status" =');
    expect(sql).toContain(">= 2");
    expect(sql).toContain('"id" not in');
    expect(sql).toContain('"title_en" ilike');
    expect(sql).toContain('"title_nl" ilike');
    expect(sql).toContain('"overview_en" ilike');
    expect(sql).toContain('"overview_nl" ilike');
    expect(sql).not.toContain("offset");
    expect(params).toContain("published");
    expect(params).toContain("%50\\%\\_\\\\news%");
    expect(params?.slice(-2)).toEqual(["held", 12]);
  });
});
