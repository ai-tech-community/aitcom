import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:5432/test",
    NEXT_PUBLIC_APP_URL: "https://app.test",
  },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({}),
}));
vi.mock("@/server/agent/activity", () => ({
  logActivity: vi.fn(async () => ({ id: "activity" })),
}));

import { TRPCError } from "@trpc/server";
import { agentApiKeys, agentProfiles } from "@/server/db/schema";
import { createCaller } from "@/server/api/root";

type Row = Record<string, unknown>;

/**
 * Applies a Drizzle `where` predicate to plain rows. Enough for eq / ne /
 * and / or / gt / lt, which is the ownership filter under test.
 */
function matches(node: unknown, row: Row): boolean {
  const value = evalNode(node, row);
  return value === true;
}

function evalNode(node: unknown, row: Row): unknown {
  if (!node || typeof node !== "object") return node;
  const obj = node as {
    name?: string;
    value?: unknown;
    encoder?: unknown;
    queryChunks?: unknown[];
    constructor?: { name?: string };
  };
  if ("encoder" in obj && !obj.queryChunks) return obj.value;
  if (typeof obj.name === "string" && "table" in (obj as object)) {
    return row[obj.name];
  }
  if (!obj.queryChunks) return undefined;

  const chunks = obj.queryChunks;
  const sqlChildren = chunks.filter(
    (chunk) => !!chunk && typeof chunk === "object" && "queryChunks" in chunk,
  );
  const text = chunks
    .filter((chunk) => chunk?.constructor?.name === "StringChunk")
    .map((chunk) => ((chunk as { value?: string[] }).value ?? []).join(""))
    .join("");

  if (sqlChildren.length >= 2 && text.includes(" and ")) {
    return sqlChildren.every((child) => matches(child, row));
  }
  if (sqlChildren.length >= 2 && text.includes(" or ")) {
    return sqlChildren.some((child) => matches(child, row));
  }
  if (
    sqlChildren.length === 1 &&
    !text.includes("=") &&
    !text.includes("<>") &&
    !text.includes(">") &&
    !text.includes("<")
  ) {
    return evalNode(sqlChildren[0], row);
  }

  const column = chunks.find(
    (chunk) =>
      !!chunk &&
      typeof chunk === "object" &&
      typeof (chunk as { name?: unknown }).name === "string" &&
      "table" in chunk,
  ) as { name: string } | undefined;
  const param = chunks.find(
    (chunk) => !!chunk && typeof chunk === "object" && "encoder" in chunk,
  ) as { value?: unknown } | undefined;
  const left = column ? row[column.name] : undefined;
  const right = param?.value;
  if (text.includes("<>")) return left !== right;
  if (text.includes(">=")) return (left as number) >= (right as number);
  if (text.includes("<=")) return (left as number) <= (right as number);
  if (text.includes(">")) return (left as number) > (right as number);
  if (text.includes("<")) return (left as number) < (right as number);
  if (text.includes("=")) return left === right;
  return true;
}

