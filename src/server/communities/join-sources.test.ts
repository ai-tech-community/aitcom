import { afterEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import type { Deps } from "@/server/magazines/deps";
import {
  JOIN_SOURCES,
  joinSourceCondition,
  joinSourceMetadata,
  verifyJoinSource,
} from "./join-sources";

const source = { via: "magazine" as const, magazineId: 1, issueId: 2 };

afterEach(() => vi.restoreAllMocks());

describe("join source strategies", () => {
  it("dispatches verification, metadata and conditions through the registry entry", async () => {
    const deps = {} as Deps;
    const metadata = { strategy: "metadata" };
    const condition = sql`strategy_condition`;
    const verify = vi
      .spyOn(JOIN_SOURCES.magazine, "verify")
      .mockResolvedValue(source);
    const write = vi
      .spyOn(JOIN_SOURCES.magazine, "metadata")
      .mockReturnValue(metadata);
    const read = vi
      .spyOn(JOIN_SOURCES.magazine, "condition")
      .mockReturnValue(condition);

    expect(await verifyJoinSource(deps, "c", source)).toBe(source);
    expect(verify).toHaveBeenCalledWith(deps, "c", source);
    expect(joinSourceMetadata(source)).toBe(metadata);
    expect(write).toHaveBeenCalledWith(source);
    expect(joinSourceCondition(source)).toBe(condition);
    expect(read).toHaveBeenCalledWith(source);
  });

  it("drops the source and logs when the verifier throws", async () => {
    vi.spyOn(JOIN_SOURCES.magazine, "verify").mockRejectedValue(
      new Error("unavailable"),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await verifyJoinSource({} as Deps, "c", source)).toBeNull();
    expect(log).toHaveBeenCalledOnce();
  });

  it("owns failures while loading the supplementary dependencies", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const deps = vi.fn(async (): Promise<Deps> => {
      throw new Error("Payload unavailable");
    });
    expect(await verifyJoinSource(deps, "c", source)).toBeNull();
    expect(log).toHaveBeenCalledOnce();
  });

  it("returns a self-contained condition with parameterized values", () => {
    const query = new PgDialect().sqlToQuery(joinSourceCondition(source));
    expect(query.sql).toMatch(/^\(.* AND .*\)$/);
    expect(query.params).toEqual(["magazine", "2"]);
  });
});
