import type { db as Database } from "@/server/db";
import type * as MatchingServices from "@/server/communities/matching";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  emptyMatchingProfile,
  type ConnectionType,
} from "@/lib/communities/matching";
const services = vi.hoisted(() => ({
  types: vi.fn(),
  propose: vi.fn(),
  participants: vi.fn(),
}));
vi.mock("@/server/api/trpc", async () => {
  const { initTRPC, TRPCError } = await import("@trpc/server");
  const t = initTRPC
    .context<{
      db: typeof Database;
      session: { user: { id: string } } | null;
      community: { id: string };
      communityRole: "owner" | "admin" | "moderator" | "member" | null;
    }>()
    .create();
  return {
    createTRPCRouter: t.router,
    communityProcedure: t.procedure.use(({ ctx, next }) => {
      if (!ctx.session) throw new TRPCError({ code: "UNAUTHORIZED" });
      return next({ ctx: { ...ctx, session: ctx.session } });
    }),
  };
});
vi.mock("@/server/communities/matching", async (original) => ({
  ...(await original<typeof MatchingServices>()),
  connectionTypes: services.types,
  matchingParticipants: services.participants,
  proposeCommunityIntroduction: services.propose,
}));
import { communityMatchingRouter } from "./community-matching";

const type: ConnectionType = {
  id: "type-a",
  active: true,
  name: "Hobbies",
  description: "",
  mode: "shared",
  promptA: "What do you enjoy?",
  promptB: "",
  topics: ["Cycling"],
};
function fakeDatabase(results: unknown[][] = []) {
  const filters: unknown[] = [];
  const writes: unknown[] = [];
  const chain = (rows: unknown[] = []) => {
    const builder = {
      from: () => builder,
      innerJoin: () => builder,
      where: (where: unknown) => {
        filters.push(where);
        return builder;
      },
      for: () => builder,
      set: (values: unknown) => {
        writes.push(values);
        return builder;
      },
      values: (values: unknown) => {
        writes.push(values);
        return builder;
      },
      onConflictDoUpdate: () => builder,
      onConflictDoNothing: () => builder,
      returning: async () => [{ id: "created-type" }],
      then: (resolve: (rows: unknown[]) => unknown) =>
        Promise.resolve(rows).then(resolve),
    };
    return builder;
  };
  const db = {
    select: vi.fn(() => chain(results.shift())),
    insert: vi.fn(() => chain()),
    update: vi.fn(() => chain()),
    delete: vi.fn(() => chain()),
    transaction: vi.fn(),
  };
  db.transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
  return { db, filters, writes };
}
function caller(
  role: "owner" | "admin" | "moderator" | "member" | null,
  db = fakeDatabase().db,
  signedIn = true,
) {
  return communityMatchingRouter.createCaller({
    db: db as never,
    session: signedIn ? { user: { id: "me" } } : null,
    community: { id: "community-a" },
    communityRole: role,
  } as never);
}
beforeEach(() => {
  vi.clearAllMocks();
  services.types.mockResolvedValue([type]);
});

