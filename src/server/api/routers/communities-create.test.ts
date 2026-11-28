// @vitest-environment node
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import superjson from "superjson";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { communities, communityMemberships } from "@/server/db/schema";

const effects = vi.hoisted(() => ({
  seed: vi.fn(),
  writeNews: vi.fn(),
  log: vi.fn(),
  invalidate: vi.fn(),
}));

vi.mock("@/server/db", () => ({ db: {} }));
vi.mock("@/env", () => ({
  env: { NODE_ENV: "test", NEXT_PUBLIC_APP_URL: "https://app.test" },
}));
vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));
vi.mock("@/server/payload", () => ({ getPayloadClient: async () => ({}) }));
vi.mock("@/server/agent/activity", () => ({ logActivity: effects.log }));
vi.mock("@/server/communities/directory-queries", () => ({
  invalidateDirectorySnapshots: effects.invalidate,
  loadDirectorySnapshot: vi.fn(),
}));
vi.mock("@/server/communities/seed-default-spaces", () => ({
  seedDefaultSpaces: effects.seed,
}));
vi.mock("@/server/news/sectors", () => ({
  isMissingNewsSectorSchema: () => false,
  readCommunityNewsSector: vi.fn(),
  writeCommunityNewsSector: effects.writeNews,
}));

import { communitiesRouter } from "./communities";

const slugConflictMessage = "A community with a similar name already exists";
const nameConflictMessage = "A community with this name already exists";

function fixture(authenticated = true) {
  const stored = new Map<
    string,
    Pick<typeof communities.$inferInsert, "slug" | "name" | "deletedAt">
  >();
  const owners = vi.fn();
  const returning = vi.fn((values: typeof communities.$inferInsert) => {
    if (stored.has(values.slug)) return [];
    if ([...stored.values()].some((row) => row.name === values.name)) {
      throw new Error("Community insert failed", {
        cause: Object.assign(
          new Error(
            'duplicate key value violates unique constraint "community_name_unique"',
          ),
          { code: "23505", constraint: "community_name_unique" },
        ),
      });
    }
    const row = { ...values, id: "new-community" };
    stored.set(values.slug, row);
    return [row];
  });
  const raceTarget = vi.fn();
  const read = vi.fn(
    async ({ where }: { where: Parameters<PgDialect["sqlToQuery"]>[0] }) => {
      const {
        sql,
        params: [value],
      } = new PgDialect().sqlToQuery(where);
      if (sql.endsWith('"slug" = $1')) return stored.get(String(value));
      if (sql.endsWith('"name" = $1')) {
        return [...stored.values()].find((row) => row.name === value);
      }
      throw new Error(`Unexpected lookup: ${sql}`);
    },
  );
  const tx = {
    insert: (table: typeof communities | typeof communityMemberships) =>
      table === communityMemberships
        ? { values: owners }
        : {
            values: (values: typeof communities.$inferInsert) => ({
              onConflictDoNothing: (options: {
                target: typeof communities.slug;
              }) => {
                raceTarget(options);
                return { returning: async () => returning(values) };
              },
            }),
          },
  };
  const db = {
    query: { communities: { findFirst: read } },
    transaction: vi.fn(async (work: (transaction: typeof tx) => unknown) =>
      work(tx),
    ),
  };
  const context = {
    db: db as never,
    session: authenticated
      ? ({ user: { id: "owner" }, session: {} } as never)
      : null,
    headers: new Headers(),
  };
  const caller = communitiesRouter.createCaller(context);
  const createOverHttp = (input: { name: string; slug?: string }) =>
    fetchRequestHandler({
      endpoint: "/trpc",
      req: new Request("https://app.test/trpc/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(superjson.serialize(input)),
      }),
      router: communitiesRouter,
      createContext: () => context,
    });
  return {
    caller,
    createOverHttp,
    stored,
    owners,
    read,
    returning,
    raceTarget,
    db,
    tx,
  };
}

async function expectConflict(
  response: Response,
  field: "name" | "slug",
  message: string,
) {
  expect(response.status).toBe(409);
  const body = await response.json();
  expect(body).toMatchObject({
    error: {
      json: {
        message,
        data: { code: "CONFLICT", communityCreateConflictField: field },
      },
    },
  });
  expect(JSON.stringify(body)).not.toContain("community_name_unique");
}

