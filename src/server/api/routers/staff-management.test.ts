import { describe, it, expect, vi, beforeEach } from "vitest";

type SelectResult = unknown[];
const dbHooks = {
  // FIFO queue of results for successive db.select(...) chains in one call.
  selectResults: [] as SelectResult[],
  insertValues: undefined as unknown,
  insertConflict: false,
  conflictDoNothing: false,
  updateRan: false,
};

function makeSelectChain() {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "innerJoin", "leftJoin", "orderBy", "groupBy"])
    chain[m] = () => chain;
  chain.limit = () => chain;
  chain.then = (resolve: (v: SelectResult) => unknown) =>
    Promise.resolve(dbHooks.selectResults.shift() ?? []).then(resolve);
  return chain;
}

function makeInsertChain() {
  const chain: Record<string, unknown> = {};
  chain.values = (v: unknown) => {
    dbHooks.insertValues = v;
    return chain;
  };
  chain.onConflictDoUpdate = () => {
    dbHooks.insertConflict = true;
    return Promise.resolve();
  };
  chain.onConflictDoNothing = () => {
    dbHooks.conflictDoNothing = true;
    return Promise.resolve();
  };
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(undefined).then(resolve);
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain.set = () => chain;
  chain.where = () => {
    dbHooks.updateRan = true;
    return Promise.resolve();
  };
  return chain;
}

vi.mock("@/server/db", () => ({
  db: {
    select: () => makeSelectChain(),
    insert: () => makeInsertChain(),
    update: () => makeUpdateChain(),
    query: {
      communityMemberships: { findFirst: async () => undefined },
      communities: { findFirst: async () => undefined },
    },
  },
}));

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

// requireHackathonOperator / requireHackathonOrganizer call loadChallenge, which
// reads Payload. Return a controllable challenge doc.
const payloadHooks = {
  challenge: {
    id: 1,
    communityId: null as string | null,
    title: "Hack",
    creatorId: "user-1",
  },
};
vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({
    findByID: async () => payloadHooks.challenge,
    find: async () => ({ docs: [] }),
  }),
}));

// Email send is a no-op in these tests.
const emailHooks = { sent: [] as unknown[] };
vi.mock("@/server/email", () => ({
  sendHackathonStaffInvite: async (...args: unknown[]) => {
    emailHooks.sent.push(args);
  },
}));

import { createCaller } from "@/server/api/root";
import { db as mockedDb } from "@/server/db";

function caller(userId = "user-1") {
  return createCaller({
    db: mockedDb,
    session: { user: { id: userId } } as never,
    headers: new Headers(),
  });
}

beforeEach(() => {
  dbHooks.selectResults = [];
  dbHooks.insertValues = undefined;
  dbHooks.insertConflict = false;
  dbHooks.conflictDoNothing = false;
  dbHooks.updateRan = false;
  emailHooks.sent = [];
  payloadHooks.challenge = {
    id: 1,
    communityId: null,
    title: "Hack",
    creatorId: "user-1",
  };
});

describe("listStaff", () => {
  it("returns active organizers/judges enriched with name/email/image, plus pending invites", async () => {
    // requireHackathonOrganizer for a hub-wide hackathon where the actor is the
    // creator (creatorId === "user-1") passes via the isHubSponsor path. But the
    // real gate ALWAYS calls loadHackathonGrants (a db.select) before reaching
    // that check, so it consumes ONE select result first. Order:
    //   (0) gate's loadHackathonGrants  -> empty (sponsor path doesn't need grants)
    //   (1) active staff rows
    //   (2) pending invites
    dbHooks.selectResults = [
      [],
      [
        {
          id: "s1",
          userId: "u-org",
          role: "organizer",
          revokedAt: null,
          grantedAt: new Date("2026-06-10T00:00:00Z"),
          displayName: "Olivia Org",
          email: "olivia@example.com",
          image: "https://img/olivia.png",
        },
        {
          id: "s2",
          userId: "u-judge",
          role: "judge",
          revokedAt: null,
          grantedAt: new Date("2026-06-11T00:00:00Z"),
          displayName: "Judy Judge",
          email: "judy@example.com",
          image: null,
        },
      ],
      [
        {
          id: "inv1",
          email: "external@example.com",
          role: "judge",
          invitedBy: "user-1",
          createdAt: new Date("2026-06-12T00:00:00Z"),
        },
      ],
    ];

    const res = await caller().hackathon.listStaff({ challengeId: 1 });

    expect(res.organizers).toEqual([
      expect.objectContaining({
        userId: "u-org",
        displayName: "Olivia Org",
        email: "olivia@example.com",
        image: "https://img/olivia.png",
      }),
    ]);
    expect(res.judges).toHaveLength(1);
    expect(res.judges[0]).toEqual(
      expect.objectContaining({ userId: "u-judge", displayName: "Judy Judge" }),
    );
    expect(res.pendingInvites).toEqual([
      expect.objectContaining({ email: "external@example.com", role: "judge" }),
    ]);
  });
});

describe("listStaffCandidates", () => {
  it("community hackathon: returns members excluding existing staff", async () => {
    payloadHooks.challenge = {
      id: 1,
      communityId: "comm-1",
      title: "Hack",
      creatorId: "user-1",
    };
    // Gate (requireHackathonOrganizer, role "judge") for a community hackathon:
    //   loadMembershipForChallenge -> db.query.communityMemberships.findFirst
    //     (mocked to undefined; consumes NO selectResults entry), so the caller
    //     must qualify via an active organizer GRANT instead.
    //   loadHackathonGrants            -> selectResults[0]
    //   candidate select (members)     -> selectResults[1]
    dbHooks.selectResults = [
      [{ role: "organizer", revokedAt: null }], // loadHackathonGrants -> organizer capability
      // candidate rows (already-staff filtered out in SQL via NOT EXISTS):
      [
        {
          userId: "m1",
          displayName: "Mara Member",
          email: "mara@example.com",
          image: null,
          joinedAt: new Date("2026-06-01T00:00:00Z"),
        },
      ],
    ];

    const res = await caller().hackathon.listStaffCandidates({
      challengeId: 1,
      role: "judge",
    });

    expect(res.items).toEqual([
      expect.objectContaining({ userId: "m1", displayName: "Mara Member" }),
    ]);
    expect(res.nextCursor).toBeUndefined();
  });
});