describe("community matching access", () => {
  it("excludes previous and dismissed pairs and returns no private answer profiles", async () => {
    const members = ["a", "b", "c"].map((userId) => ({
      ...emptyMatchingProfile,
      optedIn: true,
      userId,
      displayName: userId,
      image: null,
      city: "Private city",
      answers: {
        "type-a": { interests: ["Cycling"], offering: [], seeking: [] },
      },
    }));
    services.participants.mockReturnValue({
      limit: vi.fn().mockResolvedValue(members),
    });
    const fake = fakeDatabase([
      [{ pairKey: "a|b" }],
      [{ pairKey: "a|c" }],
      [{ total: 3 }],
    ]);
    const result = await caller("owner", fake.db).suggestions({
      slug: "alpha",
    });
    expect(result.matches.map((match) => match.pairKey)).toEqual(["b|c"]);
    expect(result.members[0]).toEqual({
      userId: "a",
      displayName: "a",
      image: null,
    });
    expect(result).toMatchObject({ scanned: 3, total: 3, dismissedCount: 1 });
    for (const filter of fake.filters)
      expect(new PgDialect().sqlToQuery(filter as never).params).toContain(
        "community-a",
      );
  });
  it("rejects guests and inactive/banned/nonmembers", async () => {
    await expect(
      caller(null, undefined, false).setup({ slug: "alpha" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller(null).setup({ slug: "alpha" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
  it.each(["member", "moderator"] as const)(
    "blocks %s from every owner endpoint",
    async (role) => {
      const api = caller(role);
      const actions = [
        api.saveType({ slug: "alpha", type }),
        api.archiveType({ slug: "alpha", id: type.id, active: false }),
        api.suggestions({ slug: "alpha" }),
        api.participants({ slug: "alpha" }),
        api.history({ slug: "alpha" }),
        api.dismiss({ slug: "alpha", userIdA: "a", userIdB: "b" }),
        api.restoreDismissed({ slug: "alpha" }),
        api.propose({
          slug: "alpha",
          userIdA: "a",
          userIdB: "b",
          reason: "Useful",
        }),
      ];
      for (const result of await Promise.allSettled(actions))
        expect(result).toMatchObject({
          status: "rejected",
          reason: { code: "FORBIDDEN" },
        });
    },
  );
  it("returns only the caller's scoped profile and the correct management flag", async () => {
    const fake = fakeDatabase([[]]);
    expect(
      await caller("member", fake.db).setup({ slug: "alpha" }),
    ).toMatchObject({ profile: emptyMatchingProfile, canManage: false });
    const query = new PgDialect().sqlToQuery(fake.filters[0] as never);
    expect(query.params).toEqual(["community-a", "me"]);
  });
  it("saves the caller's profile with server-controlled community/user IDs", async () => {
    const fake = fakeDatabase();
    await caller("member", fake.db).saveProfile({
      slug: "alpha",
      profile: { ...emptyMatchingProfile, optedIn: true },
    });
    expect(fake.writes[0]).toMatchObject({
      communityId: "community-a",
      userId: "me",
      optedIn: true,
    });
  });
  it.each(["owner", "admin"] as const)(
    "lets %s propose with server-controlled ownership",
    async (role) => {
      services.propose.mockResolvedValue({ introId: "intro-a" });
      await caller(role).propose({
        slug: "alpha",
        userIdA: "a",
        userIdB: "b",
        reason: " Useful ",
      });
      expect(services.propose).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          communityId: "community-a",
          organizerId: "me",
          reason: "Useful",
        }),
      );
    },
  );
  it("cannot modify a connection type from another community", async () => {
    const fake = fakeDatabase();
    await expect(
      caller("owner", fake.db).saveType({
        slug: "alpha",
        type: { ...type, id: "foreign" },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(fake.db.update).not.toHaveBeenCalled();
    await expect(
      caller("owner", fake.db).archiveType({
        slug: "alpha",
        id: "foreign",
        active: false,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("does not reinterpret saved answers by changing a type mode", async () => {
    await expect(
      caller("owner").saveType({
        slug: "alpha",
        type: { ...type, mode: "complementary", promptB: "Need?" },
      }),
    ).rejects.toThrow("MATCHING_MODE_IMMUTABLE");
  });
  it("enforces the active type cap for creates and restores", async () => {
    const types = Array.from({ length: 20 }, (_, i) => ({
      ...type,
      id: `${i}`,
    }));
    services.types.mockResolvedValue([...types, { ...type, active: false }]);
    await expect(
      caller("owner").saveType({
        slug: "alpha",
        type: { ...type, id: undefined },
      }),
    ).rejects.toThrow("MATCHING_TYPE_LIMIT");
    await expect(
      caller("owner").archiveType({ slug: "alpha", id: type.id, active: true }),
    ).rejects.toThrow("MATCHING_TYPE_LIMIT");
  });
});