beforeEach(() => vi.clearAllMocks());

describe("communities.isSlugAvailable", () => {
  it("requires authentication before looking up an address", async () => {
    const f = fixture(false);
    await expect(
      f.caller.isSlugAvailable({ slug: "free-address" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(f.read).not.toHaveBeenCalled();
  });

  it.each([
    { slug: "retired-space", reason: "taken" as const, matchesRow: true },
    { slug: "ait", reason: "reserved" as const, matchesRow: false },
    { slug: "Invalid address", reason: "invalid" as const, matchesRow: false },
  ])(
    "agrees with creation for a $reason slug",
    async ({ slug, reason, matchesRow }) => {
      const f = fixture();
      f.stored.set("retired-space", {
        slug: "retired-space",
        name: "A closed community",
        deletedAt: new Date(),
      });

      await expect(f.caller.isSlugAvailable({ slug })).resolves.toEqual({
        available: false,
        reason,
      });
      expect(f.read).toHaveBeenCalledTimes(matchesRow ? 1 : 0);
      if (matchesRow) {
        expect(f.read).toHaveBeenCalledWith(
          expect.objectContaining({ columns: { id: true } }),
        );
      }
      await expect(
        f.caller.create({ name: "New Community", slug }),
      ).rejects.toMatchObject({
        code: reason === "invalid" ? "BAD_REQUEST" : "CONFLICT",
      });
      expect(f.db.transaction).not.toHaveBeenCalled();
    },
  );

  it("reports a free address in one read and accepts it on create", async () => {
    const f = fixture();
    const slug = "free-address";
    await expect(f.caller.isSlugAvailable({ slug })).resolves.toEqual({
      available: true,
    });
    expect(f.read).toHaveBeenCalledOnce();
    expect(f.db.transaction).not.toHaveBeenCalled();

    await expect(
      f.caller.create({ name: "New Community", slug }),
    ).resolves.toMatchObject({ slug });
    expect(f.read.mock.calls[1]).toEqual(f.read.mock.calls[0]);
  });
});

describe("communities.create", () => {
  it("creates a chosen address independently of the name in the same transaction", async () => {
    const f = fixture();
    await expect(
      f.caller.create({
        name: "Sketch Table",
        slug: "weekend-sketches-2",
        joinPolicy: "invite_only",
        isListedInDirectory: true,
      }),
    ).resolves.toMatchObject({
      name: "Sketch Table",
      slug: "weekend-sketches-2",
      joinPolicy: "invite_only",
      isListedInDirectory: true,
      createdBy: "owner",
    });
    expect(f.stored.get("weekend-sketches-2")).toMatchObject({
      slug: "weekend-sketches-2",
    });
    expect(f.db.transaction).toHaveBeenCalledTimes(1);
    expect(f.owners).toHaveBeenCalledWith({
      communityId: "new-community",
      userId: "owner",
      role: "owner",
      status: "active",
    });
    expect(effects.seed).toHaveBeenCalledWith(f.tx, "new-community");
    expect(effects.writeNews).toHaveBeenCalledWith(f.tx, "new-community", "ai");
    expect(effects.log).toHaveBeenCalledWith(
      f.db,
      expect.objectContaining({
        metadata: { name: "Sketch Table", slug: "weekend-sketches-2" },
      }),
    );
  });

  it.each([
    "Uppercase",
    "contains space",
    "accentué",
    "two--hyphens",
    "a/b",
    "-edge",
    "",
    "a".repeat(101),
  ])(
    "rejects an invalid chosen address %j before database access",
    async (slug) => {
      const f = fixture();
      await expect(
        f.caller.create({ name: "Sketch Table", slug }),
      ).rejects.toMatchObject({ code: "BAD_REQUEST" });
      expect(f.read).not.toHaveBeenCalled();
      expect(f.db.transaction).not.toHaveBeenCalled();
    },
  );

  it("validates an address derived from a name with no URL-safe characters", async () => {
    const f = fixture();
    await expect(f.caller.create({ name: "☕☕" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
    expect(f.read).not.toHaveBeenCalled();
  });

  it("rejects the reserved Hub address even without a Hub row", async () => {
    const f = fixture();
    await expectConflict(
      await f.createOverHttp({ name: "Sketch Table", slug: "ait" }),
      "slug",
      slugConflictMessage,
    );
    expect(f.db.transaction).not.toHaveBeenCalled();
  });

  it("uses the existing uniqueness lookup for a taken address, including deleted rows", async () => {
    const f = fixture();
    f.stored.set("weekend-sketches", {
      slug: "weekend-sketches",
      name: "Another community",
      deletedAt: new Date(),
    });
    await expectConflict(
      await f.createOverHttp({
        name: "Sketch Table",
        slug: "weekend-sketches",
      }),
      "slug",
      slugConflictMessage,
    );
    expect(f.read).toHaveBeenCalledOnce();
    expect(f.db.transaction).not.toHaveBeenCalled();
  });

  it("pre-checks an exact duplicate name even when the custom address is free", async () => {
    const f = fixture();
    f.stored.set("existing-address", {
      name: "Sketch Table",
      slug: "existing-address",
    });
    await expectConflict(
      await f.createOverHttp({
        name: "Sketch Table",
        slug: "different-address",
      }),
      "name",
      nameConflictMessage,
    );
    expect(f.read).toHaveBeenCalledTimes(2);
    expect(f.db.transaction).not.toHaveBeenCalled();
  });

  it("accepts differently cased names when the addresses are distinct", async () => {
    const f = fixture();
    f.stored.set("existing-address", {
      name: "Sketch Table",
      slug: "existing-address",
    });
    await expect(
      f.caller.create({ name: "sketch table", slug: "different-address" }),
    ).resolves.toMatchObject({
      name: "sketch table",
      slug: "different-address",
    });
  });

  it("derives the address and uses the existing defaults when the slug is absent", async () => {
    const f = fixture();
    await expect(
      f.caller.create({ name: "Café & Pencils" }),
    ).resolves.toMatchObject({
      name: "Café & Pencils",
      slug: "cafe-pencils",
      joinPolicy: "open",
      isListedInDirectory: false,
    });
  });

  it("keeps unrelated database insert failures generic on the wire", async () => {
    const f = fixture();
    const rawMessage =
      'duplicate key value violates unique constraint "community_pkey"';
    f.returning.mockImplementationOnce(() => {
      throw Object.assign(new Error(rawMessage), {
        code: "23505",
        constraint: "community_pkey",
      });
    });

    const response = await f.createOverHttp({ name: "Sketch Table" });
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toMatchObject({
      error: {
        json: {
          message: "Could not create the community",
          data: {
            code: "INTERNAL_SERVER_ERROR",
            communityCreateConflictField: null,
          },
        },
      },
    });
    expect(JSON.stringify(body)).not.toContain(rawMessage);
    expect(f.owners).not.toHaveBeenCalled();
  });

  it.each([
    {
      field: "slug" as const,
      other: { name: "Second Owner", slug: "weekend-sketches" },
      message: slugConflictMessage,
    },
    {
      field: "name" as const,
      other: { name: "First Owner", slug: "alternative-address" },
      message: nameConflictMessage,
    },
  ])(
    "returns a typed $field conflict when both requests pass the pre-checks",
    async ({ field, other, message }) => {
      const f = fixture();
      let release!: () => void;
      const bothEntered = new Promise<void>((resolve) => {
        release = resolve;
      });
      f.db.transaction.mockImplementation(async (work) => {
        if (f.db.transaction.mock.calls.length === 2) release();
        await bothEntered;
        return work(f.tx);
      });
      const responses = await Promise.all([
        f.createOverHttp({ name: "First Owner", slug: "weekend-sketches" }),
        f.createOverHttp(other),
      ]);
      expect(responses.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);
      const rejected = responses.find((response) => response.status === 409)!;
      await expectConflict(rejected, field, message);
      expect(f.read).toHaveBeenCalledTimes(4);
      expect(f.raceTarget).toHaveBeenNthCalledWith(1, {
        target: communities.slug,
      });
      expect(f.raceTarget).toHaveBeenNthCalledWith(2, {
        target: communities.slug,
      });
      expect(f.returning).toHaveBeenCalledTimes(2);
      expect(f.owners).toHaveBeenCalledOnce();
      expect(effects.seed).toHaveBeenCalledOnce();
      expect(effects.log).toHaveBeenCalledOnce();
    },
  );
});