describe("inviteStaffByEmail", () => {
  it("new email (hub-wide): inserts a pending invite and sends the email", async () => {
    payloadHooks.challenge = {
      id: 1,
      communityId: null,
      title: "Hack",
      creatorId: "user-1",
    };
    // gate grants[0]; user-lookup[1] (none); dup-invite check[2] (none).
    dbHooks.selectResults = [[], [], []];

    const res = await caller().hackathon.inviteStaffByEmail({
      challengeId: 1,
      email: "New.Judge@Example.com",
      role: "judge",
    });

    expect(res.kind).toBe("invited");
    expect(dbHooks.insertValues).toEqual(
      expect.objectContaining({
        challengeId: 1,
        email: "new.judge@example.com", // normalized
        role: "judge",
        challengeTitle: "Hack",
        communityId: null,
      }),
    );
    expect(emailHooks.sent).toHaveLength(1);
  });

  it("existing email: grants immediately, no email", async () => {
    payloadHooks.challenge = {
      id: 1,
      communityId: null,
      title: "Hack",
      creatorId: "user-1",
    };
    // Gate consumes [0] (grants). User-by-email lookup [1] → found.
    dbHooks.selectResults = [[], [{ id: "existing-1" }]];

    const res = await caller().hackathon.inviteStaffByEmail({
      challengeId: 1,
      email: "known@example.com",
      role: "judge",
    });

    expect(res.kind).toBe("granted");
    expect(emailHooks.sent).toHaveLength(0);
    expect(dbHooks.insertConflict).toBe(true); // grantStaffInternal upsert ran
  });

  it("rejects a non-operator inviting an organizer", async () => {
    payloadHooks.challenge = {
      id: 1,
      communityId: null,
      title: "Hack",
      creatorId: "someone-else",
    };
    // role organizer → requireHackathonOperator; hub-wide + actor !== creator → FORBIDDEN, no select consumed.
    await expect(
      caller("user-1").hackathon.inviteStaffByEmail({
        challengeId: 1,
        email: "x@example.com",
        role: "organizer",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("existing email (community, already a member): grants without minting membership", async () => {
    payloadHooks.challenge = {
      id: 1,
      communityId: "comm-1",
      title: "Hack",
      creatorId: "user-1",
    };
    // gate grants[0] (organizer) → passes judge gate; user-lookup[1] found;
    // membership-existence check[2] → already an active member.
    dbHooks.selectResults = [
      [{ role: "organizer", revokedAt: null }],
      [{ id: "existing-1" }],
      [{ id: "mem-1" }],
    ];

    const res = await caller().hackathon.inviteStaffByEmail({
      challengeId: 1,
      email: "member@example.com",
      role: "judge",
    });

    expect(res.kind).toBe("granted");
    expect(dbHooks.conflictDoNothing).toBe(false); // no membership minted
    expect(dbHooks.insertConflict).toBe(true); // staff grant ran
    expect(emailHooks.sent).toHaveLength(0);
  });

  it("existing email (community, not a member): an organizer cannot mint membership", async () => {
    payloadHooks.challenge = {
      id: 1,
      communityId: "comm-1",
      title: "Hack",
      creatorId: "user-1",
    };
    // gate grants[0] (organizer) → passes judge gate; user-lookup[1] found;
    // membership-existence check[2] → NOT a member → requireHackathonOperator →
    // assertActiveCommunityAdmin (findFirst → undefined) → FORBIDDEN.
    dbHooks.selectResults = [
      [{ role: "organizer", revokedAt: null }],
      [{ id: "existing-1" }],
      [],
    ];

    await expect(
      caller().hackathon.inviteStaffByEmail({
        challengeId: 1,
        email: "outsider@example.com",
        role: "judge",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects a duplicate pending invite with CONFLICT", async () => {
    payloadHooks.challenge = {
      id: 1,
      communityId: null,
      title: "Hack",
      creatorId: "user-1",
    };
    // gate grants[0]; user-lookup[1] none; dup-check[2] → an existing live invite.
    dbHooks.selectResults = [[], [], [{ id: "inv-dup" }]];

    await expect(
      caller().hackathon.inviteStaffByEmail({
        challengeId: 1,
        email: "dup@example.com",
        role: "judge",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("revokeStaffInvite", () => {
  it("cancels a pending invite after authorizing for its role", async () => {
    payloadHooks.challenge = {
      id: 1,
      communityId: null,
      title: "Hack",
      creatorId: "user-1",
    };
    // 1) load invite by id → a judge invite for challenge 1 (selectResults[0]).
    //    Then the gate for role "judge" (requireHackathonOrganizer) consumes
    //    selectResults[1] (grants). Hub-wide creator=actor → passes.
    dbHooks.selectResults = [
      [{ id: "inv1", challengeId: 1, role: "judge", revokedAt: null }],
      [],
    ];

    const res = await caller().hackathon.revokeStaffInvite({ inviteId: "inv1" });

    expect(res.ok).toBe(true);
    expect(dbHooks.updateRan).toBe(true);
  });
});