function createMemoryDb() {
  const tables = new Map<unknown, Row[]>();
  const read = (table: unknown) => tables.get(table) ?? [];
  const write = (table: unknown, rows: Row[]) => tables.set(table, rows);

  function insertRow(table: unknown, values: Row): Row {
    const row: Row = { id: crypto.randomUUID(), ...values };
    if (table === agentProfiles && row.ownerId) {
      const clash = read(table).some(
        (existing) => existing.ownerId === row.ownerId,
      );
      if (clash) throw new Error("unique violation: owner_id");
    }
    write(table, [...read(table), row]);
    return row;
  }

  function applyUpdate(table: unknown, values: Row, cond: unknown): Row[] {
    const next: Row[] = [];
    const updated: Row[] = [];
    for (const row of read(table)) {
      if (!matches(cond, row)) {
        next.push(row);
        continue;
      }
      const patched = { ...row, ...values };
      if (
        table === agentProfiles &&
        patched.ownerId &&
        read(table).some(
          (existing) =>
            existing !== row && existing.ownerId === patched.ownerId,
        )
      ) {
        throw new Error("unique violation: owner_id");
      }
      next.push(patched);
      updated.push(patched);
    }
    write(table, next);
    return updated;
  }

  function chain(rows: Row[]) {
    const api = {
      from() {
        return api;
      },
      where(cond: unknown) {
        rows = rows.filter((row) => matches(cond, row));
        return api;
      },
      limit(n: number) {
        rows = rows.slice(0, n);
        return api;
      },
      orderBy() {
        return api;
      },
      then(
        onFulfilled: (value: Row[]) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) {
        return Promise.resolve(rows).then(onFulfilled, onRejected);
      },
    };
    return api;
  }

  const db = {
    select() {
      let table: unknown;
      const api = {
        from(next: unknown) {
          table = next;
          return api;
        },
        where(cond: unknown) {
          return chain(read(table).filter((row) => matches(cond, row)));
        },
        limit(n: number) {
          return chain(read(table).slice(0, n));
        },
        orderBy() {
          return api;
        },
        then(
          onFulfilled: (value: Row[]) => unknown,
          onRejected?: (reason: unknown) => unknown,
        ) {
          return Promise.resolve(read(table)).then(onFulfilled, onRejected);
        },
      };
      return api;
    },
    update(table: unknown) {
      return {
        set(values: Row) {
          return {
            where(cond: unknown) {
              let applied: Row[] | undefined;
              const run = () => {
                applied ??= applyUpdate(table, values, cond);
                return applied;
              };
              return {
                returning() {
                  return Promise.resolve(run());
                },
                then(
                  onFulfilled: (value: Row[]) => unknown,
                  onRejected?: (reason: unknown) => unknown,
                ) {
                  return Promise.resolve(run()).then(onFulfilled, onRejected);
                },
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(values: Row) {
          let stored: Row | undefined;
          const run = () => {
            stored ??= insertRow(table, values);
            return [stored];
          };
          const builder = {
            returning() {
              return Promise.resolve(run());
            },
            onConflictDoNothing() {
              return builder;
            },
            then(
              onFulfilled: (value: Row[]) => unknown,
              onRejected?: (reason: unknown) => unknown,
            ) {
              return Promise.resolve(run()).then(onFulfilled, onRejected);
            },
          };
          return builder;
        },
      };
    },
    async transaction<T>(fn: (tx: object) => Promise<T>) {
      const snapshot = new Map(
        [...tables.entries()].map(([table, rows]) => [
          table,
          rows.map((row) => ({ ...row })),
        ]),
      );
      try {
        return await fn(db);
      } catch (error) {
        tables.clear();
        for (const [table, rows] of snapshot) tables.set(table, rows);
        throw error;
      }
    },
  };

  return {
    db,
    seed(table: unknown, rows: Row[]) {
      write(
        table,
        rows.map((row) => ({ ...row })),
      );
    },
    rows(table: unknown) {
      return read(table).map((row) => ({ ...row }));
    },
  };
}

/** Reject without putting a resolved credential into the assertion diff. */
async function expectRejected(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await promise;
  } catch (error) {
    if (!(error instanceof TRPCError) || error.code !== code) {
      throw new Error(`expected ${code}`);
    }
    return;
  }
  throw new Error(`expected ${code}, but the call succeeded`);
}

function assertIssuedCredential(issued: { key: string; prefix: string }) {
  const shapeOk =
    issued.prefix.length > 0 &&
    issued.key.startsWith("ait_sk_") &&
    issued.key.startsWith(issued.prefix) &&
    issued.key.length > issued.prefix.length;
  if (!shapeOk) {
    throw new Error("issued credential did not match the expected shape");
  }
}

function caller(db: unknown, userId = "user-1") {
  return createCaller({
    db,
    session: { user: { id: userId, name: "Ada" } },
    headers: new Headers(),
  } as never);
}

describe("agent ownership after a soft delete", () => {
  let memory: ReturnType<typeof createMemoryDb>;

  beforeEach(() => {
    memory = createMemoryDb();
  });

  it("lets a user with only an inactive agent claim another", async () => {
    memory.seed(agentProfiles, [
      {
        id: "old-agent",
        ownerId: "user-1",
        name: "Retired",
        status: "inactive",
      },
      {
        id: "new-agent",
        ownerId: null,
        name: "Unclaimed",
        status: "unclaimed",
        claimToken: "token-1",
        claimTokenExpiresAt: new Date(Date.now() + 60_000),
      },
    ]);
    memory.seed(agentApiKeys, [
      {
        id: "old-key",
        agentId: "old-agent",
        ownerId: "user-1",
        isActive: true,
        keyHash: "hash-old",
        keyPrefix: "ait_sk_old",
      },
    ]);

    const result = await caller(memory.db).agentManagement.claimAgent({
      token: "token-1",
    });

    expect(result).toMatchObject({
      success: true,
      agentId: "new-agent",
      agentName: "Unclaimed",
    });
    const profiles = memory.rows(agentProfiles);
    expect(profiles.find((row) => row.id === "old-agent")).toMatchObject({
      ownerId: null,
      status: "inactive",
    });
    expect(profiles.find((row) => row.id === "new-agent")).toMatchObject({
      ownerId: "user-1",
      status: "active",
      claimToken: null,
    });
  });

  it("still refuses a claim when the user has an active agent", async () => {
    memory.seed(agentProfiles, [
      {
        id: "live-agent",
        ownerId: "user-1",
        name: "Live",
        status: "active",
      },
      {
        id: "new-agent",
        ownerId: null,
        name: "Unclaimed",
        status: "unclaimed",
        claimToken: "token-1",
        claimTokenExpiresAt: new Date(Date.now() + 60_000),
      },
    ]);

    await expect(
      caller(memory.db).agentManagement.claimAgent({ token: "token-1" }),
    ).rejects.toBeInstanceOf(TRPCError);
    await expect(
      caller(memory.db).agentManagement.claimAgent({ token: "token-1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      memory.rows(agentProfiles).find((row) => row.id === "new-agent"),
    ).toMatchObject({
      ownerId: null,
      status: "unclaimed",
    });
  });

  it("does not treat an inactive agent as already owned in the claim list", async () => {
    memory.seed(agentProfiles, [
      {
        id: "old-agent",
        ownerId: "user-1",
        name: "Retired",
        status: "inactive",
      },
    ]);

    const listed = await caller(
      memory.db,
    ).agentManagement.listUnclaimedAgents();

    expect(listed.userAlreadyOwnsAgent).toBe(false);
  });

  it("soft-deletes the owned agent, releases the owner slot, and revokes keys", async () => {
    memory.seed(agentProfiles, [
      {
        id: "live-agent",
        ownerId: "user-1",
        name: "Live",
        status: "active",
      },
    ]);
    memory.seed(agentApiKeys, [
      {
        id: "key-1",
        agentId: "different-agent",
        ownerId: "user-1",
        isActive: true,
        keyHash: "hash-1",
        keyPrefix: "ait_sk_live",
      },
    ]);

    await expect(
      caller(memory.db).agentManagement.deleteAgent(),
    ).resolves.toEqual({
      success: true,
    });

    expect(memory.rows(agentProfiles)[0]).toMatchObject({
      id: "live-agent",
      status: "inactive",
      ownerId: null,
    });
    expect(memory.rows(agentApiKeys)[0]).toMatchObject({ isActive: false });
    const mine = await caller(memory.db).agentManagement.getMyAgent();
    expect(mine).toBeNull();
  });

  it("throws NOT_FOUND when delete updates 0 rows instead of reporting success", async () => {
    memory.seed(agentProfiles, [
      {
        id: "live-agent",
        ownerId: "user-1",
        name: "Live",
        status: "active",
      },
    ]);
    const realUpdate = memory.db.update.bind(memory.db);
    memory.db.update = ((table: unknown) => {
      const builder = realUpdate(table);
      return {
        set(values: Row) {
          const setBuilder = builder.set(values);
          return {
            where(cond: unknown) {
              const whereBuilder = setBuilder.where(cond);
              return {
                returning: () => Promise.resolve([]),
                then: (
                  onFulfilled: (value: Row[]) => unknown,
                  onRejected?: (reason: unknown) => unknown,
                ) => Promise.resolve([]).then(onFulfilled, onRejected),
                // keep the original available for the follow-up read
                _inner: whereBuilder,
              };
            },
          };
        },
      };
    }) as typeof memory.db.update;

    await expectRejected(
      caller(memory.db).agentManagement.deleteAgent(),
      "NOT_FOUND",
    );
    expect(memory.rows(agentProfiles)[0]).toMatchObject({
      status: "active",
      ownerId: "user-1",
    });
  });

  it("throws FORBIDDEN when the profile id belongs to someone else", async () => {
    memory.seed(agentProfiles, [
      {
        id: "live-agent",
        ownerId: "user-1",
        name: "Live",
        status: "active",
      },
    ]);
    const realUpdate = memory.db.update.bind(memory.db);
    let profileUpdates = 0;
    memory.db.update = ((table: unknown) => {
      const builder = realUpdate(table);
      return {
        set(values: Row) {
          const setBuilder = builder.set(values);
          return {
            where(cond: unknown) {
              if (table === agentProfiles && profileUpdates === 0) {
                profileUpdates += 1;
                memory.seed(agentProfiles, [
                  {
                    id: "live-agent",
                    ownerId: "someone-else",
                    name: "Live",
                    status: "active",
                  },
                ]);
                return {
                  returning: () => Promise.resolve([]),
                  then: (
                    onFulfilled: (value: Row[]) => unknown,
                    onRejected?: (reason: unknown) => unknown,
                  ) => Promise.resolve([]).then(onFulfilled, onRejected),
                };
              }
              return setBuilder.where(cond);
            },
          };
        },
      };
    }) as typeof memory.db.update;

    await expectRejected(
      caller(memory.db).agentManagement.deleteAgent(),
      "FORBIDDEN",
    );
  });

  it("does not mint a key or report success for an inactive agent", async () => {
    memory.seed(agentProfiles, [
      {
        id: "old-agent",
        ownerId: "user-1",
        name: "Retired",
        status: "inactive",
      },
    ]);
    memory.seed(agentApiKeys, [
      {
        id: "key-old",
        agentId: "old-agent",
        ownerId: "user-1",
        isActive: true,
        keyHash: "hash-old",
        keyPrefix: "ait_sk_old",
      },
    ]);

    await expectRejected(
      caller(memory.db).agentManagement.generateKey(),
      "NOT_FOUND",
    );
    expect(memory.rows(agentApiKeys)).toHaveLength(1);
    expect(memory.rows(agentApiKeys)[0]).toMatchObject({
      id: "key-old",
      isActive: true,
      keyHash: "hash-old",
    });
  });

  it("revokes a key stored under a different agent id and does not keep it active", async () => {
    memory.seed(agentProfiles, [
      {
        id: "live-agent",
        ownerId: "user-1",
        name: "Live",
        status: "active",
      },
    ]);
    memory.seed(agentApiKeys, [
      {
        id: "key-old",
        agentId: "not-the-profile-id",
        ownerId: "user-1",
        isActive: true,
        keyHash: "hash-old",
        keyPrefix: "ait_sk_old",
      },
    ]);

    const issued = await caller(memory.db).agentManagement.generateKey();
    assertIssuedCredential(issued);
    const keys = memory.rows(agentApiKeys);
    expect(keys.find((row) => row.id === "key-old")).toMatchObject({
      isActive: false,
    });
    expect(keys.filter((row) => row.isActive)).toHaveLength(1);
    expect(keys.find((row) => row.isActive)).toMatchObject({
      agentId: "live-agent",
      ownerId: "user-1",
    });
  });

  it("throws NOT_FOUND when key revoke updates 0 rows and does not issue a replacement", async () => {
    memory.seed(agentProfiles, [
      {
        id: "live-agent",
        ownerId: "user-1",
        name: "Live",
        status: "active",
      },
    ]);
    memory.seed(agentApiKeys, [
      {
        id: "key-old",
        agentId: "live-agent",
        ownerId: "user-1",
        isActive: true,
        keyHash: "hash-old",
        keyPrefix: "ait_sk_old",
      },
    ]);
    const realUpdate = memory.db.update.bind(memory.db);
    memory.db.update = ((table: unknown) => {
      const builder = realUpdate(table);
      return {
        set(values: Row) {
          const setBuilder = builder.set(values);
          return {
            where(cond: unknown) {
              if (table === agentApiKeys) {
                return {
                  returning: () => Promise.resolve([]),
                  then: (
                    onFulfilled: (value: Row[]) => unknown,
                    onRejected?: (reason: unknown) => unknown,
                  ) => Promise.resolve([]).then(onFulfilled, onRejected),
                };
              }
              return setBuilder.where(cond);
            },
          };
        },
      };
    }) as typeof memory.db.update;

    await expectRejected(
      caller(memory.db).agentManagement.generateKey(),
      "NOT_FOUND",
    );
    expect(memory.rows(agentApiKeys)).toEqual([
      expect.objectContaining({
        id: "key-old",
        isActive: true,
        keyHash: "hash-old",
      }),
    ]);
  });
});
