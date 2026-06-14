/**
 * Deadline ENFORCEMENT WIRING coverage for the four gated tRPC mutations
 * (Plan: hackathon timeline deadlines). The pure gate functions in
 * src/server/hackathon/deadlines.ts are unit-tested elsewhere; this suite proves
 * the *wiring* around them — that each mutation fetches its bound event, calls
 * the REAL gate with `new Date()`, and throws TRPCError(FORBIDDEN) with the
 * DEADLINE_MESSAGES prose + `cause.deadlineReason` when the relevant deadline is
 * in the PAST, while an UNSET deadline lets the mutation proceed PAST the gate
 * (non-breaking).
 *
 * ── No database, no Payload, no live network ────────────────────────────────
 * We mock ONLY the I/O boundaries so importing the real tRPC router graph never
 * opens a connection:
 *   - `@/server/db`              → a fake drizzle `db` (module-load Pool avoided)
 *   - `@/env`                    → static values (skip t3-env server-var guard)
 *   - `@/server/better-auth`     → stub (trpc.ts imports it at module load)
 *   - `@/server/payload`         → `getPayloadClient()` returns a controllable
 *                                  fake whose find/findByID yields the event doc
 *                                  with the deadline set in the past or unset.
 *
 * The deadline gate module (`@/server/hackathon/deadlines`) is DELIBERATELY NOT
 * mocked — `isRegistrationOpen` / `isSubmissionOpen` / `isJudgingOpen`,
 * `DEADLINE_MESSAGES`, and `boundHackathonEvent`'s real fetch-then-check path all
 * run for real. The fake `ctx.db` is wired so that once a mutation passes the
 * gate it reaches a recognisable later step (a sentinel throw), which is how the
 * "unset ⇒ proceeds past the gate" assertions are made without a DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock the I/O boundaries BEFORE importing the router graph ───────────────

// A fake drizzle db. Per-test, individual specs override the chainable
// select/query/transaction behaviour. By default everything routes through
// mutable hooks so each test controls exactly what the pre-gate DB reads return
// and what the post-gate steps do.
type SelectResult = unknown[];
const dbHooks = {
  // db.select(...).from(...).where(...)[.limit(n)] → awaited array
  selectResult: (() => [] as SelectResult) as () => SelectResult,
  // db.query.challengeEnrollments.findFirst(...)
  enrollmentFindFirst: (async () => undefined) as () => Promise<unknown>,
  // db.transaction(cb)
  transaction: (async () => {
    throw new Error("TRANSACTION_NOT_STUBBED");
  }) as (cb: unknown) => Promise<unknown>,
};

function makeSelectChain() {
  // Thenable chain: every builder method returns `this`, and awaiting it
  // resolves to dbHooks.selectResult().
  const chain: Record<string, unknown> = {};
  const methods = [
    "from",
    "where",
    "limit",
    "innerJoin",
    "leftJoin",
    "orderBy",
    "groupBy",
  ];
  for (const m of methods) chain[m] = () => chain;
  chain.then = (resolve: (v: SelectResult) => unknown) =>
    Promise.resolve(dbHooks.selectResult()).then(resolve);
  return chain;
}

vi.mock("@/server/db", () => {
  const db = {
    select: () => makeSelectChain(),
    query: {
      challengeEnrollments: {
        findFirst: (...args: unknown[]) => dbHooks.enrollmentFindFirst(),
      },
      communityMemberships: { findFirst: async () => undefined },
      communities: { findFirst: async () => undefined },
    },
    transaction: (cb: unknown) => dbHooks.transaction(cb),
  };
  return { db };
});

vi.mock("@/env", () => ({
  env: {
    NODE_ENV: "test",
    DATABASE_URL: "postgres://localhost:5432/test",
    NEON_LOCAL_PROXY: undefined,
  },
}));

vi.mock("@/server/better-auth", () => ({
  auth: { api: { getSession: async () => null } },
}));

// The controllable fake Payload client. Each test sets findByIdImpl / findImpl.
const payloadHooks = {
  findByID: (async () => {
    throw new Error("findByID not stubbed");
  }) as (args: { collection: string; id: unknown }) => Promise<unknown>,
  find: (async () => ({ docs: [] })) as (args: {
    collection: string;
  }) => Promise<{ docs: unknown[] }>,
};

vi.mock("@/server/payload", () => ({
  getPayloadClient: async () => ({
    findByID: (args: { collection: string; id: unknown }) =>
      payloadHooks.findByID(args),
    find: (args: { collection: string }) => payloadHooks.find(args),
  }),
}));

// Now the real router graph (real gate, real wiring) can be imported.
import { createCaller } from "@/server/api/root";

// A sentinel used to prove a mutation got PAST the deadline gate: the next DB
// step throws it, so reaching it means the gate did NOT short-circuit.
const PAST_GATE = "REACHED_PAST_GATE";
function throwPastGate(): never {
  throw new Error(PAST_GATE);
}

// Routers read `ctx.db`, which is whatever we pass into createCaller. We pass
// the SAME fake db object the mock exports so the chainable/query/transaction
// hooks above are the ones the procedures hit.
import { db as mockedDb } from "@/server/db";
function callerWithDb(userId = "user-1") {
  return createCaller({
    db: mockedDb,
    session: { user: { id: userId } } as never,
    headers: new Headers(),
  });
}

const PAST = "2000-01-01T00:00:00.000Z"; // far in the past relative to now
const FUTURE = "2999-01-01T00:00:00.000Z"; // far in the future (open)

beforeEach(() => {
  // Reset hooks to safe defaults between tests.
  dbHooks.selectResult = () => [];
  dbHooks.enrollmentFindFirst = async () => undefined;
  dbHooks.transaction = async () => {
    throw new Error("TRANSACTION_NOT_STUBBED");
  };
  payloadHooks.findByID = async () => {
    throw new Error("findByID not stubbed");
  };
  payloadHooks.find = async () => ({ docs: [] });
});

// ── createTeam — REGISTRATION gate ──────────────────────────────────────────

describe("createTeam registration deadline enforcement", () => {
  it("throws FORBIDDEN when the registration deadline is in the past", async () => {
    // boundHackathonEvent → payload.find returns a hackathon event whose
    // registrationDeadline is past.
    payloadHooks.find = async ({ collection }) => {
      expect(collection).toBe("events");
      return { docs: [{ id: 42, registrationDeadline: PAST }] };
    };

    await expect(
      callerWithDb().teams.createTeam({ challengeId: 1, name: "Team" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Registration for this hackathon has closed.",
      cause: { deadlineReason: "registration_closed" },
    });
  });

  it("proceeds PAST the gate when the registration deadline is unset", async () => {
    payloadHooks.find = async () => ({
      docs: [{ id: 42, registrationDeadline: null }],
    });
    // After the gate, createTeam calls payload.findByID (challenge) then
    // assertNotAlreadyOnTeam (db.query.challengeEnrollments.findFirst). We make
    // that next step throw the sentinel: reaching it proves the gate passed.
    payloadHooks.findByID = async () => throwPastGate();

    await expect(
      callerWithDb().teams.createTeam({ challengeId: 1, name: "Team" }),
    ).rejects.toThrow(PAST_GATE);
  });

  it("also proceeds when the registration deadline is in the future (open)", async () => {
    payloadHooks.find = async () => ({
      docs: [{ id: 42, registrationDeadline: FUTURE }],
    });
    payloadHooks.findByID = async () => throwPastGate();

    await expect(
      callerWithDb().teams.createTeam({ challengeId: 1, name: "Team" }),
    ).rejects.toThrow(PAST_GATE);
  });
});

// ── joinTeam — REGISTRATION gate (shares the gate; lighter coverage) ─────────

describe("joinTeam registration deadline enforcement", () => {
  it("throws FORBIDDEN when the registration deadline is in the past", async () => {
    // joinTeam first selects the team by joinCode (db.select), then fetches the
    // event by id (payload.findByID), then runs the registration gate.
    dbHooks.selectResult = () => [
      { id: "team-1", eventId: 42, challengeId: 1, status: "forming", maxSize: 5 },
    ];
    payloadHooks.findByID = async ({ collection }) => {
      expect(collection).toBe("events");
      return { id: 42, registrationDeadline: PAST };
    };

    await expect(
      callerWithDb().teams.joinTeam({ joinCode: "ABC123" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      cause: { deadlineReason: "registration_closed" },
    });
  });

  it("proceeds PAST the gate when the registration deadline is unset", async () => {
    dbHooks.selectResult = () => [
      { id: "team-1", eventId: 42, challengeId: 1, status: "forming", maxSize: 5 },
    ];
    payloadHooks.findByID = async () => ({ id: 42, registrationDeadline: null });
    // Next step after the gate is assertNotAlreadyOnTeam → enrollment.findFirst.
    dbHooks.enrollmentFindFirst = async () => throwPastGate();

    await expect(
      callerWithDb().teams.joinTeam({ joinCode: "ABC123" }),
    ).rejects.toThrow(PAST_GATE);
  });
});

// ── submitTeam — SUBMISSION gate ────────────────────────────────────────────

describe("submitTeam submission deadline enforcement", () => {
  // submitTeam fetches the team (must be the captain, status "locked", not yet
  // submitted) BEFORE the submission gate, so the fake team must satisfy those.
  function lockedTeamRow(userId: string) {
    return {
      id: "team-1",
      eventId: 42,
      challengeId: 1,
      captainId: userId,
      status: "locked",
      submittedAt: null,
      maxSize: 5,
    };
  }

  it("throws FORBIDDEN when the submission deadline is in the past", async () => {
    dbHooks.selectResult = () => [lockedTeamRow("user-1")];
    payloadHooks.findByID = async ({ collection }) => {
      expect(collection).toBe("events");
      return { id: 42, submissionDeadline: PAST };
    };

    await expect(
      callerWithDb().teams.submitTeam({ teamId: "team-1" }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "The submission deadline for this hackathon has passed.",
      cause: { deadlineReason: "submission_closed" },
    });
  });

  it("proceeds PAST the gate when the submission deadline is unset", async () => {
    // First select returns the locked team; the post-gate update select then
    // throws the sentinel to prove we passed the gate.
    let call = 0;
    dbHooks.selectResult = () => {
      call += 1;
      if (call === 1) return [lockedTeamRow("user-1")];
      return throwPastGate();
    };
    payloadHooks.findByID = async () => ({ id: 42, submissionDeadline: null });
    // The post-gate write is db.update(...), not db.select(...). Route update
    // through a throwing builder too.
    (mockedDb as unknown as { update: () => unknown }).update = () =>
      throwPastGate();

    await expect(
      callerWithDb().teams.submitTeam({ teamId: "team-1" }),
    ).rejects.toThrow(PAST_GATE);
  });
});

// ── submitRankings — JUDGING gate ───────────────────────────────────────────

describe("submitRankings judging deadline enforcement", () => {
  // submitRankings path to the gate:
  //   requireHackathonJudge → loadChallenge (payload.findByID, judgingOpenedAt
  //     must be set) + loadHackathonGrants (db.select on hackathonStaff → must
  //     contain an active judge grant)
  //   → boundHackathonEvent (payload.find: the hackathon event w/ judgingDeadline)
  //   → isJudgingOpen gate.
  function stubJudgeAuthorized(judgingDeadline: string | null) {
    payloadHooks.findByID = async ({ collection }) => {
      expect(collection).toBe("challenges");
      // requireHackathonJudge needs judgingOpenedAt truthy to pass the
      // "Judging is not open yet" BAD_REQUEST before the deadline gate.
      return { id: 1, judgingOpenedAt: "2024-01-01T00:00:00.000Z" };
    };
    // loadHackathonGrants does db.select(...).from(hackathonStaff)... → return
    // an active (non-revoked) judge grant.
    dbHooks.selectResult = () => [{ role: "judge", revokedAt: null }];
    // boundHackathonEvent → payload.find returns the hackathon event.
    payloadHooks.find = async ({ collection }) => {
      expect(collection).toBe("events");
      return { docs: [{ id: 42, judgingDeadline }] };
    };
  }

  it("throws FORBIDDEN when the judging deadline is in the past", async () => {
    stubJudgeAuthorized(PAST);

    await expect(
      callerWithDb().hackathon.submitRankings({
        challengeId: 1,
        rankings: [{ teamId: "team-1", rank: 1 }],
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "The judging deadline for this hackathon has passed.",
      cause: { deadlineReason: "judging_closed" },
    });
  });

  it("proceeds PAST the gate when the judging deadline is unset", async () => {
    // judging deadline unset ⇒ gate is open. The next step (select submitted
    // teams) reuses db.select — make the SECOND select throw the sentinel
    // (the first select is loadHackathonGrants).
    payloadHooks.findByID = async () => ({
      id: 1,
      judgingOpenedAt: "2024-01-01T00:00:00.000Z",
    });
    payloadHooks.find = async () => ({ docs: [{ id: 42, judgingDeadline: null }] });
    let call = 0;
    dbHooks.selectResult = () => {
      call += 1;
      if (call === 1) return [{ role: "judge", revokedAt: null }]; // grants
      return throwPastGate(); // post-gate: submitted-teams query
    };

    await expect(
      callerWithDb().hackathon.submitRankings({
        challengeId: 1,
        rankings: [{ teamId: "team-1", rank: 1 }],
      }),
    ).rejects.toThrow(PAST_GATE);
  });

  it("does NOT throw FORBIDDEN when the bound event is absent (no enforced window)", async () => {
    // submitRankings only runs the gate `if (event)`. With no bound event the
    // judging gate is skipped entirely — must not surface a deadline FORBIDDEN.
    payloadHooks.findByID = async () => ({
      id: 1,
      judgingOpenedAt: "2024-01-01T00:00:00.000Z",
    });
    payloadHooks.find = async () => ({ docs: [] }); // boundHackathonEvent → null
    let call = 0;
    dbHooks.selectResult = () => {
      call += 1;
      if (call === 1) return [{ role: "judge", revokedAt: null }];
      return throwPastGate();
    };

    await expect(
      callerWithDb().hackathon.submitRankings({
        challengeId: 1,
        rankings: [{ teamId: "team-1", rank: 1 }],
      }),
    ).rejects.toThrow(PAST_GATE);
  });
});
