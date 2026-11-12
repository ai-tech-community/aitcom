import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  emptyMatchingProfile,
  type ConnectionType,
} from "@/lib/communities/matching";
import { introductions, notifications } from "@/server/db/schema";
import {
  proposeCommunityIntroduction,
  validateMatchingAnswers,
} from "./matching";

const type: ConnectionType = {
  id: "type-a",
  active: true,
  name: "Business",
  description: "",
  mode: "complementary",
  promptA: "Offer?",
  promptB: "Need?",
  topics: ["Sales"],
};
const input = {
  communityId: "community-a",
  organizerId: "owner",
  userIdA: "b",
  userIdB: "a",
  reason: "A useful connection",
  connectionTypeId: "type-a",
};

function fakeDatabase(
  opts: {
    profiles?: unknown[];
    memberships?: unknown[];
    types?: unknown[];
    existing?: unknown[];
    conflict?: boolean;
    failNotification?: boolean;
  } = {},
) {
  const results = [
    opts.profiles ?? [{ userId: "a" }, { userId: "b" }],
    opts.memberships ?? [{ userId: "a" }, { userId: "b" }],
    opts.types ?? [type],
    opts.existing ?? [],
  ];
  const filters: unknown[] = [];
  const locks: string[] = [];
  const staged: { table: unknown; values: unknown }[] = [];
  const committed: typeof staged = [];
  const tx = {
    select: vi.fn(() => {
      const rows = results.shift() ?? [];
      const chain = {
        from: () => chain,
        where: (where: unknown) => {
          filters.push(where);
          return chain;
        },
        orderBy: () => chain,
        for: (lock: string) => {
          locks.push(lock);
          return chain;
        },
        limit: () => chain,
        then: (resolve: (v: unknown) => unknown) =>
          Promise.resolve(rows).then(resolve),
      };
      return chain;
    }),
    insert: vi.fn((table: unknown) => ({
      values: (values: unknown) => {
        if (table === notifications) {
          if (opts.failNotification)
            return Promise.reject(new Error("notification failed"));
          staged.push({ table, values });
          return Promise.resolve();
        }
        staged.push({ table, values });
        return {
          onConflictDoNothing: () => ({
            returning: async () => (opts.conflict ? [] : [{ id: "intro-a" }]),
          }),
        };
      },
    })),
  };
  const transaction = vi.fn(
    async (fn: (transaction: unknown) => Promise<unknown>) => {
      const result = await fn(tx);
      committed.push(...staged);
      return result;
    },
  );
  return {
    db: { transaction } as unknown as Parameters<
      typeof proposeCommunityIntroduction
    >[0],
    committed,
    filters,
    locks,
    transaction,
    tx,
  };
}

describe("matching answer validation", () => {
  it("allows opting out despite stale questions and removed topics", () => {
    expect(
      validateMatchingAnswers(
        {
          ...emptyMatchingProfile,
          optedIn: false,
          answers: {
            foreign: { interests: ["Old hobby"], offering: [], seeking: [] },
            "type-a": {
              interests: [],
              offering: ["Removed option"],
              seeking: [],
            },
          },
        },
        [type],
      ),
    ).toEqual({ "type-a": { interests: [], offering: [], seeking: [] } });
  });
  it("rejects foreign types and invented options", () => {
    const answer = { interests: [], offering: ["Sales"], seeking: [] };
    expect(() =>
      validateMatchingAnswers(
        {
          ...emptyMatchingProfile,
          optedIn: true,
          answers: { foreign: answer },
        },
        [type],
      ),
    ).toThrow("MATCHING_QUESTIONS_CHANGED");
    expect(() =>
      validateMatchingAnswers(
        {
          ...emptyMatchingProfile,
          optedIn: true,
          answers: { "type-a": { ...answer, offering: ["Unknown"] } },
        },
        [type],
      ),
    ).toThrow("MATCHING_QUESTIONS_CHANGED");
  });
  it("canonicalizes answers and discards archived questions", () => {
    const profile = {
      ...emptyMatchingProfile,
      answers: {
        "type-a": { interests: [], offering: [" SALES "], seeking: [] },
      },
    };
    expect(
      validateMatchingAnswers(profile, [type])["type-a"]?.offering,
    ).toEqual(["Sales"]);
    expect(
      validateMatchingAnswers(profile, [{ ...type, active: false }]),
    ).toEqual({});
  });
});

describe("owner-proposed introductions", () => {
  it("creates a canonical pair and both neutral requests in one transaction", async () => {
    const fake = fakeDatabase();
    expect(await proposeCommunityIntroduction(fake.db, input)).toEqual({
      introId: "intro-a",
    });
    expect(fake.transaction).toHaveBeenCalledTimes(1);
    expect(fake.committed[0]).toMatchObject({
      table: introductions,
      values: {
        communityId: "community-a",
        userIdA: "a",
        userIdB: "b",
        pairKey: "a|b",
        organizerId: "owner",
        reason: input.reason,
      },
    });
    expect(fake.committed[1]).toMatchObject({
      table: notifications,
      values: [
        {
          userId: "a",
          type: "introduction_request",
          communityId: "community-a",
          metadata: { introId: "intro-a" },
        },
        {
          userId: "b",
          type: "introduction_request",
          communityId: "community-a",
          metadata: { introId: "intro-a" },
        },
      ],
    });
    expect(fake.locks).toEqual(["update", "update", "share"]);
    const queries = fake.filters.map((where) =>
      new PgDialect().sqlToQuery(where as never),
    );
    expect(queries.every((query) => query.params.includes("community-a"))).toBe(
      true,
    );
  });
  it("rejects self introductions before starting a transaction", async () => {
    const fake = fakeDatabase();
    await expect(
      proposeCommunityIntroduction(fake.db, { ...input, userIdB: "b" }),
    ).rejects.toThrow("MATCHING_SELF_PAIR");
    expect(fake.transaction).not.toHaveBeenCalled();
  });
  it.each([
    { profiles: [{ userId: "a" }] },
    { memberships: [{ userId: "a" }] },
  ])(
    "rejects opt-outs or inactive/foreign memberships: %j",
    async (options) => {
      const fake = fakeDatabase(options);
      await expect(
        proposeCommunityIntroduction(fake.db, input),
      ).rejects.toThrow("MATCHING_MEMBERS_CHANGED");
      expect(fake.committed).toEqual([]);
      expect(fake.tx.insert).not.toHaveBeenCalled();
    },
  );
  it("rejects an archived or foreign connection type", async () => {
    const fake = fakeDatabase({ types: [] });
    await expect(proposeCommunityIntroduction(fake.db, input)).rejects.toThrow(
      "MATCHING_QUESTIONS_CHANGED",
    );
    expect(fake.tx.insert).not.toHaveBeenCalled();
  });
  it.each([{ existing: [{ id: "old-intro" }] }, { conflict: true }])(
    "rejects existing pairs and concurrent insert conflicts: %j",
    async (options) => {
      const fake = fakeDatabase(options);
      await expect(
        proposeCommunityIntroduction(fake.db, input),
      ).rejects.toThrow("MATCHING_INTRO_EXISTS");
      expect(fake.committed).toEqual([]);
    },
  );
  it("rolls back introduction creation when notifications fail", async () => {
    const fake = fakeDatabase({ failNotification: true });
    await expect(proposeCommunityIntroduction(fake.db, input)).rejects.toThrow(
      "MATCHING_PROPOSE_FAILED",
    );
    expect(fake.committed).toEqual([]);
  });
});
