import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { spaces } from "@/server/db/schema";

import {
  SpaceSlugTakenError,
  ensureOptionalBuiltinSpace,
  type SpaceWriter,
} from "./optional-space";

/**
 * A fake writer: each `select` resolves the next queued result; `insert`
 * records its values and conflict target and returns `inserted`.
 */
function fakeWriter(selects: unknown[][], inserted: unknown[] = [{ id: "s" }]) {
  const filters: unknown[] = [];
  const values: unknown[] = [];
  const conflictTargets: unknown[] = [];
  const selectChain = (rows: unknown[] = []) => {
    const builder = {
      from: () => builder,
      where: (where: unknown) => {
        filters.push(where);
        return builder;
      },
      orderBy: () => builder,
      limit: () => builder,
      then: (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve(rows).then(resolve),
    };
    return builder;
  };
  const insertChain = {
    values: (row: unknown) => {
      values.push(row);
      return insertChain;
    },
    onConflictDoNothing: (config: { target: unknown }) => {
      conflictTargets.push(config.target);
      return insertChain;
    },
    returning: async () => inserted,
  };
  const writer = {
    select: vi.fn(() => selectChain(selects.shift())),
    insert: vi.fn(() => insertChain),
  };
  return {
    db: writer as unknown as SpaceWriter,
    writer,
    filters,
    values,
    conflictTargets,
  };
}

describe("ensureOptionalBuiltinSpace", () => {
  it("appends the surface after the last space", async () => {
    const fake = fakeWriter([[], [{ position: 4 }]]);

    await expect(
      ensureOptionalBuiltinSpace(fake.db, "comm-1", "matching", "match"),
    ).resolves.toEqual({ added: true });

    expect(fake.values).toEqual([
      {
        communityId: "comm-1",
        kind: "builtin",
        builtinSurface: "matching",
        name: null,
        slug: "match",
        position: 5,
      },
    ]);
    expect(fake.conflictTargets).toEqual([[spaces.communityId, spaces.slug]]);
  });

  it("looks the slug up within the community", async () => {
    const fake = fakeWriter([[], []]);

    await ensureOptionalBuiltinSpace(fake.db, "comm-1", "matching", "match");

    const params = new PgDialect().sqlToQuery(fake.filters[0] as never).params;
    expect(params).toEqual(expect.arrayContaining(["comm-1", "match"]));
  });

  it("returns added:false and inserts nothing when the surface row exists", async () => {
    const fake = fakeWriter([
      [{ kind: "builtin", builtinSurface: "matching" }],
    ]);

    await expect(
      ensureOptionalBuiltinSpace(fake.db, "comm-1", "matching", "match"),
    ).resolves.toEqual({ added: false });

    expect(fake.writer.insert).not.toHaveBeenCalled();
  });

  it("throws SpaceSlugTakenError when a room owns the slug", async () => {
    const fake = fakeWriter([[{ kind: "room", builtinSurface: null }]]);

    const refusal = await ensureOptionalBuiltinSpace(
      fake.db,
      "comm-1",
      "matching",
      "match",
    ).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(SpaceSlugTakenError);
    expect((refusal as SpaceSlugTakenError).slug).toBe("match");
    expect(fake.writer.insert).not.toHaveBeenCalled();
  });

  it("throws SpaceSlugTakenError when another builtin owns the slug", async () => {
    const fake = fakeWriter([
      [{ kind: "builtin", builtinSurface: "magazine" }],
    ]);

    await expect(
      ensureOptionalBuiltinSpace(fake.db, "comm-1", "matching", "match"),
    ).rejects.toBeInstanceOf(SpaceSlugTakenError);
  });

  it("puts the first space at position 0", async () => {
    const fake = fakeWriter([[], []]);

    await expect(
      ensureOptionalBuiltinSpace(fake.db, "comm-1", "magazine", "magazine"),
    ).resolves.toEqual({ added: true });

    expect(fake.values).toEqual([
      expect.objectContaining({ builtinSurface: "magazine", position: 0 }),
    ]);
  });

  it("throws SpaceSlugTakenError when a room took the slug during the insert", async () => {
    const fake = fakeWriter(
      [[], [{ position: 2 }], [{ kind: "room", builtinSurface: null }]],
      [],
    );

    const refusal = await ensureOptionalBuiltinSpace(
      fake.db,
      "comm-1",
      "matching",
      "match",
    ).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(SpaceSlugTakenError);
    expect((refusal as SpaceSlugTakenError).slug).toBe("match");
  });

  it("returns added:false when the same surface was added during the insert", async () => {
    const fake = fakeWriter(
      [
        [],
        [{ position: 2 }],
        [{ kind: "builtin", builtinSurface: "matching" }],
      ],
      [],
    );

    await expect(
      ensureOptionalBuiltinSpace(fake.db, "comm-1", "matching", "match"),
    ).resolves.toEqual({ added: false });
  });
});
